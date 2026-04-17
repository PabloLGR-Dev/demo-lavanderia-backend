import { pgTable, text, bigint } from "drizzle-orm/pg-core";

export const categorias_producto = pgTable("categorias_producto", {
  id_categoria: bigint("id_categoria", { mode: "number" }).primaryKey(),
  nombre: text("nombre").notNull(),
}); 