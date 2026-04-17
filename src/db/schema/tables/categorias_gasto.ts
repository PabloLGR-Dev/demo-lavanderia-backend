import { pgTable, text, bigint, timestamp } from "drizzle-orm/pg-core";

export const categorias_gasto = pgTable("categorias_gasto", {
  id_categoria_gasto: bigint("id_categoria_gasto", { mode: "number" }).primaryKey(),
  nombre: text("nombre").notNull(),
  descripcion: text("descripcion"),
  color: text("color"),
  id_estado: bigint("id_estado", { mode: "number" }),
  fecha_creacion: timestamp("fecha_creacion").defaultNow(),
});