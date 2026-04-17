import express from "express";
import { estados } from "../db/schema/tables/estados.js";
import { and, desc, ilike, getTableColumns, or } from "drizzle-orm";
import { db } from "../db/index.js";

const router = express.Router();

// Get all estados with optional search and pagination
router.get("/", async (req, res) => {
  try {
    const { search, page = 1, limit = 10 } = req.query;

    const currentPage = Math.max(1, +page);
    const limitPerPage = Math.max(1, +limit);
    const offset = (currentPage - 1) * limitPerPage;

    const filterConditions = [];

    // If search exists, filter by nombre OR descripcion
    if (search) {
      filterConditions.push(
        or(
          ilike(estados.nombre, `%${search}%`),
          ilike(estados.descripcion, `%${search}%`)
        )
      );
    }

    // Combine filters with AND
    const whereClause = filterConditions.length > 0 ? and(...filterConditions) : undefined;

    // Get total count
    const allEstados = await db.select().from(estados).where(whereClause);
    const totalCount = allEstados.length;

    // Get paginated results
    const estadosList = await db
      .select(getTableColumns(estados))
      .from(estados)
      .where(whereClause)
      .orderBy(desc(estados.fecha_creacion))
      .limit(limitPerPage)
      .offset(offset);

    res.status(200).json({
      data: estadosList,
      pagination: {
        page: currentPage,
        limit: limitPerPage,
        total: totalCount,
        totalPages: Math.ceil(totalCount / limitPerPage),
      },
    });
  } catch (e) {
    console.error(`Get /estados error: ${e}`);
    res.status(500).json({ error: "Failed to get estados" });
  }
});

export default router;