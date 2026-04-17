import { pgTable, bigint, text, timestamp } from "drizzle-orm/pg-core";

export const roles = pgTable("roles", {
  id_rol: bigint("id_rol", { mode: "number" }).primaryKey(),
  nombre: text("nombre").notNull(),
  descripcion: text("descripcion"),
  id_estado: bigint("id_estado", { mode: "number" }),
  fecha_creacion: timestamp("fecha_creacion").defaultNow(),
});