import { pgTable, bigint, text, numeric, integer, timestamp } from "drizzle-orm/pg-core";

export const productos = pgTable("productos", {
  id_producto: bigint("id_producto", { mode: "number" }).primaryKey(),
  nombre: text("nombre"),
  descripcion: text("descripcion"),
  codigo_barras: text("codigo_barras"),
  precio_venta: numeric("precio_venta").notNull(),
  costo: numeric("costo"),
  stock_actual: integer("stock_actual").notNull().default(0),
  stock_minimo: integer("stock_minimo").default(0),
  id_categoria: bigint("id_categoria", { mode: "number" }),
  id_estado: bigint("id_estado", { mode: "number" }),
  fecha_creacion: timestamp("fecha_creacion").defaultNow(),
});