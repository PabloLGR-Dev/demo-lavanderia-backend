CREATE TABLE "categorias_gasto" (
	"id_categoria_gasto" bigint PRIMARY KEY NOT NULL,
	"nombre" text NOT NULL,
	"descripcion" text,
	"color" text,
	"id_estado" bigint,
	"fecha_creacion" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "categorias_producto" (
	"id_categoria" bigint PRIMARY KEY NOT NULL,
	"nombre" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "clientes" (
	"id_cliente" bigint PRIMARY KEY NOT NULL,
	"nombre" text,
	"apellido" text,
	"direccion" text,
	"telefono" text,
	"email" text,
	"id_estado" bigint,
	"fecha_registro" timestamp DEFAULT now(),
	"fecha_ultima_actualizacion" timestamp DEFAULT now(),
	"notas" text
);
--> statement-breakpoint
CREATE TABLE "configuraciones" (
	"id_configuracion" bigint PRIMARY KEY NOT NULL,
	"clave" text NOT NULL,
	"valor" text,
	"descripcion" text,
	"tipo_dato" text,
	"fecha_creacion" timestamp DEFAULT now(),
	"fecha_ultima_actualizacion" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "detalle_factura" (
	"id_detalle" bigint PRIMARY KEY NOT NULL,
	"id_factura" bigint,
	"id_prenda_servicio" bigint,
	"cantidad" integer NOT NULL,
	"precio_unitario" numeric NOT NULL,
	"subtotal" numeric,
	"descripcion" text,
	"fecha_creacion" timestamp DEFAULT now(),
	"id_producto" bigint,
	"tipo_item" text
);
--> statement-breakpoint
CREATE TABLE "estados" (
	"id_estado" bigint PRIMARY KEY NOT NULL,
	"nombre" text NOT NULL,
	"descripcion" text,
	"activo" boolean DEFAULT true NOT NULL,
	"fecha_creacion" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "facturas" (
	"id_factura" bigint PRIMARY KEY NOT NULL,
	"id_cliente" bigint,
	"nombre_cliente" text,
	"telefono_cliente" text,
	"id_usuario" bigint,
	"id_estado" bigint,
	"numero_factura" text,
	"fecha_creacion" timestamp DEFAULT now(),
	"fecha_ultima_actualizacion" timestamp DEFAULT now(),
	"fecha_entrega_estimada" date,
	"fecha_entrega_real" timestamp,
	"subtotal" numeric NOT NULL,
	"impuestos" numeric,
	"descuento" numeric,
	"total" numeric NOT NULL,
	"metodo_pago" text,
	"notas" text,
	"monto_abonado" numeric,
	"monto_pendiente" numeric,
	"id_estado_entrega" bigint,
	"recogido_por" text,
	"notas_entrega" text
);
--> statement-breakpoint
CREATE TABLE "gastos" (
	"id_gasto" bigint PRIMARY KEY NOT NULL,
	"id_categoria_gasto" bigint,
	"monto" numeric NOT NULL,
	"fecha_gasto" timestamp NOT NULL,
	"descripcion" text,
	"referencia" text,
	"comprobante_url" text,
	"id_usuario" bigint,
	"id_estado" bigint,
	"fecha_creacion" timestamp DEFAULT now(),
	"fecha_ultima_actualizacion" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "pagos" (
	"id_pago" bigint PRIMARY KEY NOT NULL,
	"id_factura" bigint,
	"monto" numeric NOT NULL,
	"id_estado" bigint,
	"fecha_pago" timestamp,
	"fecha_ultima_actualizacion" timestamp DEFAULT now(),
	"metodo_pago" text,
	"referencia" text,
	"id_usuario" bigint,
	"notas" text
);
--> statement-breakpoint
CREATE TABLE "prendas_servicios" (
	"id_prenda_servicio" bigint PRIMARY KEY NOT NULL,
	"id_prenda" bigint,
	"id_servicio" bigint,
	"precio_unitario" numeric NOT NULL
);
--> statement-breakpoint
CREATE TABLE "prendas" (
	"id_prenda" bigint PRIMARY KEY NOT NULL,
	"nombre" text,
	"descripcion" text
);
--> statement-breakpoint
CREATE TABLE "productos" (
	"id_producto" bigint PRIMARY KEY NOT NULL,
	"nombre" text,
	"descripcion" text,
	"codigo_barras" text,
	"precio_venta" numeric NOT NULL,
	"costo" numeric,
	"stock_actual" integer DEFAULT 0 NOT NULL,
	"stock_minimo" integer DEFAULT 0,
	"id_categoria" bigint,
	"id_estado" bigint,
	"fecha_creacion" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "refresh_tokens" (
	"id_refresh_tokens" bigint PRIMARY KEY NOT NULL,
	"id_usuario" bigint,
	"token" text,
	"expires" timestamp NOT NULL,
	"created" timestamp DEFAULT now(),
	"created_by_ip" text,
	"revoked" timestamp,
	"revoked_by_ip" text,
	"replaced_by_token" text
);
--> statement-breakpoint
CREATE TABLE "roles" (
	"id_rol" bigint PRIMARY KEY NOT NULL,
	"nombre" text NOT NULL,
	"descripcion" text,
	"id_estado" bigint,
	"fecha_creacion" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "servicios" (
	"id_servicio" bigint PRIMARY KEY NOT NULL,
	"nombre" text,
	"descripcion" text,
	"duracion_estimada" integer,
	"id_estado" bigint,
	"fecha_creacion" timestamp DEFAULT now(),
	"fecha_ultima_actualizacion" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "usuario_rol" (
	"id_usuario" bigint PRIMARY KEY NOT NULL,
	"id_rol" bigint PRIMARY KEY NOT NULL,
	"fecha_asignacion" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "usuarios" (
	"id_usuario" bigint PRIMARY KEY NOT NULL,
	"nombre" text,
	"apellido" text,
	"email" text,
	"username" text,
	"password_hash" text,
	"id_estado" bigint,
	"fecha_creacion" timestamp DEFAULT now(),
	"fecha_ultimo_login" timestamp
);
