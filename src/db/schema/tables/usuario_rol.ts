import { pgTable, bigint, timestamp } from "drizzle-orm/pg-core";

export const usuario_rol = pgTable("usuario_rol", {
  id_usuario: bigint("id_usuario", { mode: "number" }).primaryKey(),
  id_rol: bigint("id_rol", { mode: "number" }).primaryKey(),
  fecha_asignacion: timestamp("fecha_asignacion").defaultNow(),
});