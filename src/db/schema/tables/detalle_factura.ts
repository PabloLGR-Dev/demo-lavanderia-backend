import { pgTable, bigint, integer, numeric, text, timestamp } from "drizzle-orm/pg-core";

export const detalle_factura = pgTable("detalle_factura", {
  id_detalle: bigint("id_detalle", { mode: "number" }).primaryKey(),
  id_factura: bigint("id_factura", { mode: "number" }),
  id_prenda_servicio: bigint("id_prenda_servicio", { mode: "number" }),
  cantidad: integer("cantidad").notNull(),
  precio_unitario: numeric("precio_unitario").notNull(),
  subtotal: numeric("subtotal"),
  descripcion: text("descripcion"),
  fecha_creacion: timestamp("fecha_creacion").defaultNow(),
  id_producto: bigint("id_producto", { mode: "number" }),
  tipo_item: text("tipo_item"),
});