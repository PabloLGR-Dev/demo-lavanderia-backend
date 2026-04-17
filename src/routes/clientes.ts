import express from "express";
import { clientes } from "../db/schema/tables/clientes.js";
import { estados } from "../db/schema/tables/estados.js";
import { or, and, desc, eq, ilike, getTableColumns, sql } from "drizzle-orm";
import { db } from "../db/index.js";

const router = express.Router();

// Get all clients with optional search, filtering, and pagination
router.get("/", async (req, res) => {
    try {
        const { search, estado, page = 1, limit = 10 } = req.query;

        const currentPage = Math.max(1, +page);
        const limitPerPage = Math.max(1, +limit);
        const offset = (currentPage - 1) * limitPerPage;

        const filterConditions = [];

        // Filter by search query in nombre or apellido or email
        if (search) {
            filterConditions.push(
                or(
                    ilike(clientes.nombre, `%${search}%`),
                    ilike(clientes.apellido, `%${search}%`),
                    ilike(clientes.email, `%${search}%`)
                )
            );
        }

        // Filter by estado name
        if (estado) {
            filterConditions.push(ilike(estados.nombre, `%${estado}%`));
        }

        const whereClause = filterConditions.length > 0 ? and(...filterConditions) : undefined;

        // Count total
        const countResult = await db
            .select({ count: sql<number>`count(*)` })
            .from(clientes)
            .leftJoin(estados, eq(clientes.id_estado, estados.id_estado))
            .where(whereClause);

        const totalCount = countResult[0]?.count ?? 0;

        // Fetch data with join to estados
        const clientsList = await db
            .select({
                ...getTableColumns(clientes),
                estado: { ...getTableColumns(estados) }
            })
            .from(clientes)
            .leftJoin(estados, eq(clientes.id_estado, estados.id_estado))
            .where(whereClause)
            .orderBy(desc(clientes.fecha_registro))
            .limit(limitPerPage)
            .offset(offset);

        res.status(200).json({
            data: clientsList,
            pagination: {
                page: currentPage,
                limit: limitPerPage,
                total: totalCount,
                totalPages: Math.ceil(totalCount / limitPerPage),
            }
        });

    } catch (e) {
        console.error(`Get /clientes error: ${e}`);
        res.status(500).json({ error: 'Failed to get clients' });
    }
});

export default router;