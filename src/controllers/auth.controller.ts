import { Request, Response } from 'express';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import { eq, and, or } from 'drizzle-orm';
import { db } from '../db/index.js';
import * as schema from '../db/schema.js';
import { sendPasswordResetEmailAsync } from '../services/email.service.js';
import { DEMO_MODE, demoStore } from '../demo/store.js';

// Extendemos Request para el middleware (ruta /me)
export interface AuthRequest extends Request {
    user?: any;
}

// Configuración de JWT
const JWT_SECRET = process.env.JWT_SECRET || 'super-secreta-clave-de-respaldo-123';
const TOKEN_EXPIRATION_HOURS = 6;

// 1. LOGIN
export const login = async (req: Request, res: Response) => {
    try {
        const { usernameOrEmail, password } = req.body;

        if (!usernameOrEmail || !password) {
            return res.status(400).json({ message: 'Usuario/Email y contraseña son requeridos' });
        }

        // Buscar al usuario por username o email
        const isEmail = usernameOrEmail.includes('@');
        const userQuery = await db.select()
            .from(schema.usuarios)
            .where(
                and(
                    eq(schema.usuarios.idestado, 1), // Solo usuarios activos
                    isEmail 
                        ? eq(schema.usuarios.email, usernameOrEmail)
                        : eq(schema.usuarios.username, usernameOrEmail)
                )
            );

        if (userQuery.length === 0) {
            return res.status(401).json({ success: false, message: 'Credenciales inválidas' });
        }

        const user = userQuery[0];

        // Verificar la contraseña con bcrypt
        const validPassword = await bcrypt.compare(password, user.passwordhash);
        if (!validPassword) {
            return res.status(401).json({ success: false, message: 'Credenciales inválidas' });
        }

        // Buscar los roles del usuario
        const rolesQuery = await db.select({ 
            idRol: schema.roles.idrol, 
            nombre: schema.roles.nombre 
        })
        .from(schema.usuariorol)
        .innerJoin(schema.roles, eq(schema.usuariorol.idrol, schema.roles.idrol))
        .where(eq(schema.usuariorol.idusuario, user.idusuario));

        const roleNames = rolesQuery.map(r => r.nombre);
        const primerRolId = rolesQuery.length > 0 ? rolesQuery[0].idRol : null;

        // Generar Access Token
        const accessToken = jwt.sign(
            { 
                nameid: user.idusuario.toString(), 
                unique_name: user.username,
                role: roleNames 
            }, 
            JWT_SECRET, 
            { expiresIn: `${TOKEN_EXPIRATION_HOURS}h` }
        );

        // Generar Refresh Token
        const refreshToken = crypto.randomBytes(64).toString('base64');
        const expireDate = new Date();
        expireDate.setDate(expireDate.getDate() + 7); // Expira en 7 días

        // Guardar Refresh Token en DB
        await db.insert(schema.refreshtokens).values({
            idusuario: user.idusuario,
            token: refreshToken,
            expires: expireDate.toISOString(),
            created: new Date().toISOString(),
            createdbyip: req.ip || 'unknown'
        });

        // Actualizar fecha de último login
        await db.update(schema.usuarios)
            .set({ fechaultimologin: new Date().toISOString() })
            .where(eq(schema.usuarios.idusuario, user.idusuario));

        // Retornar exactamente lo que el frontend espera (LoginResponse)
        res.json({
            success: true,
            accessToken,
            refreshToken,
            expires: new Date(Date.now() + TOKEN_EXPIRATION_HOURS * 60 * 60 * 1000).toISOString(),
            user: {
                idUsuario: user.idusuario,
                nombre: user.nombre,
                apellido: user.apellido,
                email: user.email,
                username: user.username,
                fechaUltimoLogin: user.fechaultimologin,
                fechaCreacion: user.fechacreacion,
                idEstado: user.idestado,
                estaActivo: true
            },
            roles: roleNames,
            idRol: primerRolId,
            message: 'Login exitoso'
        });

    } catch (error) {
        console.error('Error en login:', error);
        res.status(500).json({ message: 'Error interno del servidor' });
    }
};

// 2. ME (Devuelve el usuario actual basado en el token)
export const me = async (req: AuthRequest, res: Response) => {
    try {
        if (!req.user || !req.user.nameid) {
            return res.status(401).json({ message: 'No autenticado' });
        }

        const userId = Number(req.user.nameid);

        const userQuery = await db.select()
            .from(schema.usuarios)
            .where(eq(schema.usuarios.idusuario, userId));

        if (userQuery.length === 0) {
            return res.status(404).json({ message: 'Usuario no encontrado' });
        }

        const user = userQuery[0];

        res.json({
            idUsuario: user.idusuario,
            nombre: user.nombre,
            apellido: user.apellido,
            email: user.email,
            username: user.username,
            fechaUltimoLogin: user.fechaultimologin,
            fechaCreacion: user.fechacreacion,
            idEstado: user.idestado,
            estaActivo: user.idestado === 1
        });
    } catch (error) {
        console.error('Error en /me:', error);
        res.status(500).json({ message: 'Error obteniendo datos del usuario' });
    }
};

// Helper para obtener fecha actual de RD, permitiendo sumar minutos
const getDRDateTime = (addMinutes: number = 0) => {
    const d = new Date();
    d.setMinutes(d.getMinutes() + addMinutes);
    const options: Intl.DateTimeFormatOptions = { 
        timeZone: 'America/Santo_Domingo',
        year: 'numeric', month: '2-digit', day: '2-digit',
        hour: '2-digit', minute: '2-digit', second: '2-digit',
        hour12: false 
    };
    const parts = new Intl.DateTimeFormat('en-US', options).formatToParts(d);
    const map = Object.fromEntries(parts.map(({ type, value }) => [type, value]));
    const hour = map.hour === '24' ? '00' : map.hour;
    return `${map.year}-${map.month}-${map.day}T${hour}:${map.minute}:${map.second}`;
};

// Generador de código aleatorio de 6 dígitos
const generateRandomToken = () => {
    return Math.floor(100000 + Math.random() * 900000).toString();
};

// ==========================================
// RECUPERACIÓN DE CONTRASEÑA
// ==========================================

export const forgotPassword = async (req: Request, res: Response) => {
    try {
        const { email } = req.body;
        
        if (!email) {
            return res.status(400).json({ message: "El correo es requerido" });
        }

        const usuariosQuery = await db.select().from(schema.usuarios).where(eq(schema.usuarios.email, email));
        
        // Respondemos igual aunque no exista el correo por seguridad
        if (usuariosQuery.length === 0) {
            return res.json({ message: "Si el correo está registrado, se enviará un código de recuperación." });
        }

        const usuario = usuariosQuery[0];
        const resetToken = generateRandomToken();
        const expireTime = getDRDateTime(30); // Expira en 30 minutos

        await db.update(schema.usuarios)
            .set({ 
                passwordresettoken: resetToken,
                passwordresettokenexpiry: expireTime
            })
            .where(eq(schema.usuarios.idusuario, usuario.idusuario));

        const emailEnviado = await sendPasswordResetEmailAsync(
            usuario.email!, 
            `${usuario.nombre} ${usuario.apellido || ''}`.trim(), 
            resetToken
        );

        if (!emailEnviado) {
            return res.status(500).json({ message: "Hubo un problema enviando el correo de recuperación." });
        }

        res.json({ message: "Si el correo está registrado, se enviará un código de recuperación." });
    } catch (error) {
        console.error("Error en forgotPassword:", error);
        res.status(500).json({ message: "Error interno del servidor" });
    }
};

export const validateResetToken = async (req: Request, res: Response) => {
    try {
        const { email, token } = req.body;

        if (!email || !token) {
            return res.status(400).json({ message: "Email y Token son requeridos" });
        }

        const usuariosQuery = await db.select().from(schema.usuarios).where(eq(schema.usuarios.email, email));
        
        if (usuariosQuery.length === 0) {
            return res.status(400).json({ message: "Token inválido o expirado" });
        }

        const usuario = usuariosQuery[0];
        const ahora = getDRDateTime();
        
        // Normalizar el formato de fecha de Postgres reemplazando el espacio por 'T'
        const fechaExpiracionDB = usuario.passwordresettokenexpiry 
            ? usuario.passwordresettokenexpiry.replace(' ', 'T') 
            : '';
        
        // Comparamos el token asegurándonos de que no tenga espacios extra
        if (usuario.passwordresettoken !== token.trim() || !fechaExpiracionDB || fechaExpiracionDB < ahora) {
            return res.status(400).json({ message: "Token inválido o expirado" });
        }

        res.json({ valid: true, message: "Token validado correctamente" });
    } catch (error) {
        console.error("Error en validateResetToken:", error);
        res.status(500).json({ message: "Error interno del servidor" });
    }
};

export const logout = async (req: AuthRequest, res: Response) => {
    try {
        if (DEMO_MODE && req.user?.nameid) {
            demoStore.clearSession(Number(req.user.nameid));
        }

        const authHeader = req.headers.authorization;
        if (authHeader?.startsWith('Bearer ')) {
            const token = authHeader.split(' ')[1];
            await db.update(schema.refreshtokens)
                .set({ revoked: new Date().toISOString(), revokedbyip: req.ip || 'unknown' })
                .where(eq(schema.refreshtokens.idusuario, Number(req.user?.nameid)));
        }

        res.json({ message: 'Sesión cerrada correctamente' });
    } catch {
        res.json({ message: 'Sesión cerrada correctamente' });
    }
};

export const resetPassword = async (req: Request, res: Response) => {
    if (DEMO_MODE) {
        return res.status(403).json({
            message: 'Modo demo: el cambio de contrasena no esta permitido. Esta es una version de demostracion del sistema.'
        });
    }

    try {
        const { email, token, newPassword, confirmPassword } = req.body;

        if (!email || !token || !newPassword || !confirmPassword) {
            return res.status(400).json({ message: "Todos los campos son requeridos" });
        }

        if (newPassword !== confirmPassword) {
            return res.status(400).json({ message: "Las contraseñas no coinciden" });
        }

        if (newPassword.length < 8) {
            return res.status(400).json({ message: "La contraseña debe tener al menos 8 caracteres" });
        }

        const usuariosQuery = await db.select().from(schema.usuarios).where(eq(schema.usuarios.email, email));
        
        if (usuariosQuery.length === 0) {
            return res.status(400).json({ message: "Token inválido o expirado" });
        }

        const usuario = usuariosQuery[0];
        const ahora = getDRDateTime();
        
        // Normalizamos la fecha para la validación final
        const fechaExpiracionDB = usuario.passwordresettokenexpiry 
            ? usuario.passwordresettokenexpiry.replace(' ', 'T') 
            : '';
        
        if (usuario.passwordresettoken !== token.trim() || !fechaExpiracionDB || fechaExpiracionDB < ahora) {
            return res.status(400).json({ message: "Token inválido o expirado" });
        }

        // Encriptar nueva contraseña
        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(newPassword, salt);

        // Actualizar contraseña y limpiar tokens. 
        // fechaultimaactualizacion no existe en la tabla usuarios.
        await db.update(schema.usuarios)
            .set({ 
                passwordhash: hashedPassword,
                passwordresettoken: null,
                passwordresettokenexpiry: null
            })
            .where(eq(schema.usuarios.idusuario, usuario.idusuario));

        res.json({ message: "Contraseña actualizada exitosamente" });

    } catch (error) {
        console.error("Error en resetPassword:", error);
        res.status(500).json({ message: "Error interno del servidor" });
    }
};