import { Request, Response } from 'express';
import { eq, ilike, and, gte, lte, desc, sql, or } from 'drizzle-orm';
import { db } from '../db/index.js';
import * as schema from '../db/schema.js';
import { AuthRequest } from '../middlewares/auth.middleware.js';

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

const getDRDateOnly = () => {
    return getDRDateTime().substring(0, 10);
};

export const getGastosResumen = async (req: Request, res: Response) => {
    try {
        const { categoriaId, fechaDesde, fechaHasta, search, page = 1, pageSize = 20 } = req.query;
        const currentPage = Math.max(1, Number(page));
        const limit = Math.max(1, Number(pageSize));
        const offset = (currentPage - 1) * limit;

        const filters = [];

        if (categoriaId) filters.push(eq(schema.gastos.idcategoriagasto, Number(categoriaId)));
        
        // Literal String matching, sin new Date()
        if (fechaDesde) filters.push(gte(schema.gastos.fechagasto, `${fechaDesde}T00:00:00`));
        if (fechaHasta) filters.push(lte(schema.gastos.fechagasto, `${fechaHasta}T23:59:59`));
        
        if (search) {
            const searchStr = `%${search}%`;
            filters.push(
                or(
                    ilike(schema.gastos.descripcion, searchStr),
                    ilike(schema.gastos.referencia, searchStr)
                )!
            );
        }

        const whereClause = filters.length > 0 ? and(...filters) : undefined;

        const countResult = await db.select({ count: sql<number>`count(*)` })
            .from(schema.gastos)
            .where(whereClause);
        const totalRecords = Number(countResult[0]?.count) || 0;

        const gastosDb = await db.select({
            gasto: schema.gastos,
            categoriaNombre: schema.categoriasgasto.nombre,
            categoriaColor: schema.categoriasgasto.color,
            usuarioNombre: schema.usuarios.nombre,
            estadoNombre: schema.estados.nombre
        })
        .from(schema.gastos)
        .innerJoin(schema.categoriasgasto, eq(schema.gastos.idcategoriagasto, schema.categoriasgasto.idcategoriagasto))
        .innerJoin(schema.usuarios, eq(schema.gastos.idusuario, schema.usuarios.idusuario))
        .innerJoin(schema.estados, eq(schema.gastos.idestado, schema.estados.idestado))
        .where(whereClause)
        .orderBy(desc(schema.gastos.fechagasto))
        .limit(limit)
        .offset(offset);

        const data = gastosDb.map(g => ({
            idGasto: g.gasto.idgasto,
            categoria: g.categoriaNombre,
            categoriaColor: g.categoriaColor || '#6B7280',
            monto: Number(g.gasto.monto),
            fechaGasto: g.gasto.fechagasto ? g.gasto.fechagasto.replace(" ", "T") : null,
            descripcion: g.gasto.descripcion,
            referencia: g.gasto.referencia,
            comprobanteUrl: g.gasto.comprobanteurl,
            usuario: g.usuarioNombre,
            estado: g.estadoNombre,
            fechaCreacion: g.gasto.fechacreacion ? g.gasto.fechacreacion.replace(" ", "T") : null
        }));

        res.json({
            data,
            pagination: {
                page: currentPage,
                pageSize: limit,
                totalRecords,
                totalPages: Math.ceil(totalRecords / limit),
                hasPreviousPage: currentPage > 1,
                hasNextPage: currentPage < Math.ceil(totalRecords / limit)
            }
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Error al obtener gastos' });
    }
};

export const getGastoById = async (req: Request, res: Response) => {
    try {
        const gasto = await db.select({
            gasto: schema.gastos,
            categoria: schema.categoriasgasto.nombre,
            categoriaColor: schema.categoriasgasto.color,
            usuario: schema.usuarios.nombre,
            estado: schema.estados.nombre
        })
        .from(schema.gastos)
        .innerJoin(schema.categoriasgasto, eq(schema.gastos.idcategoriagasto, schema.categoriasgasto.idcategoriagasto))
        .innerJoin(schema.usuarios, eq(schema.gastos.idusuario, schema.usuarios.idusuario))
        .innerJoin(schema.estados, eq(schema.gastos.idestado, schema.estados.idestado))
        .where(eq(schema.gastos.idgasto, Number(req.params.id)));

        if (gasto.length === 0) return res.status(404).json({ message: 'Gasto no encontrado' });

        const g = gasto[0];
        res.json({
            idGasto: g.gasto.idgasto,
            categoria: g.categoria,
            categoriaColor: g.categoriaColor || '#6B7280',
            monto: Number(g.gasto.monto),
            fechaGasto: g.gasto.fechagasto ? g.gasto.fechagasto.replace(" ", "T") : null,
            descripcion: g.gasto.descripcion,
            referencia: g.gasto.referencia,
            comprobanteUrl: g.gasto.comprobanteurl,
            usuario: g.usuario,
            estado: g.estado,
            fechaCreacion: g.gasto.fechacreacion ? g.gasto.fechacreacion.replace(" ", "T") : null
        });
    } catch (error) {
        res.status(500).json({ error: 'Error interno' });
    }
};

export const createGasto = async (req: AuthRequest, res: Response) => {
    try {
        const userId = Number(req.user.nameid);
        const dto = req.body;

        const hoyStr = getDRDateTime(); // YYYY-MM-DDTHH:mm:ss
        
        let fechaGastoFormat = hoyStr;
        if (dto.fechaGasto) {
            // dto.fechaGasto viene del Frontend literal (Ej: "2026-04-09")
            fechaGastoFormat = `${dto.fechaGasto}T${hoyStr.split("T")[1]}`;
        }

        const categoria = await db.select().from(schema.categoriasgasto).where(eq(schema.categoriasgasto.idcategoriagasto, dto.idCategoriaGasto));
        if (categoria.length === 0) return res.status(400).json({ message: "Categoría no encontrada" });

        const nuevoGasto = await db.insert(schema.gastos).values({
            idcategoriagasto: dto.idCategoriaGasto,
            monto: String(dto.monto),
            fechagasto: fechaGastoFormat,
            descripcion: dto.descripcion?.trim() || null,
            referencia: dto.referencia?.trim() || null,
            comprobanteurl: dto.comprobanteUrl?.trim() || null,
            idusuario: userId,
            idestado: dto.idEstado || 1,
            fechacreacion: hoyStr,
            fechaultimaactualizacion: hoyStr
        }).returning();

        res.status(201).json(nuevoGasto[0]);
    } catch (error: any) {
        res.status(400).json({ message: error.message || "Error al crear gasto" });
    }
};

export const updateGasto = async (req: Request, res: Response) => {
    try {
        const id = Number(req.params.id);
        const dto = req.body;
        const hoyStr = getDRDateTime();

        let fechaGastoFormat = undefined;
        if (dto.fechaGasto) {
            fechaGastoFormat = `${dto.fechaGasto}T${hoyStr.split("T")[1]}`;
        }

        const actualizado = await db.update(schema.gastos).set({
            ...(dto.idCategoriaGasto && { idcategoriagasto: dto.idCategoriaGasto }),
            ...(dto.monto && { monto: String(dto.monto) }),
            ...(fechaGastoFormat && { fechagasto: fechaGastoFormat }),
            ...(dto.descripcion !== undefined && { descripcion: dto.descripcion?.trim() || null }),
            ...(dto.referencia !== undefined && { referencia: dto.referencia?.trim() || null }),
            ...(dto.comprobanteUrl !== undefined && { comprobanteurl: dto.comprobanteUrl?.trim() || null }),
            ...(dto.idEstado && { idestado: dto.idEstado }),
            fechaultimaactualizacion: hoyStr
        })
        .where(eq(schema.gastos.idgasto, id))
        .returning();

        if (actualizado.length === 0) return res.status(404).json({ message: 'Gasto no encontrado' });

        res.json(actualizado[0]);
    } catch (error) {
        res.status(500).json({ error: 'Error al actualizar gasto' });
    }
};

export const deleteGasto = async (req: Request, res: Response) => {
    try {
        const eliminado = await db.delete(schema.gastos).where(eq(schema.gastos.idgasto, Number(req.params.id))).returning();
        if (eliminado.length === 0) return res.status(404).json({ message: 'Gasto no encontrado' });
        res.status(204).send();
    } catch (error) {
        res.status(500).json({ error: 'Error al eliminar gasto' });
    }
};

export const getResumenFinanciero = async (req: Request, res: Response) => {
    try {
        const { fechaDesde, fechaHasta } = req.query;
        
        const hoyStr = getDRDateOnly();
        const year = hoyStr.substring(0, 4);
        const month = hoyStr.substring(5, 7);
        const lastDay = new Date(Number(year), Number(month), 0).getDate();

        const desdeStr = fechaDesde ? `${fechaDesde}T00:00:00` : `${year}-${month}-01T00:00:00`;
        const hastaStr = fechaHasta ? `${fechaHasta}T23:59:59` : `${year}-${month}-${lastDay}T23:59:59`;

        const facturas = await db.select({ montoAbonado: schema.facturas.montoabonado })
            .from(schema.facturas)
            .where(and(
                gte(schema.facturas.fechacreacion, desdeStr.replace("T", " ")),
                lte(schema.facturas.fechacreacion, hastaStr.replace("T", " "))
            ));
        
        const totalIngresos = facturas.reduce((sum, f) => sum + Number(f.montoAbonado || 0), 0);

        const gastosDb = await db.select({ monto: schema.gastos.monto })
            .from(schema.gastos)
            .where(and(
                gte(schema.gastos.fechagasto, desdeStr.replace("T", " ")),
                lte(schema.gastos.fechagasto, hastaStr.replace("T", " "))
            ));

        const totalGastos = gastosDb.reduce((sum, g) => sum + Number(g.monto), 0);

        const gananciaNeta = totalIngresos - totalGastos;
        const margenGanancia = totalIngresos > 0 ? (gananciaNeta / totalIngresos * 100) : 0;

        res.json({
            totalIngresos,
            totalGastos,
            gananciaNeta,
            margenGanancia,
            fechaDesde: desdeStr,
            fechaHasta: hastaStr
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Error al calcular el resumen financiero' });
    }
};