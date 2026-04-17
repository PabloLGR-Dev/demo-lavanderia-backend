import { pgTable, bigint, numeric } from "drizzle-orm/pg-core";

export const prendas_servicios = pgTable("prendas_servicios", {
  id_prenda_servicio: bigint("id_prenda_servicio", { mode: "number" }).primaryKey(),
  id_prenda: bigint("id_prenda", { mode: "number" }),
  id_servicio: bigint("id_servicio", { mode: "number" }),
  precio_unitario: numeric("precio_unitario").notNull(),
});