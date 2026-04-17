import { pgTable, bigint, numeric, text, timestamp } from "drizzle-orm/pg-core";

export const gastos = pgTable("gastos", {
  id_gasto: bigint("id_gasto", { mode: "number" }).primaryKey(),
  id_categoria_gasto: bigint("id_categoria_gasto", { mode: "number" }),
  monto: numeric("monto").notNull(),
  fecha_gasto: timestamp("fecha_gasto").notNull(),
  descripcion: text("descripcion"),
  referencia: text("referencia"),
  comprobante_url: text("comprobante_url"),
  id_usuario: bigint("id_usuario", { mode: "number" }),
  id_estado: bigint("id_estado", { mode: "number" }),
  fecha_creacion: timestamp("fecha_creacion").defaultNow(),
  fecha_ultima_actualizacion: timestamp("fecha_ultima_actualizacion").defaultNow(),
});