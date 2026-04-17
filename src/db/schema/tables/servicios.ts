import { pgTable, bigint, text, integer, timestamp } from "drizzle-orm/pg-core";

export const servicios = pgTable("servicios", {
  id_servicio: bigint("id_servicio", { mode: "number" }).primaryKey(),
  nombre: text("nombre"),
  descripcion: text("descripcion"),
  duracion_estimada: integer("duracion_estimada"),
  id_estado: bigint("id_estado", { mode: "number" }),
  fecha_creacion: timestamp("fecha_creacion").defaultNow(),
  fecha_ultima_actualizacion: timestamp("fecha_ultima_actualizacion").defaultNow(),
});