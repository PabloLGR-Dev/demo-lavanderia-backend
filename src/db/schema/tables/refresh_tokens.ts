import { pgTable, bigint, text, timestamp } from "drizzle-orm/pg-core";

export const refresh_tokens = pgTable("refresh_tokens", {
  id_refresh_tokens: bigint("id_refresh_tokens", { mode: "number" }).primaryKey(),
  id_usuario: bigint("id_usuario", { mode: "number" }),
  token: text("token"),
  expires: timestamp("expires").notNull(),
  created: timestamp("created").defaultNow(),
  created_by_ip: text("created_by_ip"),
  revoked: timestamp("revoked"),
  revoked_by_ip: text("revoked_by_ip"),
  replaced_by_token: text("replaced_by_token"),
});