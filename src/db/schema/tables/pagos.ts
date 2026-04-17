import { pgTable, bigint, numeric, text, timestamp } from "drizzle-orm/pg-core";

export const pagos = pgTable("pagos", {
  id_pago: bigint("id_pago", { mode: "number" }).primaryKey(),
  id_factura: bigint("id_factura", { mode: "number" }),
  monto: numeric("monto").notNull(),
  id_estado: bigint("id_estado", { mode: "number" }),
  fecha_pago: timestamp("fecha_pago"),
  fecha_ultima_actualizacion: timestamp("fecha_ultima_actualizacion").defaultNow(),
  metodo_pago: text("metodo_pago"),
  referencia: text("referencia"),
  id_usuario: bigint("id_usuario", { mode: "number" }),
  notas: text("notas"),
});