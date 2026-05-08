import { Response } from 'express';
import { eq, and, desc, asc, sql, ilike, or, gt, inArray, not } from 'drizzle-orm';
import { db } from '../db/index.js';
import * as schema from '../db/schema.js';
import { AuthRequest } from '../middlewares/auth.middleware.js';

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

// ==========================================
// GET /resumen - Lista de grupos con totales
// ==========================================
export const getGruposResumen = async (req: AuthRequest, res: Response) => {
    try {
        const { search, estadoId, page = 1, pageSize = 20 } = req.query;

        const currentPage = Math.max(1, Number(page));
        const limit = Math.max(1, Number(pageSize));
        const offset = (currentPage - 1) * limit;

        const filters: any[] = [];
        if (estadoId) filters.push(eq(schema.gruposFacturas.idestado, Number(estadoId)));
        if (search) {
            const s = `%${search}%`;
            filters.push(
                or(
                    ilike(schema.gruposFacturas.nombre, s),
                    ilike(schema.gruposFacturas.nombrecliente, s)
                )!
            );
        }

        const whereClause = filters.length > 0 ? and(...filters) : undefined;

        const countResult = await db
            .select({ count: sql<number>`count(*)` })
            .from(schema.gruposFacturas)
            .where(whereClause);
        const totalRecords = Number(countResult[0]?.count) || 0;

        const grupos = await db
            .select({
                grupo: schema.gruposFacturas,
                estadoNombre: schema.estados.nombre,
                clienteNombre: schema.clientes.nombre,
                clienteApellido: schema.clientes.apellido,
            })
            .from(schema.gruposFacturas)
            .innerJoin(schema.estados, eq(schema.gruposFacturas.idestado, schema.estados.idestado))
            .leftJoin(schema.clientes, eq(schema.gruposFacturas.idcliente, schema.clientes.idcliente))
            .where(whereClause)
            .orderBy(desc(schema.gruposFacturas.fechacreacion))
            .limit(limit)
            .offset(offset);

        // Para cada grupo, calcular los totales
        const gruposConTotales = await Promise.all(
            grupos.map(async (g) => {
                const totales = await db
                    .select({
                        totalFacturas: sql<number>`count(*)`,
                        totalMonto: sql<number>`coalesce(sum(${schema.facturas.total}), 0)`,
                        totalAbonado: sql<number>`coalesce(sum(${schema.facturas.montoabonado}), 0)`,
                        totalPendiente: sql<number>`coalesce(sum(${schema.facturas.montopendiente}), 0)`,
                    })
                    .from(schema.gruposFacturasDetalle)
                    .leftJoin(schema.facturas, eq(schema.gruposFacturasDetalle.idfactura, schema.facturas.idfactura))
                    .where(eq(schema.gruposFacturasDetalle.idgrupo, g.grupo.idgrupo));

                return {
                    idGrupo: g.grupo.idgrupo,
                    nombre: g.grupo.nombre,
                    idCliente: g.grupo.idcliente,
                    nombreCliente: g.grupo.idcliente
                        ? `${g.clienteNombre || ''} ${g.clienteApellido || ''}`.trim()
                        : g.grupo.nombrecliente,
                    notas: g.grupo.notas,
                    idEstado: g.grupo.idestado,
                    estadoNombre: g.estadoNombre,
                    fechaCreacion: g.grupo.fechacreacion,
                    fechaUltimaActualizacion: g.grupo.fechaultimaactualizacion,
                    totalFacturas: Number(totales[0]?.totalFacturas || 0),
                    totalMonto: Number(totales[0]?.totalMonto || 0),
                    totalAbonado: Number(totales[0]?.totalAbonado || 0),
                    totalPendiente: Number(totales[0]?.totalPendiente || 0),
                };
            })
        );

        res.json({
            data: gruposConTotales,
            pagination: {
                currentPage,
                pageSize: limit,
                totalRecords,
                totalPages: Math.ceil(totalRecords / limit),
            },
        });
    } catch (error) {
        console.error('Error getGruposResumen:', error);
        res.status(500).json({ error: 'Error al obtener grupos de facturas' });
    }
};

// ==========================================
// GET /:id - Detalle completo de un grupo
// ==========================================
export const getGrupoDetalle = async (req: AuthRequest, res: Response) => {
    try {
        const { id } = req.params;

        const grupoDb = await db
            .select({
                grupo: schema.gruposFacturas,
                estadoNombre: schema.estados.nombre,
                clienteNombre: schema.clientes.nombre,
                clienteApellido: schema.clientes.apellido,
            })
            .from(schema.gruposFacturas)
            .innerJoin(schema.estados, eq(schema.gruposFacturas.idestado, schema.estados.idestado))
            .leftJoin(schema.clientes, eq(schema.gruposFacturas.idcliente, schema.clientes.idcliente))
            .where(eq(schema.gruposFacturas.idgrupo, Number(id)));

        if (!grupoDb.length) return res.status(404).json({ error: 'Grupo no encontrado' });

        const g = grupoDb[0];

        // Obtener facturas del grupo
        const facturasGrupo = await db
            .select({
                factura: schema.facturas,
                estadoNombre: schema.estados.nombre,
            })
            .from(schema.gruposFacturasDetalle)
            .innerJoin(schema.facturas, eq(schema.gruposFacturasDetalle.idfactura, schema.facturas.idfactura))
            .innerJoin(schema.estados, eq(schema.facturas.idestado, schema.estados.idestado))
            .where(eq(schema.gruposFacturasDetalle.idgrupo, Number(id)))
            .orderBy(asc(schema.facturas.fechacreacion));

        // Obtener historial de pagos de todas las facturas del grupo
        const idFacturas = facturasGrupo.map(f => f.factura.idfactura);
        let historialPagos: any[] = [];

        if (idFacturas.length > 0) {
            const pagosDb = await db
                .select({
                    pago: schema.pagos,
                    usuarioNombre: schema.usuarios.nombre,
                    usuarioApellido: schema.usuarios.apellido,
                    numeroFactura: schema.facturas.numerofactura,
                })
                .from(schema.pagos)
                .innerJoin(schema.usuarios, eq(schema.pagos.idusuario, schema.usuarios.idusuario))
                .innerJoin(schema.facturas, eq(schema.pagos.idfactura, schema.facturas.idfactura))
                .where(inArray(schema.pagos.idfactura, idFacturas))
                .orderBy(desc(schema.pagos.fechapago));

            historialPagos = pagosDb.map(p => ({
                idPago: p.pago.idpago,
                idFactura: p.pago.idfactura,
                numeroFactura: p.numeroFactura,
                monto: Number(p.pago.monto),
                fechaPago: p.pago.fechapago,
                metodoPago: p.pago.metodopago,
                referencia: p.pago.referencia,
                notas: p.pago.notas,
                usuario: `${p.usuarioNombre} ${p.usuarioApellido || ''}`.trim(),
            }));
        }

        const facturasFormateadas = facturasGrupo.map(f => ({
            idFactura: f.factura.idfactura,
            numeroFactura: f.factura.numerofactura,
            nombreCliente: f.factura.nombrecliente,
            fechaCreacion: f.factura.fechacreacion,
            fechaEntregaEstimada: f.factura.fechaentregaestimada,
            total: Number(f.factura.total),
            montoAbonado: Number(f.factura.montoabonado || 0),
            montoPendiente: Number(f.factura.montopendiente || 0),
            estado: { idEstado: f.factura.idestado, nombre: f.estadoNombre },
        }));

        const totalMonto = facturasFormateadas.reduce((s, f) => s + f.total, 0);
        const totalAbonado = facturasFormateadas.reduce((s, f) => s + f.montoAbonado, 0);
        const totalPendiente = facturasFormateadas.reduce((s, f) => s + f.montoPendiente, 0);

        res.json({
            idGrupo: g.grupo.idgrupo,
            nombre: g.grupo.nombre,
            idCliente: g.grupo.idcliente,
            nombreCliente: g.grupo.idcliente
                ? `${g.clienteNombre || ''} ${g.clienteApellido || ''}`.trim()
                : g.grupo.nombrecliente,
            notas: g.grupo.notas,
            idEstado: g.grupo.idestado,
            estadoNombre: g.estadoNombre,
            fechaCreacion: g.grupo.fechacreacion,
            fechaUltimaActualizacion: g.grupo.fechaultimaactualizacion,
            totalFacturas: facturasFormateadas.length,
            totalMonto,
            totalAbonado,
            totalPendiente,
            facturas: facturasFormateadas,
            historialPagos,
        });
    } catch (error) {
        console.error('Error getGrupoDetalle:', error);
        res.status(500).json({ error: 'Error al obtener el grupo' });
    }
};

// ==========================================
// POST / - Crear grupo
// ==========================================
export const createGrupo = async (req: AuthRequest, res: Response) => {
    try {
        const { nombre, idCliente, nombreCliente, notas, idsFacturas } = req.body;
        const idUsuario = Number(req.user?.nameid);

        if (!nombre?.trim()) return res.status(400).json({ error: 'El nombre del grupo es requerido' });

        const result = await db.transaction(async (tx) => {
            const [nuevoGrupo] = await tx
                .insert(schema.gruposFacturas)
                .values({
                    nombre: nombre.trim(),
                    idcliente: idCliente || null,
                    nombrecliente: idCliente ? null : (nombreCliente?.trim() || null),
                    notas: notas?.trim() || null,
                    idestado: 4,
                    fechacreacion: getDRDateTime(),
                    fechaultimaactualizacion: getDRDateTime(),
                    idusuario: idUsuario!,
                })
                .returning();

            // Si se pasaron facturas, validarlas y agregarlas
            if (idsFacturas && Array.isArray(idsFacturas) && idsFacturas.length > 0) {
                // Verificar que las facturas no estén ya en otro grupo
                const yaAsignadas = await tx
                    .select({ idfactura: schema.gruposFacturasDetalle.idfactura })
                    .from(schema.gruposFacturasDetalle)
                    .where(inArray(schema.gruposFacturasDetalle.idfactura, idsFacturas));

                if (yaAsignadas.length > 0) {
                    const ids = yaAsignadas.map(f => f.idfactura).join(', ');
                    throw new Error(`Las siguientes facturas ya pertenecen a un grupo: ${ids}`);
                }

                const now = getDRDateTime();
                await tx.insert(schema.gruposFacturasDetalle).values(
                    idsFacturas.map((id: number) => ({
                        idgrupo: nuevoGrupo.idgrupo,
                        idfactura: id,
                        fechaasignacion: now,
                    }))
                );
            }

            return nuevoGrupo;
        });

        res.status(201).json({ message: 'Grupo creado exitosamente', idGrupo: result.idgrupo });
    } catch (error: any) {
        console.error('Error createGrupo:', error);
        if (error.message?.includes('ya pertenecen')) {
            return res.status(400).json({ error: error.message });
        }
        res.status(500).json({ error: 'Error al crear el grupo' });
    }
};

// ==========================================
// PUT /:id - Actualizar nombre/notas del grupo
// ==========================================
export const updateGrupo = async (req: AuthRequest, res: Response) => {
    try {
        const { id } = req.params;
        const { nombre, notas } = req.body;

        const existing = await db
            .select()
            .from(schema.gruposFacturas)
            .where(eq(schema.gruposFacturas.idgrupo, Number(id)));

        if (!existing.length) return res.status(404).json({ error: 'Grupo no encontrado' });

        await db
            .update(schema.gruposFacturas)
            .set({
                nombre: nombre?.trim() || existing[0].nombre,
                notas: notas !== undefined ? (notas?.trim() || null) : existing[0].notas,
                fechaultimaactualizacion: getDRDateTime(),
            })
            .where(eq(schema.gruposFacturas.idgrupo, Number(id)));

        res.json({ message: 'Grupo actualizado exitosamente' });
    } catch (error) {
        console.error('Error updateGrupo:', error);
        res.status(500).json({ error: 'Error al actualizar el grupo' });
    }
};

// ==========================================
// DELETE /:id - Eliminar grupo (desvincula facturas, no las elimina)
// ==========================================
export const deleteGrupo = async (req: AuthRequest, res: Response) => {
    try {
        const { id } = req.params;

        const existing = await db
            .select()
            .from(schema.gruposFacturas)
            .where(eq(schema.gruposFacturas.idgrupo, Number(id)));

        if (!existing.length) return res.status(404).json({ error: 'Grupo no encontrado' });

        // El CASCADE en la FK desvincula los detalles automáticamente
        await db
            .delete(schema.gruposFacturas)
            .where(eq(schema.gruposFacturas.idgrupo, Number(id)));

        res.json({ message: 'Grupo eliminado exitosamente' });
    } catch (error) {
        console.error('Error deleteGrupo:', error);
        res.status(500).json({ error: 'Error al eliminar el grupo' });
    }
};

// ==========================================
// POST /:id/facturas - Agregar facturas al grupo
// ==========================================
export const addFacturasAlGrupo = async (req: AuthRequest, res: Response) => {
    try {
        const { id } = req.params;
        const { idsFacturas } = req.body;

        if (!Array.isArray(idsFacturas) || idsFacturas.length === 0) {
            return res.status(400).json({ error: 'Debes enviar al menos una factura' });
        }

        const grupo = await db
            .select()
            .from(schema.gruposFacturas)
            .where(eq(schema.gruposFacturas.idgrupo, Number(id)));

        if (!grupo.length) return res.status(404).json({ error: 'Grupo no encontrado' });

        // Verificar que no estén ya en otro grupo
        const yaAsignadas = await db
            .select({ idfactura: schema.gruposFacturasDetalle.idfactura })
            .from(schema.gruposFacturasDetalle)
            .where(
                and(
                    inArray(schema.gruposFacturasDetalle.idfactura, idsFacturas),
                    not(eq(schema.gruposFacturasDetalle.idgrupo, Number(id)))
                )
            );

        if (yaAsignadas.length > 0) {
            const ids = yaAsignadas.map(f => f.idfactura).join(', ');
            return res.status(400).json({ error: `Las siguientes facturas ya pertenecen a otro grupo: ${ids}` });
        }

        // Verificar que no estén ya en ESTE grupo
        const yaEnEsteGrupo = await db
            .select({ idfactura: schema.gruposFacturasDetalle.idfactura })
            .from(schema.gruposFacturasDetalle)
            .where(
                and(
                    inArray(schema.gruposFacturasDetalle.idfactura, idsFacturas),
                    eq(schema.gruposFacturasDetalle.idgrupo, Number(id))
                )
            );

        const nuevasFacturas = idsFacturas.filter(
            (fid: number) => !yaEnEsteGrupo.some(y => y.idfactura === fid)
        );

        if (nuevasFacturas.length === 0) {
            return res.status(400).json({ error: 'Todas las facturas ya están en este grupo' });
        }

        const now = getDRDateTime();
        await db.insert(schema.gruposFacturasDetalle).values(
            nuevasFacturas.map((fid: number) => ({
                idgrupo: Number(id),
                idfactura: fid,
                fechaasignacion: now,
            }))
        );

        // Actualizar fecha del grupo
        await db
            .update(schema.gruposFacturas)
            .set({ fechaultimaactualizacion: now })
            .where(eq(schema.gruposFacturas.idgrupo, Number(id)));

        res.json({ message: `${nuevasFacturas.length} factura(s) agregada(s) al grupo exitosamente` });
    } catch (error) {
        console.error('Error addFacturasAlGrupo:', error);
        res.status(500).json({ error: 'Error al agregar facturas al grupo' });
    }
};

// ==========================================
// DELETE /:id/facturas/:idFactura - Quitar una factura del grupo
// ==========================================
export const removeFacturaDelGrupo = async (req: AuthRequest, res: Response) => {
    try {
        const { id, idFactura } = req.params;

        const detalle = await db
            .select()
            .from(schema.gruposFacturasDetalle)
            .where(
                and(
                    eq(schema.gruposFacturasDetalle.idgrupo, Number(id)),
                    eq(schema.gruposFacturasDetalle.idfactura, Number(idFactura))
                )
            );

        if (!detalle.length) {
            return res.status(404).json({ error: 'La factura no pertenece a este grupo' });
        }

        await db
            .delete(schema.gruposFacturasDetalle)
            .where(
                and(
                    eq(schema.gruposFacturasDetalle.idgrupo, Number(id)),
                    eq(schema.gruposFacturasDetalle.idfactura, Number(idFactura))
                )
            );

        await db
            .update(schema.gruposFacturas)
            .set({ fechaultimaactualizacion: getDRDateTime() })
            .where(eq(schema.gruposFacturas.idgrupo, Number(id)));

        res.json({ message: 'Factura removida del grupo exitosamente' });
    } catch (error) {
        console.error('Error removeFacturaDelGrupo:', error);
        res.status(500).json({ error: 'Error al remover la factura del grupo' });
    }
};

// ==========================================
// POST /:id/pagar - Pago al grupo (distribución FIFO)
// ==========================================
export const pagarGrupo = async (req: AuthRequest, res: Response) => {
    try {
        const { id } = req.params;
        const { monto, metodoPago, referencia, notas } = req.body;
        const idUsuario = Number(req.user?.nameid);

        const montoNum = Number(monto);
        if (!montoNum || montoNum <= 0) {
            return res.status(400).json({ error: 'El monto debe ser mayor a 0' });
        }
        if (!metodoPago) {
            return res.status(400).json({ error: 'El método de pago es requerido' });
        }
        const metodosValidos = ['efectivo', 'tarjeta', 'transferencia', 'otro'];
        if (!metodosValidos.includes(metodoPago)) {
            return res.status(400).json({ error: 'Método de pago inválido' });
        }

        const grupo = await db
            .select()
            .from(schema.gruposFacturas)
            .where(eq(schema.gruposFacturas.idgrupo, Number(id)));

        if (!grupo.length) return res.status(404).json({ error: 'Grupo no encontrado' });

        // Facturas pendientes del grupo, ordenadas FIFO (más antiguas primero)
        const facturasPendientes = await db
            .select({ factura: schema.facturas })
            .from(schema.gruposFacturasDetalle)
            .innerJoin(schema.facturas, eq(schema.gruposFacturasDetalle.idfactura, schema.facturas.idfactura))
            .where(
                and(
                    eq(schema.gruposFacturasDetalle.idgrupo, Number(id)),
                    gt(schema.facturas.montopendiente, '0')
                )
            )
            .orderBy(asc(schema.facturas.fechacreacion));

        if (!facturasPendientes.length) {
            return res.status(400).json({ error: 'No hay facturas pendientes de pago en este grupo' });
        }

        const distribucion = await db.transaction(async (tx) => {
            let restante = montoNum;
            const dist: { idFactura: number; numeroFactura: string; montoAplicado: number; nuevoMontoPendiente: number }[] = [];
            const now = getDRDateTime();

            for (const { factura } of facturasPendientes) {
                if (restante <= 0.001) break;

                const pendiente = Number(factura.montopendiente || 0);
                if (pendiente <= 0) continue;

                const aplicar = Math.min(restante, pendiente);
                restante = Math.max(0, restante - aplicar);

                const nuevoAbonado = Number(factura.montoabonado || 0) + aplicar;
                const nuevoPendiente = Math.max(0, pendiente - aplicar);
                const nuevoEstado = nuevoPendiente < 0.01 ? 5 : 4;

                // Crear registro de pago individual
                await tx.insert(schema.pagos).values({
                    idfactura: factura.idfactura,
                    monto: aplicar.toFixed(2),
                    idestado: 5,
                    fechapago: now,
                    metodopago: metodoPago,
                    referencia: referencia || null,
                    notas: notas
                        ? `${notas} [Pago de grupo #${id}]`
                        : `Pago de grupo #${id}`,
                    idusuario: idUsuario!,
                });

                // Actualizar la factura
                await tx
                    .update(schema.facturas)
                    .set({
                        montoabonado: nuevoAbonado.toFixed(2),
                        montopendiente: nuevoPendiente.toFixed(2),
                        idestado: nuevoEstado,
                        metodopago: metodoPago,
                        fechaultimaactualizacion: now,
                    })
                    .where(eq(schema.facturas.idfactura, factura.idfactura));

                dist.push({
                    idFactura: factura.idfactura,
                    numeroFactura: factura.numerofactura,
                    montoAplicado: aplicar,
                    nuevoMontoPendiente: nuevoPendiente,
                });
            }

            // Recalcular estado del grupo
            const pendienteTotal = await tx
                .select({ suma: sql<number>`coalesce(sum(${schema.facturas.montopendiente}), 0)` })
                .from(schema.gruposFacturasDetalle)
                .leftJoin(schema.facturas, eq(schema.gruposFacturasDetalle.idfactura, schema.facturas.idfactura))
                .where(eq(schema.gruposFacturasDetalle.idgrupo, Number(id)));

            const totalPendiente = Number(pendienteTotal[0]?.suma || 0);

            await tx
                .update(schema.gruposFacturas)
                .set({
                    idestado: totalPendiente < 0.01 ? 5 : 4,
                    fechaultimaactualizacion: now,
                })
                .where(eq(schema.gruposFacturas.idgrupo, Number(id)));

            return dist;
        });

        res.json({
            message: 'Pago registrado exitosamente',
            montoAplicado: montoNum,
            distribucion,
        });
    } catch (error) {
        console.error('Error pagarGrupo:', error);
        res.status(500).json({ error: 'Error al procesar el pago del grupo' });
    }
};

// ==========================================
// GET /facturas-disponibles - Facturas pendientes sin grupo para agregar
// ==========================================
export const getFacturasDisponibles = async (req: AuthRequest, res: Response) => {
    try {
        const { search } = req.query;

        // IDs de facturas ya asignadas a algún grupo
        const asignadas = await db
            .select({ idfactura: schema.gruposFacturasDetalle.idfactura })
            .from(schema.gruposFacturasDetalle);

        const idsAsignados = asignadas.map(a => a.idfactura);

        const filters: any[] = [
            // Solo facturas con saldo pendiente
            gt(schema.facturas.montopendiente, '0'),
        ];

        if (idsAsignados.length > 0) {
            filters.push(not(inArray(schema.facturas.idfactura, idsAsignados)));
        }

        if (search) {
            const s = `%${search}%`;
            filters.push(
                or(
                    ilike(schema.facturas.numerofactura, s),
                    ilike(schema.facturas.nombrecliente, s)
                )!
            );
        }

        const facturasDb = await db
            .select({
                factura: schema.facturas,
                estadoNombre: schema.estados.nombre,
            })
            .from(schema.facturas)
            .innerJoin(schema.estados, eq(schema.facturas.idestado, schema.estados.idestado))
            .where(and(...filters))
            .orderBy(desc(schema.facturas.fechacreacion))
            .limit(50);

        const facturas = facturasDb.map(f => ({
            idFactura: f.factura.idfactura,
            numeroFactura: f.factura.numerofactura,
            nombreCliente: f.factura.nombrecliente,
            fechaCreacion: f.factura.fechacreacion,
            total: Number(f.factura.total),
            montoAbonado: Number(f.factura.montoabonado || 0),
            montoPendiente: Number(f.factura.montopendiente || 0),
            estado: { idEstado: f.factura.idestado, nombre: f.estadoNombre },
        }));

        res.json(facturas);
    } catch (error) {
        console.error('Error getFacturasDisponibles:', error);
        res.status(500).json({ error: 'Error al obtener facturas disponibles' });
    }
};

// ==========================================
// GET /por-factura/:idFactura - Obtener el grupo al que pertenece una factura
// ==========================================
export const getGrupoDeFactura = async (req: AuthRequest, res: Response) => {
    try {
        const { idFactura } = req.params;

        const detalle = await db
            .select({
                grupo: schema.gruposFacturas,
                estadoNombre: schema.estados.nombre,
            })
            .from(schema.gruposFacturasDetalle)
            .innerJoin(schema.gruposFacturas, eq(schema.gruposFacturasDetalle.idgrupo, schema.gruposFacturas.idgrupo))
            .innerJoin(schema.estados, eq(schema.gruposFacturas.idestado, schema.estados.idestado))
            .where(eq(schema.gruposFacturasDetalle.idfactura, Number(idFactura)));

        if (!detalle.length) {
            return res.json(null);
        }

        const g = detalle[0];
        res.json({
            idGrupo: g.grupo.idgrupo,
            nombre: g.grupo.nombre,
            estadoNombre: g.estadoNombre,
        });
    } catch (error) {
        console.error('Error getGrupoDeFactura:', error);
        res.status(500).json({ error: 'Error al consultar el grupo de la factura' });
    }
};
