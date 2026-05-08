import { pgTable, unique, integer, varchar, timestamp, text, boolean, foreignKey, check, date, numeric, primaryKey } from "drizzle-orm/pg-core"
import { sql } from "drizzle-orm"



export const configuraciones = pgTable("configuraciones", {
	idconfiguracion: integer().primaryKey().generatedByDefaultAsIdentity({ name: "configuraciones_idconfiguracion_seq", startWith: 1, increment: 1, minValue: 1, maxValue: 2147483647, cache: 1 }),
	clave: varchar({ length: 100 }).notNull(),
	valor: varchar({ length: 500 }).notNull(),
	descripcion: varchar({ length: 500 }),
	tipodato: varchar({ length: 50 }).notNull(),
	fechacreacion: timestamp({ mode: 'string' }).default(sql`CURRENT_TIMESTAMP`).notNull(),
	fechaultimaactualizacion: timestamp({ mode: 'string' }).default(sql`CURRENT_TIMESTAMP`).notNull(),
}, (table) => [
	unique("configuraciones_clave_key").on(table.clave),
]);

export const estados = pgTable("estados", {
	idestado: integer().primaryKey().generatedByDefaultAsIdentity({ name: "estados_idestado_seq", startWith: 1, increment: 1, minValue: 1, maxValue: 2147483647, cache: 1 }),
	nombre: varchar({ length: 50 }).notNull(),
	descripcion: text(),
	activo: boolean().default(true),
	fechacreacion: timestamp({ mode: 'string' }).default(sql`CURRENT_TIMESTAMP`),
});

export const clientes = pgTable("clientes", {
	idcliente: integer().primaryKey().generatedByDefaultAsIdentity({ name: "clientes_idcliente_seq", startWith: 1, increment: 1, minValue: 1, maxValue: 2147483647, cache: 1 }),
	nombre: varchar({ length: 100 }).notNull(),
	apellido: varchar({ length: 100 }),
	direccion: varchar({ length: 200 }),
	telefono: varchar({ length: 20 }),
	email: varchar({ length: 100 }),
	idestado: integer().notNull(),
	fecharegistro: timestamp({ mode: 'string' }).default(sql`CURRENT_TIMESTAMP`),
	fechaultimaactualizacion: timestamp({ mode: 'string' }).default(sql`CURRENT_TIMESTAMP`),
	notas: text(),
}, (table) => [
	foreignKey({
			columns: [table.idestado],
			foreignColumns: [estados.idestado],
			name: "fk_clientes_estados"
		}),
]);

export const facturas = pgTable("facturas", {
	idfactura: integer().primaryKey().generatedByDefaultAsIdentity({ name: "facturas_idfactura_seq", startWith: 1, increment: 1, minValue: 1, maxValue: 2147483647, cache: 1 }),
	idcliente: integer(),
	nombrecliente: varchar({ length: 100 }),
	telefonocliente: varchar({ length: 20 }),
	idusuario: integer().notNull(),
	idestado: integer().notNull(),
	numerofactura: varchar({ length: 20 }).notNull(),
	fechacreacion: timestamp({ mode: 'string' }).default(sql`CURRENT_TIMESTAMP`),
	fechaultimaactualizacion: timestamp({ mode: 'string' }).default(sql`CURRENT_TIMESTAMP`),
	fechaentregaestimada: date(),
	fechaentregareal: timestamp({ mode: 'string' }),
	subtotal: numeric({ precision: 10, scale:  2 }).notNull(),
	impuestos: numeric({ precision: 10, scale:  2 }).default('0'),
	descuento: numeric({ precision: 10, scale:  2 }).default('0'),
	total: numeric({ precision: 10, scale:  2 }).notNull(),
	metodopago: varchar({ length: 20 }).default('efectivo'),
	notas: text(),
	montoabonado: numeric({ precision: 10, scale:  2 }),
	montopendiente: numeric({ precision: 10, scale:  2 }),
	idestadoentrega: integer(),
	recogidopor: varchar({ length: 200 }),
	notasentrega: varchar({ length: 500 }),
}, (table) => [
	foreignKey({
			columns: [table.idcliente],
			foreignColumns: [clientes.idcliente],
			name: "fk_facturas_clientes"
		}),
	foreignKey({
			columns: [table.idestadoentrega],
			foreignColumns: [estados.idestado],
			name: "fk_facturas_estadoentrega"
		}),
	foreignKey({
			columns: [table.idestado],
			foreignColumns: [estados.idestado],
			name: "fk_facturas_estados"
		}),
	foreignKey({
			columns: [table.idusuario],
			foreignColumns: [usuarios.idusuario],
			name: "fk_facturas_usuarios"
		}),
	unique("facturas_numerofactura_key").on(table.numerofactura),
	check("facturas_metodopago_check", sql`(metodopago)::text = ANY ((ARRAY['otro'::character varying, 'transferencia'::character varying, 'tarjeta'::character varying, 'efectivo'::character varying])::text[])`),
]);

export const detallefactura = pgTable("detallefactura", {
	iddetalle: integer().primaryKey().generatedByDefaultAsIdentity({ name: "detallefactura_iddetalle_seq", startWith: 1, increment: 1, minValue: 1, maxValue: 2147483647, cache: 1 }),
	idfactura: integer().notNull(),
	idprendaservicio: integer(),
	cantidad: integer().default(1).notNull(),
	preciounitario: numeric({ precision: 10, scale:  2 }).notNull(),
	subtotal: numeric({ precision: 10, scale:  2 }).generatedAlwaysAs(sql`((cantidad)::numeric * preciounitario)`),
	descripcion: text(),
	fechacreacion: timestamp({ mode: 'string' }).default(sql`CURRENT_TIMESTAMP`).notNull(),
	idproducto: integer(),
	tipoitem: varchar({ length: 50 }).generatedAlwaysAs(sql`
CASE
    WHEN (idproducto IS NOT NULL) THEN 'Producto'::text
    WHEN (idprendaservicio IS NOT NULL) THEN 'Servicio'::text
    ELSE NULL::text
END`),
}, (table) => [
	foreignKey({
			columns: [table.idfactura],
			foreignColumns: [facturas.idfactura],
			name: "fk_detallefactura_factura"
		}),
	foreignKey({
			columns: [table.idprendaservicio],
			foreignColumns: [prendaservicio.idprendaservicio],
			name: "fk_detallefactura_prendaservicio"
		}),
	foreignKey({
			columns: [table.idproducto],
			foreignColumns: [productos.idproducto],
			name: "fk_detallefactura_producto"
		}),
	check("detallefactura_check", sql`((idprendaservicio IS NOT NULL) AND (idproducto IS NULL)) OR ((idprendaservicio IS NULL) AND (idproducto IS NOT NULL))`),
]);

export const prendaservicio = pgTable("prendaservicio", {
	idprendaservicio: integer().primaryKey().generatedByDefaultAsIdentity({ name: "prendaservicio_idprendaservicio_seq", startWith: 1, increment: 1, minValue: 1, maxValue: 2147483647, cache: 1 }),
	idprenda: integer().notNull(),
	idservicio: integer().notNull(),
	preciounitario: numeric({ precision: 10, scale:  2 }).notNull(),
}, (table) => [
	foreignKey({
			columns: [table.idprenda],
			foreignColumns: [prendas.idprenda],
			name: "fk_prendaservicio_prendas"
		}),
	foreignKey({
			columns: [table.idservicio],
			foreignColumns: [servicios.idservicio],
			name: "fk_prendaservicio_servicios"
		}),
	unique("prendaservicio_idprenda_idservicio_key").on(table.idprenda, table.idservicio),
]);

export const productos = pgTable("productos", {
	idproducto: integer().primaryKey().generatedByDefaultAsIdentity({ name: "productos_idproducto_seq", startWith: 1, increment: 1, minValue: 1, maxValue: 2147483647, cache: 1 }),
	nombre: varchar({ length: 150 }).notNull(),
	descripcion: text(),
	codigobarras: varchar({ length: 50 }),
	precioventa: numeric({ precision: 10, scale:  2 }).notNull(),
	costo: numeric({ precision: 10, scale:  2 }),
	stockactual: integer().default(0).notNull(),
	stockminimo: integer().default(0),
	idcategoria: integer(),
	idestado: integer().notNull(),
	fechacreacion: timestamp({ mode: 'string' }).default(sql`CURRENT_TIMESTAMP`),
}, (table) => [
	foreignKey({
			columns: [table.idcategoria],
			foreignColumns: [categoriasproducto.idcategoria],
			name: "fk_productos_categoriasproducto"
		}),
	foreignKey({
			columns: [table.idestado],
			foreignColumns: [estados.idestado],
			name: "fk_productos_estados"
		}),
]);

export const usuarios = pgTable("usuarios", {
	idusuario: integer().primaryKey().generatedByDefaultAsIdentity({ name: "usuarios_idusuario_seq", startWith: 1, increment: 1, minValue: 1, maxValue: 2147483647, cache: 1 }),
	nombre: varchar({ length: 100 }).notNull(),
	apellido: varchar({ length: 100 }),
	email: varchar({ length: 100 }),
	username: varchar({ length: 50 }).notNull(),
	passwordhash: varchar({ length: 255 }).notNull(),
	idestado: integer().notNull(),
	fechacreacion: timestamp({ mode: 'string' }).default(sql`CURRENT_TIMESTAMP`),
	fechaultimologin: timestamp({ mode: 'string' }),
	passwordresettoken: varchar({ length: 300 }),
	passwordresettokenexpiry: timestamp({ mode: 'string' }),
}, (table) => [
	foreignKey({
			columns: [table.idestado],
			foreignColumns: [estados.idestado],
			name: "fk_usuarios_estados"
		}),
	unique("usuarios_email_key").on(table.email),
	unique("usuarios_username_key").on(table.username),
]);

export const gastos = pgTable("gastos", {
	idgasto: integer().primaryKey().generatedByDefaultAsIdentity({ name: "gastos_idgasto_seq", startWith: 1, increment: 1, minValue: 1, maxValue: 2147483647, cache: 1 }),
	idcategoriagasto: integer().notNull(),
	monto: numeric({ precision: 18, scale:  2 }).notNull(),
	fechagasto: timestamp({ mode: 'string' }).notNull(),
	descripcion: varchar({ length: 500 }),
	referencia: varchar({ length: 200 }),
	comprobanteurl: varchar({ length: 500 }),
	idusuario: integer().notNull(),
	idestado: integer().default(1).notNull(),
	fechacreacion: timestamp({ mode: 'string' }).default(sql`CURRENT_TIMESTAMP`).notNull(),
	fechaultimaactualizacion: timestamp({ mode: 'string' }).default(sql`CURRENT_TIMESTAMP`).notNull(),
}, (table) => [
	foreignKey({
			columns: [table.idcategoriagasto],
			foreignColumns: [categoriasgasto.idcategoriagasto],
			name: "fk_gastos_categoriasgasto"
		}),
	foreignKey({
			columns: [table.idestado],
			foreignColumns: [estados.idestado],
			name: "fk_gastos_estados"
		}),
	foreignKey({
			columns: [table.idusuario],
			foreignColumns: [usuarios.idusuario],
			name: "fk_gastos_usuarios"
		}),
	check("gastos_monto_check", sql`monto > (0)::numeric`),
]);

export const pagos = pgTable("pagos", {
	idpago: integer().primaryKey().generatedByDefaultAsIdentity({ name: "pagos_idpago_seq", startWith: 1, increment: 1, minValue: 1, maxValue: 2147483647, cache: 1 }),
	idfactura: integer().notNull(),
	monto: numeric({ precision: 10, scale:  2 }).notNull(),
	idestado: integer().notNull(),
	fechapago: timestamp({ mode: 'string' }).default(sql`CURRENT_TIMESTAMP`),
	fechaultimaActualizacion: timestamp("fechaultima_actualizacion", { mode: 'string' }).default(sql`CURRENT_TIMESTAMP`),
	metodopago: varchar({ length: 20 }).notNull(),
	referencia: varchar({ length: 100 }),
	idusuario: integer().notNull(),
	notas: text(),
}, (table) => [
	foreignKey({
			columns: [table.idestado],
			foreignColumns: [estados.idestado],
			name: "fk_pagos_estados"
		}),
	foreignKey({
			columns: [table.idfactura],
			foreignColumns: [facturas.idfactura],
			name: "fk_pagos_facturas"
		}),
	foreignKey({
			columns: [table.idusuario],
			foreignColumns: [usuarios.idusuario],
			name: "fk_pagos_usuarios"
		}),
	check("pagos_metodopago_check", sql`(metodopago)::text = ANY ((ARRAY['otro'::character varying, 'transferencia'::character varying, 'tarjeta'::character varying, 'efectivo'::character varying])::text[])`),
]);

export const prendas = pgTable("prendas", {
	idprenda: integer().primaryKey().generatedByDefaultAsIdentity({ name: "prendas_idprenda_seq", startWith: 1, increment: 1, minValue: 1, maxValue: 2147483647, cache: 1 }),
	nombre: varchar({ length: 100 }).notNull(),
	descripcion: text(),
});

export const servicios = pgTable("servicios", {
	idservicio: integer().primaryKey().generatedByDefaultAsIdentity({ name: "servicios_idservicio_seq", startWith: 1, increment: 1, minValue: 1, maxValue: 2147483647, cache: 1 }),
	nombre: varchar({ length: 100 }).notNull(),
	descripcion: text(),
	duracionEstimada: integer("duracion_estimada"),
	idestado: integer().notNull(),
	fechaCreacion: timestamp("fecha_creacion", { mode: 'string' }).default(sql`CURRENT_TIMESTAMP`),
	fechaultimaactualizacion: timestamp({ mode: 'string' }).default(sql`CURRENT_TIMESTAMP`),
}, (table) => [
	foreignKey({
			columns: [table.idestado],
			foreignColumns: [estados.idestado],
			name: "fk_servicios_estados"
		}),
]);

export const categoriasproducto = pgTable("categoriasproducto", {
	idcategoria: integer().primaryKey().generatedByDefaultAsIdentity({ name: "categoriasproducto_idcategoria_seq", startWith: 1, increment: 1, minValue: 1, maxValue: 2147483647, cache: 1 }),
	nombre: varchar({ length: 50 }).notNull(),
});

export const refreshtokens = pgTable("refreshtokens", {
	idrefreshtokens: integer().primaryKey().generatedByDefaultAsIdentity({ name: "refreshtokens_idrefreshtokens_seq", startWith: 1, increment: 1, minValue: 1, maxValue: 2147483647, cache: 1 }),
	idusuario: integer().notNull(),
	token: varchar({ length: 500 }).notNull(),
	expires: timestamp({ mode: 'string' }).notNull(),
	created: timestamp({ mode: 'string' }).notNull(),
	createdbyip: varchar({ length: 50 }).notNull(),
	revoked: timestamp({ mode: 'string' }),
	revokedbyip: varchar({ length: 50 }),
	replacedbytoken: varchar({ length: 500 }),
}, (table) => [
	foreignKey({
			columns: [table.idusuario],
			foreignColumns: [usuarios.idusuario],
			name: "fk_refreshtokens_usuarios"
		}).onDelete("cascade"),
]);

export const roles = pgTable("roles", {
	idrol: integer().primaryKey().generatedByDefaultAsIdentity({ name: "roles_idrol_seq", startWith: 1, increment: 1, minValue: 1, maxValue: 2147483647, cache: 1 }),
	nombre: varchar({ length: 50 }).notNull(),
	descripcion: varchar({ length: 200 }),
	idestado: integer().notNull(),
	fechacreacion: timestamp({ mode: 'string' }).default(sql`CURRENT_TIMESTAMP`),
}, (table) => [
	foreignKey({
			columns: [table.idestado],
			foreignColumns: [estados.idestado],
			name: "fk_roles_estados"
		}),
	unique("roles_nombre_key").on(table.nombre),
]);

export const categoriasgasto = pgTable("categoriasgasto", {
	idcategoriagasto: integer().primaryKey().generatedByDefaultAsIdentity({ name: "categoriasgasto_idcategoriagasto_seq", startWith: 1, increment: 1, minValue: 1, maxValue: 2147483647, cache: 1 }),
	nombre: varchar({ length: 100 }).notNull(),
	descripcion: varchar({ length: 500 }),
	color: varchar({ length: 20 }).default('#6B7280'),
	idestado: integer().default(1).notNull(),
	fechacreacion: timestamp({ mode: 'string' }).default(sql`CURRENT_TIMESTAMP`).notNull(),
	montopredefinido: numeric({ precision: 18, scale:  2 }),
}, (table) => [
	foreignKey({
			columns: [table.idestado],
			foreignColumns: [estados.idestado],
			name: "fk_categoriasgasto_estados"
		}),
]);

// ==========================================
// GRUPOS DE FACTURAS
// ==========================================

export const gruposFacturas = pgTable("grupos_facturas", {
	idgrupo: integer().primaryKey().generatedByDefaultAsIdentity({ name: "grupos_facturas_idgrupo_seq", startWith: 1, increment: 1, minValue: 1, maxValue: 2147483647, cache: 1 }),
	nombre: varchar({ length: 100 }).notNull(),
	idcliente: integer(),
	nombrecliente: varchar({ length: 100 }),
	notas: text(),
	idestado: integer().notNull().default(4),
	fechacreacion: timestamp({ mode: 'string' }).default(sql`CURRENT_TIMESTAMP`).notNull(),
	fechaultimaactualizacion: timestamp({ mode: 'string' }).default(sql`CURRENT_TIMESTAMP`).notNull(),
	idusuario: integer().notNull(),
}, (table) => [
	foreignKey({
			columns: [table.idcliente],
			foreignColumns: [clientes.idcliente],
			name: "fk_grupos_facturas_clientes"
		}),
	foreignKey({
			columns: [table.idestado],
			foreignColumns: [estados.idestado],
			name: "fk_grupos_facturas_estados"
		}),
	foreignKey({
			columns: [table.idusuario],
			foreignColumns: [usuarios.idusuario],
			name: "fk_grupos_facturas_usuarios"
		}),
]);

export const gruposFacturasDetalle = pgTable("grupos_facturas_detalle", {
	id: integer().primaryKey().generatedByDefaultAsIdentity({ name: "grupos_facturas_detalle_id_seq", startWith: 1, increment: 1, minValue: 1, maxValue: 2147483647, cache: 1 }),
	idgrupo: integer().notNull(),
	idfactura: integer().notNull(),
	fechaasignacion: timestamp({ mode: 'string' }).default(sql`CURRENT_TIMESTAMP`).notNull(),
}, (table) => [
	foreignKey({
			columns: [table.idgrupo],
			foreignColumns: [gruposFacturas.idgrupo],
			name: "fk_grupos_detalle_grupo"
		}).onDelete("cascade"),
	foreignKey({
			columns: [table.idfactura],
			foreignColumns: [facturas.idfactura],
			name: "fk_grupos_detalle_factura"
		}),
	unique("grupos_facturas_detalle_idfactura_key").on(table.idfactura),
]);

export const usuariorol = pgTable("usuariorol", {
	idusuario: integer().notNull(),
	idrol: integer().notNull(),
	fechaasignacion: timestamp({ mode: 'string' }).default(sql`CURRENT_TIMESTAMP`),
}, (table) => [
	foreignKey({
			columns: [table.idrol],
			foreignColumns: [roles.idrol],
			name: "fk_usuariorol_roles"
		}),
	foreignKey({
			columns: [table.idusuario],
			foreignColumns: [usuarios.idusuario],
			name: "fk_usuariorol_usuarios"
		}),
	primaryKey({ columns: [table.idusuario, table.idrol], name: "usuariorol_pkey"}),
]);
