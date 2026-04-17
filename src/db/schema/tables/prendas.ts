import { pgTable, bigint, text } from "drizzle-orm/pg-core";

export const prendas = pgTable("prendas", {
  id_prenda: bigint("id_prenda", { mode: "number" }).primaryKey(),
  nombre: text("nombre"),
  descripcion: text("descripcion"),
});