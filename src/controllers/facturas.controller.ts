import { Request, Response } from 'express';
import { eq, ilike, and, gte, lte, desc, inArray, sql, or } from 'drizzle-orm';
import { db } from '../db/index.js';
import * as schema from '../db/schema.js';
import { AuthRequest } from '../middlewares/auth.middleware.js';

// --- HELPER DE ZONA HORARIA (República Dominicana UTC-4) ---
const getDRDateTime = (dateVal?: string | Date) => {
    const d = dateVal ? new Date(dateVal) : new Date();
    const options: Intl.DateTimeFormatOptions = { 
        timeZone: 'America/Santo_Domingo',
        year: 'numeric', month: '2-digit', day: '2-digit',
        hour: '2-digit', minute: '2-digit', second: '2-digit',
        hour12: false 
    };
    const parts = new Intl.DateTimeFormat('en-US', options).formatToParts(d);
    const map = Object.fromEntries(parts.map(({ type, value }) => [type, value]));
    const hour = map.hour === '24' ? '00' : map.hour;
    return `${map.year}-${map.month}-${map.day}T${hour}:${map.minute}:${map.second}`;
};

const getDRDateOnly = (dateVal?: string | Date) => {
    return getDRDateTime(dateVal).substring(0, 10);
};

const getConfigBool = async (txOrDb: any, clave: string): Promise<boolean> => {
    const config = await txOrDb.select().from(schema.configuraciones).where(eq(schema.configuraciones.clave, clave));
    if (config.length === 0) return false;
    return config[0].valor.toLowerCase() === 'true';
};

// ==========================================
// 1. LECTURA Y RESÚMENES (GET)
// ==========================================

export const getFacturasResumen = async (req: Request, res: Response) => {
    try {
        const { search, estadoId, fechaDesde, fechaHasta, clienteId, page = 1, pageSize = 20 } = req.query;
        
        const currentPage = Math.max(1, Number(page));
        const limit = Math.max(1, Number(pageSize));
        const offset = (currentPage - 1) * limit;

        const filters = [];

        if (estadoId) filters.push(eq(schema.facturas.idestado, Number(estadoId)));
        if (clienteId) filters.push(eq(schema.facturas.idcliente, Number(clienteId)));
        
        // Uso de fechas locales de RD para los filtros
        if (fechaDesde) filters.push(gte(schema.facturas.fechacreacion, getDRDateOnly(fechaDesde as string) + "T00:00:00"));
        if (fechaHasta) filters.push(lte(schema.facturas.fechacreacion, getDRDateOnly(fechaHasta as string) + "T23:59:59"));
        
        if (search) {
            const searchStr = `%${search}%`;
            filters.push(
                or(
                    ilike(schema.facturas.numerofactura, searchStr),
                    ilike(schema.facturas.nombrecliente, searchStr)
                )!
            );
        }

        const whereClause = filters.length > 0 ? and(...filters) : undefined;

        const countResult = await db.select({ count: sql<number>`count(*)` })
            .from(schema.facturas)
            .where(whereClause);
        const totalRecords = Number(countResult[0]?.count) || 0;

        const facturasDb = await db.select({
            factura: schema.facturas,
            estadoId: schema.estados.idestado,
            estadoNombre: schema.estados.nombre
        })
        .from(schema.facturas)
        .innerJoin(schema.estados, eq(schema.facturas.idestado, schema.estados.idestado))
        .where(whereClause)
        .orderBy(desc(schema.facturas.fechacreacion))
        .limit(limit)
        .offset(offset);

        const idsFacturas = facturasDb.map(f => f.factura.idfactura);
        let itemsPorFactura: Record<number, number> = {};
        
        if (idsFacturas.length > 0) {
            const detalles = await db.select({ 
                idFactura: schema.detallefactura.idfactura, 
                cantidad: schema.detallefactura.cantidad 
            })
            .from(schema.detallefactura)
            .where(inArray(schema.detallefactura.idfactura, idsFacturas));

            detalles.forEach(d => {
                if (!itemsPorFactura[d.idFactura]) itemsPorFactura[d.idFactura] = 0;
                itemsPorFactura[d.idFactura] += d.cantidad;
            });
        }

        const data = facturasDb.map(f => ({
            idFactura: f.factura.idfactura,
            numeroFactura: f.factura.numerofactura,
            nombreCliente: f.factura.nombrecliente,
            telefonoCliente: f.factura.telefonocliente,
            fechaCreacion: f.factura.fechacreacion ? f.factura.fechacreacion.replace(" ", "T") : null,
            fechaEntregaEstimada: f.factura.fechaentregaestimada ? f.factura.fechaentregaestimada.replace(" ", "T") : null,
            total: Number(f.factura.total),
            montoAbonado: Number(f.factura.montoabonado || 0),
            montoPendiente: Number(f.factura.montopendiente || 0),
            estado: {
                idEstado: f.estadoId,
                nombre: f.estadoNombre
            },
            totalItems: itemsPorFactura[f.factura.idfactura] || 0
        }));

        res.json({
            data,
            pagination: {
                page: currentPage,
                pageSize: limit,
                totalRecords,
                totalPages: Math.ceil(totalRecords / limit),
                hasPreviousPage: currentPage > 1,
                hasNextPage: currentPage < Math.ceil(totalRecords / limit)
            }
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Error al obtener resumen de facturas' });
    }
};

export const getFacturaDetallesCompletos = async (req: Request, res: Response) => {
    try {
        const idFactura = Number(req.params.id);

        const facturaRows = await db.select({
            factura: schema.facturas,
            estado: schema.estados,
            usuario: schema.usuarios,
            cliente: schema.clientes
        })
        .from(schema.facturas)
        .innerJoin(schema.estados, eq(schema.facturas.idestado, schema.estados.idestado))
        .innerJoin(schema.usuarios, eq(schema.facturas.idusuario, schema.usuarios.idusuario))
        .leftJoin(schema.clientes, eq(schema.facturas.idcliente, schema.clientes.idcliente))
        .where(eq(schema.facturas.idfactura, idFactura));

        if (facturaRows.length === 0) return res.status(404).json({ message: 'Factura no encontrada' });
        
        const f = facturaRows[0];

        const detallesDb = await db.select({
            detalle: schema.detallefactura,
            prendaNombre: schema.prendas.nombre,
            servicioNombre: schema.servicios.nombre,
            productoNombre: schema.productos.nombre,
            productoCodigo: schema.productos.codigobarras,
            categoriaProducto: schema.categoriasproducto.nombre
        })
        .from(schema.detallefactura)
        .leftJoin(schema.prendaservicio, eq(schema.detallefactura.idprendaservicio, schema.prendaservicio.idprendaservicio))
        .leftJoin(schema.prendas, eq(schema.prendaservicio.idprenda, schema.prendas.idprenda))
        .leftJoin(schema.servicios, eq(schema.prendaservicio.idservicio, schema.servicios.idservicio))
        .leftJoin(schema.productos, eq(schema.detallefactura.idproducto, schema.productos.idproducto))
        .leftJoin(schema.categoriasproducto, eq(schema.productos.idcategoria, schema.categoriasproducto.idcategoria))
        .where(eq(schema.detallefactura.idfactura, idFactura));

        const pagosDb = await db.select({
            pago: schema.pagos,
            usuarioNombre: schema.usuarios.nombre
        })
        .from(schema.pagos)
        .innerJoin(schema.usuarios, eq(schema.pagos.idusuario, schema.usuarios.idusuario))
        .where(eq(schema.pagos.idfactura, idFactura))
        .orderBy(desc(schema.pagos.fechapago));

        const resultado = {
            idFactura: f.factura.idfactura,
            numeroFactura: f.factura.numerofactura,
            nombreCliente: f.factura.nombrecliente,
            telefonoCliente: f.factura.telefonocliente,
            fechaCreacion: f.factura.fechacreacion ? f.factura.fechacreacion.replace(" ", "T") : null,
            fechaEntregaEstimada: f.factura.fechaentregaestimada ? f.factura.fechaentregaestimada.replace(" ", "T") : null,
            fechaEntregaReal: f.factura.fechaentregareal ? f.factura.fechaentregareal.replace(" ", "T") : null,
            subtotal: Number(f.factura.subtotal),
            impuestos: Number(f.factura.impuestos || 0),
            descuento: Number(f.factura.descuento || 0),
            total: Number(f.factura.total),
            montoAbonado: Number(f.factura.montoabonado || 0),
            montoPendiente: Number(f.factura.montopendiente || 0),
            metodoPago: f.factura.metodopago,
            notas: f.factura.notas,
            idEstadoEntrega: f.factura.idestadoentrega,
            recogidoPor: f.factura.recogidopor,
            notasEntrega: f.factura.notasentrega,
            cliente: f.cliente ? {
                idCliente: f.cliente.idcliente,
                nombre: `${f.cliente.nombre} ${f.cliente.apellido || ''}`.trim(),
                telefono: f.cliente.telefono,
                email: f.cliente.email
            } : null,
            estado: {
                idEstado: f.estado.idestado,
                nombre: f.estado.nombre
            },
            usuario: {
                idUsuario: f.usuario.idusuario,
                nombre: f.usuario.nombre
            },
            detalles: detallesDb.map(d => ({
                idDetalle: d.detalle.iddetalle,
                cantidad: d.detalle.cantidad,
                precioUnitario: Number(d.detalle.preciounitario),
                descripcion: d.detalle.descripcion,
                subtotal: d.detalle.cantidad * Number(d.detalle.preciounitario),
                tipo: d.detalle.idprendaservicio ? 'servicio' : 'producto',
                servicio: d.detalle.idprendaservicio ? {
                    idPrendaServicio: d.detalle.idprendaservicio,
                    prenda: d.prendaNombre,
                    servicio: d.servicioNombre
                } : null,
                producto: d.detalle.idproducto ? {
                    idProducto: d.detalle.idproducto,
                    nombre: d.productoNombre,
                    codigoBarras: d.productoCodigo,
                    categoria: d.categoriaProducto
                } : null
            })),
            pagos: pagosDb.map(p => ({
                idPago: p.pago.idpago,
                monto: Number(p.pago.monto),
                fechaPago: p.pago.fechapago ? p.pago.fechapago.replace(" ", "T") : null,
                metodoPago: p.pago.metodopago,
                referencia: p.pago.referencia,
                notas: p.pago.notas,
                usuario: p.usuarioNombre
            }))
        };

        res.json(resultado);
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Error al cargar detalles de la factura' });
    }
};

// ==========================================
// 2. CREACIÓN Y TRANSACCIONES (POST/PUT)
// ==========================================

export const createFactura = async (req: AuthRequest, res: Response) => {
    const userId = Number(req.user.nameid);
    const dto = req.body;

    try {
        await db.transaction(async (tx) => {
            const controlStockActivo = await getConfigBool(tx, "CONTROL_STOCK_ACTIVO");
            const controlEntregasActivo = await getConfigBool(tx, "CONTROL_ENTREGAS_ACTIVO");

            if (!dto.detalles || dto.detalles.length === 0) {
                throw new Error("La factura debe tener al menos un detalle");
            }

            let nombreCliente = dto.nombreCliente;
            let telefonoCliente = dto.telefonoCliente;

            if (dto.idCliente) {
                const clientes = await tx.select().from(schema.clientes).where(eq(schema.clientes.idcliente, dto.idCliente));
                if (clientes.length === 0) throw new Error("Cliente no encontrado");
                const c = clientes[0];
                nombreCliente = `${c.nombre} ${c.apellido || ''}`.trim();
                telefonoCliente = c.telefono || dto.telefonoCliente;
            } else if (!nombreCliente) {
                throw new Error("Debe proporcionar el nombre del cliente");
            }

            const hoyStr = getDRDateTime();
            const dateStr = getDRDateOnly().replace(/-/g, '');
            
            const countResult = await tx.select({ count: sql<number>`count(*)` }).from(schema.facturas);
            const totalDocs = Number(countResult[0]?.count) || 0;
            const numeroFactura = `F-${dateStr}-${(totalDocs + 1).toString().padStart(4, '0')}`;

            if (controlStockActivo) {
                for (const detalle of dto.detalles) {
                    if (detalle.idProducto) {
                        const producto = await tx.select().from(schema.productos).where(eq(schema.productos.idproducto, detalle.idProducto));
                        if (producto.length === 0) throw new Error("Producto no encontrado");
                        if (producto[0].stockactual < detalle.cantidad) {
                            throw new Error(`Stock insuficiente para ${producto[0].nombre}. Solicitado: ${detalle.cantidad}, Disponible: ${producto[0].stockactual}`);
                        }
                    }
                }
            }

            let estadoFactura = 4;
            let montoAbonado = 0;
            const totalStr = (dto.total || 0).toString();
            let montoPendiente = Number(dto.total || 0);

            if (dto.pagoInmediato && dto.montoAbonado > 0) {
                montoAbonado = Number(dto.montoAbonado);
                montoPendiente = Number(dto.total || 0) - montoAbonado;
                estadoFactura = montoPendiente <= 0 ? 5 : 4;
            }

            let estadoEntrega = null;
            if (controlEntregasActivo) {
                const tieneServicios = dto.detalles.some((d: any) => d.idPrendaServicio && d.idPrendaServicio > 0);
                if (tieneServicios) {
                    estadoEntrega = 7;
                }
            }

            let fechaEntregaFormatted = null;
            if (dto.fechaEntregaEstimada) {
                fechaEntregaFormatted = dto.fechaEntregaEstimada.substring(0, 10);
            }

            const nuevaFactura = await tx.insert(schema.facturas).values({
                idcliente: dto.idCliente ? Number(dto.idCliente) : null,
                nombrecliente: nombreCliente.trim(),
                telefonocliente: telefonoCliente ? telefonoCliente.trim() : null,
                idusuario: userId,
                idestado: estadoFactura,
                numerofactura: numeroFactura,
                fechacreacion: hoyStr,
                fechaultimaactualizacion: hoyStr,
                fechaentregaestimada: fechaEntregaFormatted,
                subtotal: String(dto.subtotal || 0),
                impuestos: String(dto.impuestos || 0),
                descuento: String(dto.descuento || 0),
                total: totalStr,
                metodopago: dto.metodoPago || 'efectivo',
                notas: dto.notas || null,
                montoabonado: String(montoAbonado || 0),
                montopendiente: String(montoPendiente || 0),
                idestadoentrega: estadoEntrega || null
            }).returning();

            const idFactura = nuevaFactura[0].idfactura;

            for (const detalle of dto.detalles) {
                await tx.insert(schema.detallefactura).values({
                    idfactura: idFactura,
                    cantidad: Number(detalle.cantidad),
                    preciounitario: String(detalle.precioUnitario || 0),
                    descripcion: detalle.descripcion || null,
                    fechacreacion: hoyStr,
                    idprendaservicio: detalle.idPrendaServicio ? Number(detalle.idPrendaServicio) : null,
                    idproducto: detalle.idProducto ? Number(detalle.idProducto) : null
                });

                if (controlStockActivo && detalle.idProducto) {
                    await tx.update(schema.productos)
                        .set({ stockactual: sql`${schema.productos.stockactual} - ${Number(detalle.cantidad)}` })
                        .where(eq(schema.productos.idproducto, Number(detalle.idProducto)));
                }
            }

            if (dto.pagoInmediato && montoAbonado > 0) {
                await tx.insert(schema.pagos).values({
                    idfactura: idFactura,
                    monto: String(montoAbonado),
                    idestado: 5, 
                    fechapago: hoyStr,
                    fechaultimaActualizacion: hoyStr, 
                    metodopago: dto.metodoPago || 'efectivo',
                    referencia: dto.referenciaPago || null,
                    idusuario: userId,
                    notas: 'Pago inicial al crear factura'
                });
            }

            res.status(201).json({ idFactura, message: "Factura creada exitosamente" });
        });
    } catch (error: any) {
        console.error("🔥 Error exacto en DB al crear factura:", error);
        res.status(400).json({ message: error.detail || error.message || "Error al crear factura" });
    }
};

export const registrarPago = async (req: AuthRequest, res: Response) => {
    const userId = Number(req.user.nameid);
    const idFactura = Number(req.params.id);
    const dto = req.body;
    const hoyStr = getDRDateTime();

    try {
        await db.transaction(async (tx) => {
            const facturas = await tx.select().from(schema.facturas).where(eq(schema.facturas.idfactura, idFactura));
            if (facturas.length === 0) throw new Error("Factura no encontrada");
            
            const f = facturas[0];
            const pendienteActual = Number(f.montopendiente || 0);

            if (Number(dto.monto) > pendienteActual) {
                throw new Error("El monto a pagar excede el monto pendiente");
            }

            const nuevoAbonado = Number(f.montoabonado || 0) + Number(dto.monto);
            const nuevoPendiente = Number(f.total) - nuevoAbonado;
            const nuevoEstado = nuevoPendiente <= 0 ? 5 : 4; 

            await tx.update(schema.facturas).set({
                montoabonado: String(nuevoAbonado),
                montopendiente: String(nuevoPendiente),
                idestado: nuevoEstado,
                fechaultimaactualizacion: hoyStr
            }).where(eq(schema.facturas.idfactura, idFactura));

            await tx.insert(schema.pagos).values({
                idfactura: idFactura,
                monto: String(dto.monto || 0),
                idestado: 5,
                fechapago: hoyStr,
                fechaultimaActualizacion: hoyStr, 
                metodopago: dto.metodoPago || 'efectivo',
                referencia: dto.referencia || null,
                idusuario: userId,
                notas: dto.notas || null
            });
        });

        res.json({ message: "Pago registrado exitosamente" });
    } catch (error: any) {
        res.status(400).json({ message: error.message || "Error al registrar pago" });
    }
};

// ==========================================
// 3. ENTREGAS
// ==========================================

export const getEntregasResumen = async (req: Request, res: Response) => {
    try {
        const { estadoEntrega, search } = req.query;
        const filters = [];
        
        if (estadoEntrega) filters.push(eq(schema.facturas.idestadoentrega, Number(estadoEntrega)));
        if (search) {
            const searchStr = `%${search}%`;
            filters.push(
                or(
                    ilike(schema.facturas.numerofactura, searchStr),
                    ilike(schema.facturas.nombrecliente, searchStr)
                )!
            );
        }

        const whereClause = filters.length > 0 ? and(...filters) : undefined;
        const facturasDb = await db.select({
            factura: schema.facturas,
            estadoNombre: schema.estados.nombre
        })
        .from(schema.facturas)
        .leftJoin(schema.estados, eq(schema.facturas.idestado, schema.estados.idestado))
        .where(whereClause)
        .orderBy(desc(schema.facturas.fechacreacion));

        const idsFacturas = facturasDb.map(f => f.factura.idfactura);
        let itemsPorFactura: Record<number, number> = {};
        if (idsFacturas.length > 0) {
            const detalles = await db.select({ idFactura: schema.detallefactura.idfactura, cantidad: schema.detallefactura.cantidad })
            .from(schema.detallefactura).where(inArray(schema.detallefactura.idfactura, idsFacturas));
            detalles.forEach(d => {
                if (!itemsPorFactura[d.idFactura]) itemsPorFactura[d.idFactura] = 0;
                itemsPorFactura[d.idFactura] += d.cantidad;
            });
        }

        const hoyMs = new Date().getTime();

        res.json(facturasDb.map(f => {
            const creacionMs = f.factura.fechacreacion ? new Date(f.factura.fechacreacion).getTime() : hoyMs;
            const diasDiff = Math.floor((hoyMs - creacionMs) / (1000 * 60 * 60 * 24));

            return {
                idFactura: f.factura.idfactura,
                numeroFactura: f.factura.numerofactura,
                nombreCliente: f.factura.nombrecliente,
                telefonoCliente: f.factura.telefonocliente,
                fechaCreacion: f.factura.fechacreacion ? f.factura.fechacreacion.replace(" ", "T") : null,
                fechaEntregaEstimada: f.factura.fechaentregaestimada ? f.factura.fechaentregaestimada.replace(" ", "T") : null,
                fechaEntregaReal: f.factura.fechaentregareal ? f.factura.fechaentregareal.replace(" ", "T") : null,
                total: Number(f.factura.total),
                montoAbonado: Number(f.factura.montoabonado || 0),
                montoPendiente: Number(f.factura.montopendiente || 0),
                recogidoPor: f.factura.recogidopor,
                notasEntrega: f.factura.notasentrega,
                idEstadoEntrega: f.factura.idestadoentrega,
                estado: {
                    idEstado: f.factura.idestado,
                    nombre: f.estadoNombre
                },
                totalItems: itemsPorFactura[f.factura.idfactura] || 0,
                diasDesdeCreacion: diasDiff
            };
        }));
    } catch (error) {
        res.status(500).json({ error: 'Error al obtener entregas' });
    }
};

export const getContadoresEntregas = async (req: Request, res: Response) => {
    try {
        const facturas = await db.select({ idestadoentrega: schema.facturas.idestadoentrega }).from(schema.facturas);
        let pendientes = 0, completadas = 0, parciales = 0;
        
        facturas.forEach(f => {
            if (f.idestadoentrega === 7) pendientes++; 
            else if (f.idestadoentrega === 8) completadas++; 
            else if (f.idestadoentrega === 9) parciales++; 
        });

        res.json({ total: facturas.length, pendientes, completadas, parciales });
    } catch (error) {
        res.status(500).json({ error: 'Error al obtener contadores' });
    }
};

export const marcarEntrega = async (req: Request, res: Response) => {
    try {
        const idFactura = Number(req.params.id);
        const dto = req.body;
        const controlEntregasActivo = await getConfigBool(db, "CONTROL_ENTREGAS_ACTIVO");

        if (!controlEntregasActivo) {
            return res.status(400).json({ message: "El control de entregas no está activo en configuración" });
        }

        const idEstadoNuevo = dto.entregaParcial ? 9 : 8; 
        const hoyStr = getDRDateTime();

        await db.update(schema.facturas).set({
            idestadoentrega: idEstadoNuevo,
            fechaentregareal: hoyStr,
            recogidopor: dto.recogidoPor || null,
            notasentrega: dto.notasEntrega || null,
            fechaultimaactualizacion: hoyStr
        }).where(eq(schema.facturas.idfactura, idFactura));

        res.json({ message: "Entrega registrada correctamente" });
    } catch (error) {
        res.status(500).json({ error: 'Error al registrar entrega' });
    }
};

export const actualizarEstadoEntrega = async (req: Request, res: Response) => {
    try {
        const idFactura = Number(req.params.id);
        const dto = req.body;

        await db.update(schema.facturas).set({
            idestadoentrega: dto.idEstadoEntrega,
            notasentrega: dto.notasEntrega || null,
            fechaultimaactualizacion: getDRDateTime()
        }).where(eq(schema.facturas.idfactura, idFactura));

        res.json({ message: "Estado de entrega actualizado correctamente" });
    } catch (error) {
        res.status(500).json({ error: 'Error al actualizar estado de entrega' });
    }
};

// ==========================================
// 4. OTROS METODOS IMPORTANTES
// ==========================================

export const deleteFactura = async (req: Request, res: Response) => {
    const idFactura = Number(req.params.id);
    
    try {
        await db.transaction(async (tx) => {
            const pagos = await tx.select().from(schema.pagos).where(eq(schema.pagos.idfactura, idFactura));
            if (pagos.length > 0) throw new Error("No se puede eliminar la factura porque tiene pagos registrados");

            const controlStockActivo = await getConfigBool(tx, "CONTROL_STOCK_ACTIVO");

            if (controlStockActivo) {
                const detalles = await tx.select().from(schema.detallefactura).where(eq(schema.detallefactura.idfactura, idFactura));
                for (const d of detalles) {
                    if (d.idproducto) {
                        await tx.update(schema.productos)
                            .set({ stockactual: sql`${schema.productos.stockactual} + ${d.cantidad}` })
                            .where(eq(schema.productos.idproducto, d.idproducto));
                    }
                }
            }

            await tx.delete(schema.detallefactura).where(eq(schema.detallefactura.idfactura, idFactura));
            await tx.delete(schema.facturas).where(eq(schema.facturas.idfactura, idFactura));
        });

        res.status(204).send();
    } catch (error: any) {
        res.status(400).json({ message: error.message || "Error al eliminar la factura" });
    }
};

export const cambiarEstado = async (req: Request, res: Response) => {
    try {
        const idFactura = Number(req.params.id);
        const { idEstado, notas } = req.body;

        await db.update(schema.facturas).set({
            idestado: idEstado,
            ...(notas && { notas }),
            fechaultimaactualizacion: getDRDateTime() 
        }).where(eq(schema.facturas.idfactura, idFactura));

        res.json({ message: "Estado actualizado correctamente" });
    } catch (error) {
        res.status(500).json({ error: 'Error al actualizar estado' });
    }
};

// ==========================================
// 5. ENDPOINTS ACCESORIOS
// ==========================================

export const validarItems = async (req: Request, res: Response) => {
    try {
        const items = req.body; 
        const controlStockActivo = await getConfigBool(db, "CONTROL_STOCK_ACTIVO");
        const resultado = [];

        for (const item of items) {
            if (item.idPrendaServicio) {
                const servicio = await db.select({
                    ps: schema.prendaservicio,
                    prenda: schema.prendas,
                    servicio: schema.servicios
                })
                .from(schema.prendaservicio)
                .innerJoin(schema.prendas, eq(schema.prendaservicio.idprenda, schema.prendas.idprenda))
                .innerJoin(schema.servicios, eq(schema.prendaservicio.idservicio, schema.servicios.idservicio))
                .where(eq(schema.prendaservicio.idprendaservicio, item.idPrendaServicio));

                if (servicio.length === 0) {
                    resultado.push({ valido: false, mensaje: "Servicio no encontrado", idPrendaServicio: item.idPrendaServicio });
                } else {
                    const s = servicio[0];
                    resultado.push({
                        valido: true,
                        tipo: 'servicio',
                        idPrendaServicio: s.ps.idprendaservicio,
                        nombre: `${s.prenda.nombre} - ${s.servicio.nombre}`,
                        precioUnitario: Number(s.ps.preciounitario)
                    });
                }
            } else if (item.idProducto) {
                const producto = await db.select({
                    p: schema.productos,
                    cat: schema.categoriasproducto
                })
                .from(schema.productos)
                .leftJoin(schema.categoriasproducto, eq(schema.productos.idcategoria, schema.categoriasproducto.idcategoria))
                .where(eq(schema.productos.idproducto, item.idProducto));

                if (producto.length === 0) {
                    resultado.push({ valido: false, mensaje: "Producto no encontrado", idProducto: item.idProducto });
                } else {
                    const p = producto[0];
                    if (controlStockActivo && p.p.stockactual < item.cantidad) {
                        resultado.push({
                            valido: false,
                            mensaje: `Stock insuficiente. Disponible: ${p.p.stockactual}`,
                            idProducto: p.p.idproducto,
                            stockDisponible: p.p.stockactual
                        });
                    } else {
                        resultado.push({
                            valido: true,
                            tipo: 'producto',
                            idProducto: p.p.idproducto,
                            nombre: p.p.nombre,
                            precioUnitario: Number(p.p.precioventa),
                            stockDisponible: p.p.stockactual,
                            categoria: p.cat?.nombre
                        });
                    }
                }
            }
        }
        res.json(resultado);
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Error al validar items' });
    }
};

export const getEstadisticas = async (req: Request, res: Response) => {
    try {
        const { fechaDesde, fechaHasta } = req.query;
        const filters = [];
        
        if (fechaDesde) filters.push(gte(schema.facturas.fechacreacion, getDRDateOnly(fechaDesde as string) + "T00:00:00"));
        if (fechaHasta) filters.push(lte(schema.facturas.fechacreacion, getDRDateOnly(fechaHasta as string) + "T23:59:59"));
        
        const whereClause = filters.length > 0 ? and(...filters) : undefined;
        const facturas = await db.select().from(schema.facturas).where(whereClause);

        const totalFacturas = facturas.length;
        const totalVentas = facturas.reduce((acc, f) => acc + Number(f.total), 0);
        const totalAbonado = facturas.reduce((acc, f) => acc + Number(f.montoabonado || 0), 0);
        const totalPendiente = facturas.reduce((acc, f) => acc + Number(f.montopendiente || 0), 0);
        const facturasPagadas = facturas.filter(f => f.idestado === 5).length; 
        const facturasPendientes = facturas.filter(f => f.idestado === 4).length; 
        const promedioVenta = totalFacturas > 0 ? totalVentas / totalFacturas : 0;

        res.json({
            totalFacturas,
            totalVentas,
            totalAbonado,
            totalPendiente,
            facturasPagadas,
            facturasPendientes,
            promedioVenta
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Error al obtener estadísticas' });
    }
};

export const getProximasEntrega = async (req: Request, res: Response) => {
    try {
        const dias = Number(req.query.dias) || 3;
        const hoyStr = getDRDateTime();
        const hoyDate = new Date(hoyStr);
        hoyDate.setDate(hoyDate.getDate() + dias);
        const fechaLimiteIso = hoyDate.toISOString().split('T')[0] + "T23:59:59";

        const facturasDb = await db.select({
            factura: schema.facturas,
            estadoNombre: schema.estados.nombre
        })
        .from(schema.facturas)
        .innerJoin(schema.estados, eq(schema.facturas.idestado, schema.estados.idestado))
        .where(
            and(
                sql`${schema.facturas.fechaentregaestimada} IS NOT NULL`,
                lte(schema.facturas.fechaentregaestimada, fechaLimiteIso),
                sql`${schema.facturas.idestadoentrega} != 8` 
            )
        )
        .orderBy(schema.facturas.fechaentregaestimada);

        const data = facturasDb.map(f => {
            const estimated = new Date(f.factura.fechaentregaestimada!);
            const hoyReal = new Date(hoyStr);
            const diasRestantes = Math.ceil((estimated.getTime() - hoyReal.getTime()) / (1000 * 60 * 60 * 24));
            return {
                idFactura: f.factura.idfactura,
                numeroFactura: f.factura.numerofactura,
                nombreCliente: f.factura.nombrecliente,
                telefonoCliente: f.factura.telefonocliente,
                fechaEntregaEstimada: f.factura.fechaentregaestimada?.replace(" ", "T"),
                total: Number(f.factura.total),
                montoPendiente: Number(f.factura.montopendiente || 0),
                estado: f.estadoNombre,
                diasRestantes
            };
        });

        res.json(data);
    } catch(error) {
        console.error(error);
        res.status(500).json({ error: 'Error al obtener próximas entregas' });
    }
};

export const getFacturasPendientesPago = async (req: Request, res: Response) => {
    try {
        const { page = 1, pageSize = 20 } = req.query;
        const currentPage = Math.max(1, Number(page));
        const limit = Math.max(1, Number(pageSize));
        const offset = (currentPage - 1) * limit;

        const whereClause = eq(schema.facturas.idestado, 4); 

        const countResult = await db.select({ count: sql<number>`count(*)` })
            .from(schema.facturas)
            .where(whereClause);
        const totalRecords = Number(countResult[0]?.count) || 0;

        const facturas = await db.select()
            .from(schema.facturas)
            .where(whereClause)
            .orderBy(desc(schema.facturas.fechacreacion))
            .limit(limit)
            .offset(offset);

        res.json({
            data: facturas,
            pagination: {
                page: currentPage,
                pageSize: limit,
                totalRecords,
                totalPages: Math.ceil(totalRecords / limit),
                hasPreviousPage: currentPage > 1,
                hasNextPage: currentPage < Math.ceil(totalRecords / limit)
            }
        });
    } catch(error) {
        console.error(error);
        res.status(500).json({ error: 'Error al obtener facturas pendientes' });
    }
};