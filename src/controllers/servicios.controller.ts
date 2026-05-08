import { Request, Response } from 'express';
import { eq, ilike } from 'drizzle-orm';
import { db } from '../db/index.js';
import * as schema from '../db/schema.js';
import { DEMO_MODE, demoStore, isDemoId } from '../demo/store.js';

const mapServicioToDto = (s: any) => ({
    idServicio: s.idservicio ?? s.idServicio,
    nombre: s.nombre,
    descripcion: s.descripcion,
    duracionEstimada: s.duracionEstimada ?? s.duracionestimada,
    idEstado: s.idestado ?? s.idEstado,
    fechaCreacion: s.fechaCreacion ?? s.fechacreacion,
    fechaUltimaActualizacion: s.fechaultimaactualizacion,
});

export const getServicios = async (req: Request, res: Response) => {
    try {
        const { search } = req.query;
        let query = db.select().from(schema.servicios).$dynamic();
        if (search) query = query.where(ilike(schema.servicios.nombre, `%${search}%`));

        const serviciosDb = await query.orderBy(schema.servicios.nombre);
        let todos = serviciosDb.map(mapServicioToDto);

        if (DEMO_MODE) {
            const userId = Number((req as any).user?.nameid);
            let demoServicios = demoStore.getServicios(userId);
            if (search) {
                const s = (search as string).toLowerCase();
                demoServicios = demoServicios.filter(sv => sv.nombre.toLowerCase().includes(s));
            }
            todos = [...demoServicios.map(mapServicioToDto), ...todos];
        }

        res.json(todos);
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Error al obtener servicios' });
    }
};

export const getServiciosSimples = async (req: Request, res: Response) => {
    try {
        const serviciosDb = await db.select({
            idServicio: schema.servicios.idservicio,
            nombre: schema.servicios.nombre,
            idEstado: schema.servicios.idestado
        })
        .from(schema.servicios)
        .where(eq(schema.servicios.idestado, 1))
        .orderBy(schema.servicios.nombre);

        let todos: typeof serviciosDb = [...serviciosDb];

        if (DEMO_MODE) {
            const userId = Number((req as any).user?.nameid);
            const demoActivos = demoStore.getServicios(userId)
                .filter(sv => sv.idestado === 1)
                .map(sv => ({ idServicio: sv.idservicio, nombre: sv.nombre, idEstado: sv.idestado }));
            todos = [...demoActivos as any, ...todos];
        }

        res.json(todos);
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Error al obtener servicios simples' });
    }
};

export const getServicioById = async (req: Request, res: Response) => {
    try {
        const idNum = Number(req.params.id);

        if (DEMO_MODE && isDemoId(idNum)) {
            const userId = Number((req as any).user?.nameid);
            const sv = demoStore.getServicioById(userId, idNum);
            if (!sv) return res.status(404).json({ message: 'Servicio no encontrado' });
            return res.json(mapServicioToDto(sv));
        }

        const servicio = await db.select().from(schema.servicios).where(eq(schema.servicios.idservicio, idNum));
        if (servicio.length === 0) return res.status(404).json({ message: 'Servicio no encontrado' });
        res.json(mapServicioToDto(servicio[0]));
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Error al obtener el servicio' });
    }
};

export const createServicio = async (req: Request, res: Response) => {
    if (DEMO_MODE) {
        const { nombre, descripcion, duracionEstimada, idEstado } = req.body;
        if (!nombre) return res.status(400).json({ message: 'El nombre es requerido' });
        const userId = Number((req as any).user?.nameid);
        const now = new Date().toISOString();
        const nuevo = demoStore.addServicio(userId, {
            nombre: nombre.trim(),
            descripcion: descripcion?.trim() || null,
            duracionEstimada: duracionEstimada ?? null,
            idestado: idEstado || 1,
            fechaCreacion: now,
            fechaultimaactualizacion: now,
        });
        return res.status(201).json({ idServicio: nuevo.idservicio, nombre: nuevo.nombre });
    }

    try {
        const data = req.body;
        if (!data.nombre) return res.status(400).json({ message: 'El nombre es requerido' });

        const nuevo = await db.insert(schema.servicios).values({
            nombre: data.nombre.trim(),
            descripcion: data.descripcion?.trim(),
            duracionEstimada: data.duracionEstimada,
            idestado: data.idEstado || 1,
            fechaCreacion: new Date().toISOString(),
            fechaultimaactualizacion: new Date().toISOString()
        }).returning();

        res.status(201).json({ idServicio: nuevo[0].idservicio, nombre: nuevo[0].nombre });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Error al crear servicio' });
    }
};

export const updateServicio = async (req: Request, res: Response) => {
    const idNum = Number(req.params.id);

    if (DEMO_MODE) {
        if (isDemoId(idNum)) {
            const userId = Number((req as any).user?.nameid);
            const { nombre, descripcion, duracionEstimada, idEstado } = req.body;
            const patch: any = { fechaultimaactualizacion: new Date().toISOString() };
            if (nombre !== undefined) patch.nombre = nombre.trim();
            if (descripcion !== undefined) patch.descripcion = descripcion?.trim() || null;
            if (duracionEstimada !== undefined) patch.duracionEstimada = duracionEstimada;
            if (idEstado !== undefined) patch.idestado = idEstado;
            demoStore.updateServicio(userId, idNum, patch);
            return res.json({ idServicio: idNum });
        }
        return res.status(403).json({ message: 'Modo demo: no se pueden modificar datos historicos.' });
    }

    try {
        const data = req.body;
        const actualizado = await db.update(schema.servicios)
            .set({
                ...(data.nombre && { nombre: data.nombre.trim() }),
                ...(data.descripcion !== undefined && { descripcion: data.descripcion?.trim() }),
                ...(data.duracionEstimada !== undefined && { duracionEstimada: data.duracionEstimada }),
                ...(data.idEstado !== undefined && { idestado: data.idEstado }),
                fechaultimaactualizacion: new Date().toISOString()
            })
            .where(eq(schema.servicios.idservicio, idNum))
            .returning();

        if (actualizado.length === 0) return res.status(404).json({ message: 'Servicio no encontrado' });
        res.json({ idServicio: actualizado[0].idservicio });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Error al actualizar servicio' });
    }
};

export const deleteServicio = async (req: Request, res: Response) => {
    const idNum = Number(req.params.id);

    if (DEMO_MODE) {
        if (isDemoId(idNum)) {
            const userId = Number((req as any).user?.nameid);
            demoStore.deleteServicio(userId, idNum);
            return res.status(204).send();
        }
        return res.status(403).json({ message: 'Modo demo: no se pueden eliminar datos historicos.' });
    }

    try {
        await db.update(schema.servicios)
            .set({ idestado: 2, fechaultimaactualizacion: new Date().toISOString() })
            .where(eq(schema.servicios.idservicio, idNum));
        res.status(204).send();
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Error al eliminar servicio' });
    }
};
