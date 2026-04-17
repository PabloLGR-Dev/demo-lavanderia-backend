import { pgTable, text, bigint, timestamp } from "drizzle-orm/pg-core";

export const clientes = pgTable("clientes", {
  id_cliente: bigint("id_cliente", { mode: "number" }).primaryKey(),
  nombre: text("nombre"),
  apellido: text("apellido"),
  direccion: text("direccion"),
  telefono: text("telefono"),
  email: text("email"),
  id_estado: bigint("id_estado", { mode: "number" }),
  fecha_registro: timestamp("fecha_registro").defaultNow(),
  fecha_ultima_actualizacion: timestamp("fecha_ultima_actualizacion").defaultNow(),
  notas: text("notas"),
});