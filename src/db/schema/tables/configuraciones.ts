import { pgTable, text, bigint, timestamp } from "drizzle-orm/pg-core";

export const configuraciones = pgTable("configuraciones", {
  id_configuracion: bigint("id_configuracion", { mode: "number" }).primaryKey(),
  clave: text("clave").notNull(),
  valor: text("valor"),
  descripcion: text("descripcion"),
  tipo_dato: text("tipo_dato"),
  fecha_creacion: timestamp("fecha_creacion").defaultNow(),
  fecha_ultima_actualizacion: timestamp("fecha_ultima_actualizacion").defaultNow(),
});