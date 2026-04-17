// src/db/schema/app.ts
import { relations } from "drizzle-orm";
import { pgTable, bigint, text, numeric, integer, boolean, timestamp, date } from "drizzle-orm/pg-core";

const timestamps = {
  createdAt: timestamp('fecha_creacion').defaultNow().notNull(),
  updatedAt: timestamp('fecha_ultima_actualizacion').defaultNow().$onUpdate(() => new Date()).notNull(),
}

// Estados
export const estados = pgTable('estados', {
  id_estado: bigint('id_estado', { mode: 'number' }).primaryKey().generatedAlwaysAsIdentity(),
  nombre: text('nombre').notNull(),
  descripcion: text('descripcion'),
  activo: boolean('activo').notNull().default(true),
  fecha_creacion: timestamp('fecha_creacion').defaultNow().notNull()
});

// Clientes
export const clientes = pgTable('clientes', {
  id_cliente: bigint('id_cliente', { mode: 'number' }).primaryKey().generatedAlwaysAsIdentity(),
  nombre: text('nombre'),
  apellido: text('apellido'),
  direccion: text('direccion'),
  telefono: text('telefono'),
  email: text('email'),
  id_estado: bigint('id_estado', { mode: 'number' }).references(() => estados.id_estado),
  fecha_registro: timestamp('fecha_registro').defaultNow().notNull(),
  fecha_ultima_actualizacion: timestamp('fecha_ultima_actualizacion').defaultNow().$onUpdate(() => new Date()).notNull(),
  notas: text('notas')
});

// Facturas
export const facturas = pgTable('facturas', {
  id_factura: bigint('id_factura', { mode: 'number' }).primaryKey().generatedAlwaysAsIdentity(),
  id_cliente: bigint('id_cliente', { mode: 'number' }).references(() => clientes.id_cliente),
  nombre_cliente: text('nombre_cliente'),
  telefono_cliente: text('telefono_cliente'),
  id_usuario: bigint('id_usuario', { mode: 'number' }),
  id_estado: bigint('id_estado', { mode: 'number' }).references(() => estados.id_estado),
  numero_factura: text('numero_factura').unique(),
  fecha_creacion: timestamp('fecha_creacion').defaultNow().notNull(),
  fecha_ultima_actualizacion: timestamp('fecha_ultima_actualizacion').defaultNow().$onUpdate(() => new Date()).notNull(),
  fecha_entrega_estimada: date('fecha_entrega_estimada'),
  fecha_entrega_real: timestamp('fecha_entrega_real'),
  subtotal: numeric('subtotal').notNull(),
  impuestos: numeric('impuestos'),
  descuento: numeric('descuento'),
  total: numeric('total').notNull(),
  metodo_pago: text('metodo_pago'),
  notas: text('notas'),
  monto_abonado: numeric('monto_abonado'),
  monto_pendiente: numeric('monto_pendiente'),
  id_estado_entrega: bigint('id_estado_entrega', { mode: 'number' }),
  recogido_por: text('recogido_por'),
  notas_entrega: text('notas_entrega')
});

// Productos
export const productos = pgTable('productos', {
  id_producto: bigint('id_producto', { mode: 'number' }).primaryKey().generatedAlwaysAsIdentity(),
  nombre: text('nombre'),
  descripcion: text('descripcion'),
  codigo_barras: text('codigo_barras').unique(),
  precio_venta: numeric('precio_venta').notNull(),
  costo: numeric('costo'),
  stock_actual: integer('stock_actual').notNull().default(0),
  stock_minimo: integer('stock_minimo').default(0),
  id_categoria: bigint('id_categoria', { mode: 'number' }),
  id_estado: bigint('id_estado', { mode: 'number' }).references(() => estados.id_estado),
  fecha_creacion: timestamp('fecha_creacion').defaultNow().notNull()
});

// Relaciones
export const clientesRelations = relations(clientes, ({ one }) => ({
  estado: one(estados, { fields: [clientes.id_estado], references: [estados.id_estado] })
}));

export const facturasRelations = relations(facturas, ({ one }) => ({
  cliente: one(clientes, { fields: [facturas.id_cliente], references: [clientes.id_cliente] }),
  estado: one(estados, { fields: [facturas.id_estado], references: [estados.id_estado] })
}));

export type Estado = typeof estados.$inferSelect;
export type Cliente = typeof clientes.$inferSelect;
export type Factura = typeof facturas.$inferSelect;
export type Producto = typeof productos.$inferSelect;