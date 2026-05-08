import { Request, Response } from 'express';
import { eq, ilike, inArray } from 'drizzle-orm';
import { db } from '../db/index.js';
import * as schema from '../db/schema.js';
import { DEMO_MODE, demoStore, isDemoId } from '../demo/store.js';

export const getPrendas = async (req: Request, res: Response) => {
    try {
        const { search } = req.query;
        let query = db.select().from(schema.prendas).$dynamic();
        if (search) query = query.where(ilike(schema.prendas.nombre, `%${search}%`));

        const prendasBase = await query.orderBy(schema.prendas.nombre);

        let result: any[] = [];

        if (prendasBase.length > 0) {
            const idsPrendas = prendasBase.map(p => p.idprenda);
            const serviciosDb = await db.select({
                idPrenda: schema.prendaservicio.idprenda,
                idPrendaServicio: schema.prendaservicio.idprendaservicio,
                idServicio: schema.prendaservicio.idservicio,
                precioUnitario: schema.prendaservicio.preciounitario,
                nombreServicio: schema.servicios.nombre
            })
            .from(schema.prendaservicio)
            .innerJoin(schema.servicios, eq(schema.prendaservicio.idservicio, schema.servicios.idservicio))
            .where(inArray(schema.prendaservicio.idprenda, idsPrendas));

            const serviciosPorPrenda: Record<number, any[]> = {};
            serviciosDb.forEach(s => {
                if (!serviciosPorPrenda[s.idPrenda]) serviciosPorPrenda[s.idPrenda] = [];
                serviciosPorPrenda[s.idPrenda].push({
                    idPrendaServicio: s.idPrendaServicio,
                    idServicio: s.idServicio,
                    nombreServicio: s.nombreServicio,
                    precioUnitario: Number(s.precioUnitario)
                });
            });

            result = prendasBase.map(p => ({
                idPrenda: p.idprenda,
                nombre: p.nombre,
                descripcion: p.descripcion,
                cantidadServicios: serviciosPorPrenda[p.idprenda]?.length || 0,
                servicios: serviciosPorPrenda[p.idprenda] || []
            }));
        }

        if (DEMO_MODE) {
            const userId = Number((req as any).user?.nameid);
            let demoPrendas = demoStore.getPrendas(userId);
            if (search) {
                const s = (search as string).toLowerCase();
                demoPrendas = demoPrendas.filter(p => p.nombre.toLowerCase().includes(s));
            }
            const demoItems = demoPrendas.map(p => {
                const servicios = demoStore.getPrendasServiciosByPrenda(userId, p.idprenda).map(ps => ({
                    idPrendaServicio: ps.idprendaservicio,
                    idServicio: ps.idservicio,
                    nombreServicio: ps.nombreServicio,
                    precioUnitario: Number(ps.preciounitario)
                }));
                return {
                    idPrenda: p.idprenda,
                    nombre: p.nombre,
                    descripcion: p.descripcion,
                    cantidadServicios: servicios.length,
                    servicios,
                };
            });
            result = [...demoItems, ...result];
        }

        res.json(result);
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Error al obtener prendas' });
    }
};

export const getPrendaById = async (req: Request, res: Response) => {
    try {
        const idNum = Number(req.params.id);

        if (DEMO_MODE && isDemoId(idNum)) {
            const userId = Number((req as any).user?.nameid);
            const prenda = demoStore.getPrendaById(userId, idNum);
            if (!prenda) return res.status(404).json({ message: 'Prenda no encontrada' });
            const servicios = demoStore.getPrendasServiciosByPrenda(userId, idNum).map(ps => ({
                idPrendaServicio: ps.idprendaservicio,
                idServicio: ps.idservicio,
                nombreServicio: ps.nombreServicio,
                precioUnitario: Number(ps.preciounitario)
            }));
            return res.json({
                idPrenda: prenda.idprenda,
                nombre: prenda.nombre,
                descripcion: prenda.descripcion,
                cantidadServicios: servicios.length,
                servicios,
            });
        }

        const prendas = await db.select().from(schema.prendas).where(eq(schema.prendas.idprenda, idNum));
        if (prendas.length === 0) return res.status(404).json({ message: 'Prenda no encontrada' });

        const serviciosDb = await db.select({
            idPrendaServicio: schema.prendaservicio.idprendaservicio,
            idServicio: schema.prendaservicio.idservicio,
            precioUnitario: schema.prendaservicio.preciounitario,
            nombreServicio: schema.servicios.nombre
        })
        .from(schema.prendaservicio)
        .innerJoin(schema.servicios, eq(schema.prendaservicio.idservicio, schema.servicios.idservicio))
        .where(eq(schema.prendaservicio.idprenda, idNum));

        res.json({
            idPrenda: prendas[0].idprenda,
            nombre: prendas[0].nombre,
            descripcion: prendas[0].descripcion,
            cantidadServicios: serviciosDb.length,
            servicios: serviciosDb.map(s => ({ ...s, precioUnitario: Number(s.precioUnitario) }))
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Error al obtener la prenda' });
    }
};

export const createPrenda = async (req: Request, res: Response) => {
    if (DEMO_MODE) {
        const { nombre, descripcion } = req.body;
        if (!nombre) return res.status(400).json({ message: 'El nombre es requerido' });
        const userId = Number((req as any).user?.nameid);
        const nueva = demoStore.addPrenda(userId, {
            nombre: nombre.trim(),
            descripcion: descripcion?.trim() || null,
        });
        return res.status(201).json({ idPrenda: nueva.idprenda, nombre: nueva.nombre });
    }

    try {
        const { nombre, descripcion } = req.body;
        const nueva = await db.insert(schema.prendas)
            .values({ nombre: nombre.trim(), descripcion: descripcion?.trim() })
            .returning();
        res.status(201).json({ idPrenda: nueva[0].idprenda, nombre: nueva[0].nombre });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Error al crear prenda' });
    }
};

export const updatePrenda = async (req: Request, res: Response) => {
    const idNum = Number(req.params.id);

    if (DEMO_MODE) {
        if (isDemoId(idNum)) {
            const userId = Number((req as any).user?.nameid);
            const { nombre, descripcion } = req.body;
            const patch: any = {};
            if (nombre !== undefined) patch.nombre = nombre.trim();
            if (descripcion !== undefined) patch.descripcion = descripcion?.trim() || null;
            demoStore.updatePrenda(userId, idNum, patch);
            return res.json({ idPrenda: idNum });
        }
        return res.status(403).json({ message: 'Modo demo: no se pueden modificar datos historicos.' });
    }

    try {
        const { nombre, descripcion } = req.body;
        const actualizada = await db.update(schema.prendas)
            .set({
                ...(nombre && { nombre: nombre.trim() }),
                ...(descripcion !== undefined && { descripcion: descripcion?.trim() })
            })
            .where(eq(schema.prendas.idprenda, idNum))
            .returning();

        if (actualizada.length === 0) return res.status(404).json({ message: 'Prenda no encontrada' });
        res.json({ idPrenda: actualizada[0].idprenda });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Error al actualizar prenda' });
    }
};

export const deletePrenda = async (req: Request, res: Response) => {
    const idNum = Number(req.params.id);

    if (DEMO_MODE) {
        if (isDemoId(idNum)) {
            const userId = Number((req as any).user?.nameid);
            demoStore.deletePrenda(userId, idNum);
            return res.status(204).send();
        }
        return res.status(403).json({ message: 'Modo demo: no se pueden eliminar datos historicos.' });
    }

    try {
        const servicios = await db.select().from(schema.prendaservicio)
            .where(eq(schema.prendaservicio.idprenda, idNum));
        if (servicios.length > 0) {
            return res.status(400).json({ message: 'No se puede eliminar la prenda porque tiene servicios asociados' });
        }

        await db.delete(schema.prendas).where(eq(schema.prendas.idprenda, idNum));
        res.status(204).send();
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Error al eliminar prenda' });
    }
};
