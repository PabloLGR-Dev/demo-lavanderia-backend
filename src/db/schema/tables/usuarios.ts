import { pgTable, bigint, text, timestamp } from "drizzle-orm/pg-core";

export const usuarios = pgTable("usuarios", {
  id_usuario: bigint("id_usuario", { mode: "number" }).primaryKey(),
  nombre: text("nombre"),
  apellido: text("apellido"),
  email: text("email"),
  username: text("username"),
  password_hash: text("password_hash"),
  id_estado: bigint("id_estado", { mode: "number" }),
  fecha_creacion: timestamp("fecha_creacion").defaultNow(),
  fecha_ultimo_login: timestamp("fecha_ultimo_login"),
});