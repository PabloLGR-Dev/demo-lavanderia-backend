import { Request, Response } from 'express';
import { eq, ilike } from 'drizzle-orm';
import { db } from '../db/index.js';
import * as schema from '../db/schema.js';

// --- HELPER DE ZONA HORARIA (República Dominicana UTC-4) ---
const getDRDateTime = () => {
    const options: Intl.DateTimeFormatOptions = { 
        timeZone: 'America/Santo_Domingo',
        year: 'numeric', month: '2-digit', day: '2-digit',
        hour: '2-digit', minute: '2-digit', second: '2-digit',
        hour12: false 
    };
    const parts = new Intl.DateTimeFormat('en-US', options).formatToParts(new Date());
    const map = Object.fromEntries(parts.map(({ type, value }) => [type, value]));
    const hour = map.hour === '24' ? '00' : map.hour;
    return `${map.year}-${map.month}-${map.day}T${hour}:${map.minute}:${map.second}`;
};

// Helper local para obtener booleanos de forma segura
const getConfigBool = async (clave: string): Promise<boolean> => {
    const config = await db.select().from(schema.configuraciones).where(eq(schema.configuraciones.clave, clave));
    if (config.length === 0) return false;
    return config[0].valor.toLowerCase() === 'true';
};

// ==========================================
// MÉTODOS EXISTENTES
// ==========================================
export const getConfiguracionesGenerales = async (req: Request, res: Response) => {
    try {
        const controlStock = await getConfigBool("CONTROL_STOCK_ACTIVO");
        const controlEntregas = await getConfigBool("CONTROL_ENTREGAS_ACTIVO");

        res.json({
            controlStockActivo: controlStock,
            controlEntregasActivo: controlEntregas
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Error obteniendo configuraciones generales' });
    }
};

export const toggleControlStock = async (req: Request, res: Response) => {
    try {
        const valorActual = await getConfigBool("CONTROL_STOCK_ACTIVO");
        const nuevoValor = (!valorActual).toString().toLowerCase();

        await db.update(schema.configuraciones)
            .set({ 
                valor: nuevoValor,
                fechaultimaactualizacion: getDRDateTime()
            })
            .where(eq(schema.configuraciones.clave, "CONTROL_STOCK_ACTIVO"));

        res.json({
            mensaje: `Control de stock ${nuevoValor === 'true' ? 'activado' : 'desactivado'}`,
            activo: nuevoValor === 'true'
        });
    } catch (error) {
         res.status(500).json({ error: 'Error al cambiar configuración' });
    }
};

export const toggleControlEntregas = async (req: Request, res: Response) => {
    try {
        const valorActual = await getConfigBool("CONTROL_ENTREGAS_ACTIVO");
        const nuevoValor = (!valorActual).toString().toLowerCase();

        await db.update(schema.configuraciones)
            .set({ 
                valor: nuevoValor,
                fechaultimaactualizacion: getDRDateTime()
            })
            .where(eq(schema.configuraciones.clave, "CONTROL_ENTREGAS_ACTIVO"));

        res.json({
            mensaje: `Control de entregas ${nuevoValor === 'true' ? 'activado' : 'desactivado'}`,
            activo: nuevoValor === 'true'
        });
    } catch (error) {
         res.status(500).json({ error: 'Error al cambiar configuración' });
    }
};

// ==========================================
// NUEVOS MÉTODOS CRUD GENÉRICOS (PARA DIVISAS)
// ==========================================
export const getAllConfiguraciones = async (req: Request, res: Response) => {
    try {
        const configuraciones = await db.select().from(schema.configuraciones);
        res.json(configuraciones);
    } catch (error) {
        res.status(500).json({ error: 'Error al obtener configuraciones' });
    }
};

export const createConfiguracion = async (req: Request, res: Response) => {
    try {
        const { clave, valor, descripcion, tipodato } = req.body;

        const existe = await db.select().from(schema.configuraciones).where(ilike(schema.configuraciones.clave, clave.trim()));
        if (existe.length > 0) {
            return res.status(400).json({ message: "La clave de configuración ya existe" });
        }

        const nueva = await db.insert(schema.configuraciones).values({
            clave: clave.trim().toUpperCase(),
            valor: String(valor),
            descripcion: descripcion?.trim() || null,
            tipodato: tipodato || 'texto',
            fechacreacion: getDRDateTime(),
            fechaultimaactualizacion: getDRDateTime()
        }).returning();

        res.status(201).json(nueva[0]);
    } catch (error: any) {
        res.status(500).json({ message: "Error al crear configuración", error: error.message });
    }
};

export const updateConfiguracionByKey = async (req: Request, res: Response) => {
    try {
        const { claveParam } = req.params;
        const { valor, descripcion, tipodato } = req.body;

        const claveString = String(claveParam);

        const actualizada = await db.update(schema.configuraciones).set({
            valor: String(valor),
            ...(descripcion !== undefined && { descripcion: descripcion?.trim() }),
            ...(tipodato && { tipodato: tipodato }),
            fechaultimaactualizacion: getDRDateTime()
        })
        .where(ilike(schema.configuraciones.clave, claveString))
        .returning();

        if (actualizada.length === 0) return res.status(404).json({ message: 'Configuración no encontrada' });

        res.json(actualizada[0]);
    } catch (error: any) {
        res.status(500).json({ message: "Error al actualizar configuración", error: error.message });
    }
};