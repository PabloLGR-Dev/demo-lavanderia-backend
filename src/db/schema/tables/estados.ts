import { pgTable, bigint, text, boolean, timestamp } from "drizzle-orm/pg-core";

export const estados = pgTable("estados", {
  id_estado: bigint("id_estado", { mode: "number" }).primaryKey(),
  nombre: text("nombre").notNull(),
  descripcion: text("descripcion"),
  activo: boolean("activo").notNull().default(true),
  fecha_creacion: timestamp("fecha_creacion").defaultNow(),
});