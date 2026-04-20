import { Request, Response } from 'express';
import { eq, and } from 'drizzle-orm';
import { db } from '../db/index.js';
import * as schema from '../db/schema.js';

export const getPrendaServicioById = async (req: Request, res: Response) => {
    try {
        const result = await db.select().from(schema.prendaservicio).where(eq(schema.prendaservicio.idprendaservicio, Number(req.params.id)));
        if (result.length === 0) return res.status(404).json({ message: 'No encontrado' });
        res.json(result[0]);
    } catch (error) {
        res.status(500).json({ error: 'Error en el servidor' });
    }
};

export const createPrendaServicio = async (req: Request, res: Response) => {
    try {
        const { idPrenda, idServicio, precioUnitario } = req.body;

        // Verificar si ya existe
        const existe = await db.select()
            .from(schema.prendaservicio)
            .where(and(eq(schema.prendaservicio.idprenda, idPrenda), eq(schema.prendaservicio.idservicio, idServicio)));

        if (existe.length > 0) {
            return res.status(400).json({ message: "Ya existe esta combinación de prenda y servicio" });
        }

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
    try {
        const { id } = req.params;
        const { precioUnitario } = req.body;

        if (precioUnitario === undefined || precioUnitario === null) {
            return res.status(400).json({ message: "El precio unitario es requerido" });
        }

        const actualizado = await db.update(schema.prendaservicio)
            .set({ preciounitario: precioUnitario })
            .where(eq(schema.prendaservicio.idprendaservicio, Number(id)))
            .returning();

        if (actualizado.length === 0) {
            return res.status(404).json({ message: 'Servicio de prenda no encontrado' });
        }

        res.json({ 
            idPrendaServicio: actualizado[0].idprendaservicio,
            mensaje: 'Precio actualizado correctamente' 
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Error al actualizar el servicio de la prenda' });
    }
};

export const deletePrendaServicio = async (req: Request, res: Response) => {
    try {
        const { id } = req.params;
        const idNum = Number(id);

        // Validar si se está usando en una factura
        const enUso = await db.select()
            .from(schema.detallefactura)
            .where(eq(schema.detallefactura.idprendaservicio, idNum));

        if (enUso.length > 0) {
            return res.status(400).json({ message: "No se puede eliminar porque está siendo usado en facturas" });
        }

        await db.delete(schema.prendaservicio).where(eq(schema.prendaservicio.idprendaservicio, idNum));
        res.status(204).send();
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Error al eliminar el servicio de la prenda' });
    }
};