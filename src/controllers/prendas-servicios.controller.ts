import { Request, Response } from 'express';
import { eq, and } from 'drizzle-orm';
import { db } from '../db/index.js';
import * as schema from '../db/schema.js';
import { DEMO_MODE, demoStore, isDemoId } from '../demo/store.js';

export const getPrendaServicioById = async (req: Request, res: Response) => {
    try {
        const idNum = Number(req.params.id);

        if (DEMO_MODE && isDemoId(idNum)) {
            const userId = Number((req as any).user?.nameid);
            const ps = demoStore.getPrendaServicioById(userId, idNum);
            if (!ps) return res.status(404).json({ message: 'No encontrado' });
            return res.json(ps);
        }

        const result = await db.select().from(schema.prendaservicio)
            .where(eq(schema.prendaservicio.idprendaservicio, idNum));
        if (result.length === 0) return res.status(404).json({ message: 'No encontrado' });
        res.json(result[0]);
    } catch (error) {
        res.status(500).json({ error: 'Error en el servidor' });
    }
};

export const createPrendaServicio = async (req: Request, res: Response) => {
    const { idPrenda, idServicio, precioUnitario } = req.body;

    if (DEMO_MODE) {
        if (isDemoId(Number(idPrenda))) {
            const userId = Number((req as any).user?.nameid);
            const existing = demoStore.getPrendasServiciosByPrenda(userId, Number(idPrenda))
                .find(ps => ps.idservicio === Number(idServicio));
            if (existing) return res.status(400).json({ message: 'Ya existe esta combinacion de prenda y servicio' });

            let nombreServicio = '';
            if (isDemoId(Number(idServicio))) {
                const sv = demoStore.getServicioById(userId, Number(idServicio));
                nombreServicio = sv?.nombre || '';
            } else {
                const svDb = await db.select({ nombre: schema.servicios.nombre })
                    .from(schema.servicios).where(eq(schema.servicios.idservicio, Number(idServicio)));
                nombreServicio = svDb[0]?.nombre || '';
            }

            const nuevo = demoStore.addPrendaServicio(userId, {
                idprenda: Number(idPrenda),
                idservicio: Number(idServicio),
                preciounitario: String(precioUnitario),
                nombreServicio,
            });
            return res.status(201).json({ idPrendaServicio: nuevo.idprendaservicio });
        }
        return res.status(403).json({ message: 'Modo demo: no se pueden modificar datos historicos.' });
    }

    try {
        const existe = await db.select().from(schema.prendaservicio)
            .where(and(
                eq(schema.prendaservicio.idprenda, idPrenda),
                eq(schema.prendaservicio.idservicio, idServicio)
            ));

        if (existe.length > 0) return res.status(400).json({ message: 'Ya existe esta combinacion de prenda y servicio' });

        const nuevo = await db.insert(schema.prendaservicio).values({
            idprenda: idPrenda,
            idservicio: idServicio,
            preciounitario: precioUnitario
        }).returning();

        res.status(201).json({ idPrendaServicio: nuevo[0].idprendaservicio });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Error al asignar servicio a la prenda' });
    }
};

export const updatePrendaServicio = async (req: Request, res: Response) => {
    const idNum = Number(req.params.id);
    const { precioUnitario } = req.body;

    if (precioUnitario === undefined || precioUnitario === null) {
        return res.status(400).json({ message: 'El precio unitario es requerido' });
    }

    if (DEMO_MODE) {
        if (isDemoId(idNum)) {
            const userId = Number((req as any).user?.nameid);
            demoStore.updatePrendaServicio(userId, idNum, { preciounitario: String(precioUnitario) });
            return res.json({ idPrendaServicio: idNum, mensaje: 'Precio actualizado correctamente' });
        }
        return res.status(403).json({ message: 'Modo demo: no se pueden modificar datos historicos.' });
    }

    try {
        const actualizado = await db.update(schema.prendaservicio)
            .set({ preciounitario: precioUnitario })
            .where(eq(schema.prendaservicio.idprendaservicio, idNum))
            .returning();

        if (actualizado.length === 0) return res.status(404).json({ message: 'Servicio de prenda no encontrado' });
        res.json({ idPrendaServicio: actualizado[0].idprendaservicio, mensaje: 'Precio actualizado correctamente' });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Error al actualizar el servicio de la prenda' });
    }
};

export const deletePrendaServicio = async (req: Request, res: Response) => {
    const idNum = Number(req.params.id);

    if (DEMO_MODE) {
        if (isDemoId(idNum)) {
            const userId = Number((req as any).user?.nameid);
            demoStore.deletePrendaServicio(userId, idNum);
            return res.status(204).send();
        }
        return res.status(403).json({ message: 'Modo demo: no se pueden eliminar datos historicos.' });
    }

    try {
        const enUso = await db.select().from(schema.detallefactura)
            .where(eq(schema.detallefactura.idprendaservicio, idNum));

        if (enUso.length > 0) {
            return res.status(400).json({ message: 'No se puede eliminar porque esta siendo usado en facturas' });
        }

        await db.delete(schema.prendaservicio).where(eq(schema.prendaservicio.idprendaservicio, idNum));
        res.status(204).send();
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Error al eliminar el servicio de la prenda' });
    }
};
