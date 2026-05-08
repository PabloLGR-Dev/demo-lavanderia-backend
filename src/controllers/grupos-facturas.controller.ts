import { Response } from 'express';
import { eq, and, desc, asc, sql, ilike, or, gt, inArray, not } from 'drizzle-orm';
import { db } from '../db/index.js';
import * as schema from '../db/schema.js';
import { AuthRequest } from '../middlewares/auth.middleware.js';
import { DEMO_MODE, demoStore, isDemoId, ESTADO_NOMBRES } from '../demo/store.js';

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

export const getGruposResumen = async (req: AuthRequest, res: Response) => {
    try {
        const { search, estadoId, page = 1, pageSize = 20 } = req.query;
        const currentPage = Math.max(1, Number(page));
        const limit = Math.max(1, Number(pageSize));

        const filters: any[] = [];
        if (estadoId) filters.push(eq(schema.gruposFacturas.idestado, Number(estadoId)));
        if (search) {
            const s = `%${search}%`;
            filters.push(or(ilike(schema.gruposFacturas.nombre, s), ilike(schema.gruposFacturas.nombrecliente, s))!);
        }
        const whereClause = filters.length > 0 ? and(...filters) : undefined;

        const grupos = await db.select({
            grupo: schema.gruposFacturas,
            estadoNombre: schema.estados.nombre,
            clienteNombre: schema.clientes.nombre,
            clienteApellido: schema.clientes.apellido,
        })
        .from(schema.gruposFacturas)
        .innerJoin(schema.estados, eq(schema.gruposFacturas.idestado, schema.estados.idestado))
        .leftJoin(schema.clientes, eq(schema.gruposFacturas.idcliente, schema.clientes.idcliente))
        .where(whereClause)
        .orderBy(desc(schema.gruposFacturas.fechacreacion));

        const gruposConTotales = await Promise.all(grupos.map(async (g) => {
            const totales = await db.select({
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
        }));

        let allData = [...gruposConTotales];

        if (DEMO_MODE) {
            const userId = Number(req.user?.nameid);
            let demoGrupos = demoStore.getGrupos(userId);
            if (estadoId) demoGrupos = demoGrupos.filter(g => g.idestado === Number(estadoId));
            if (search) {
                const s = (search as string).toLowerCase();
                demoGrupos = demoGrupos.filter(g =>
                    g.nombre.toLowerCase().includes(s) || (g.nombrecliente || '').toLowerCase().includes(s)
                );
            }

            const demoItems = demoGrupos.map(g => {
                const detalles = demoStore.getGrupoDetalles(userId, g.idgrupo);
                const facturas = detalles.map(d => demoStore.getFacturaById(userId, d.idfactura)).filter(Boolean);
                const totalMonto = facturas.reduce((s, f) => s + Number(f!.total), 0);
                const totalAbonado = facturas.reduce((s, f) => s + Number(f!.montoabonado || 0), 0);
                const totalPendiente = facturas.reduce((s, f) => s + Number(f!.montopendiente || 0), 0);
                return {
                    idGrupo: g.idgrupo,
                    nombre: g.nombre,
                    idCliente: g.idcliente,
                    nombreCliente: g.nombrecliente,
                    notas: g.notas,
                    idEstado: g.idestado,
                    estadoNombre: ESTADO_NOMBRES[g.idestado] || 'Desconocido',
                    fechaCreacion: g.fechacreacion,
                    fechaUltimaActualizacion: g.fechaultimaactualizacion,
                    totalFacturas: facturas.length,
                    totalMonto,
                    totalAbonado,
                    totalPendiente,
                };
            });
            allData = [...demoItems, ...allData];
            allData.sort((a, b) => (b.fechaCreacion || '').localeCompare(a.fechaCreacion || ''));
        }

        const totalRecords = allData.length;
        const offset = (currentPage - 1) * limit;
        const data = allData.slice(offset, offset + limit);

        res.json({
            data,
            pagination: { currentPage, pageSize: limit, totalRecords, totalPages: Math.ceil(totalRecords / limit) },
        });
    } catch (error) {
        console.error('Error getGruposResumen:', error);
        res.status(500).json({ error: 'Error al obtener grupos de facturas' });
    }
};

export const getGrupoDetalle = async (req: AuthRequest, res: Response) => {
    try {
        const idNum = Number(req.params.id);

        if (DEMO_MODE && isDemoId(idNum)) {
            const userId = Number(req.user?.nameid);
            const grupo = demoStore.getGrupoById(userId, idNum);
            if (!grupo) return res.status(404).json({ error: 'Grupo no encontrado' });

            const detalles = demoStore.getGrupoDetalles(userId, idNum);
            const facturasFormateadas = detalles.map(d => {
                const f = demoStore.getFacturaById(userId, d.idfactura);
                if (!f) return null;
                return {
                    idFactura: f.idfactura,
                    numeroFactura: f.numerofactura,
                    nombreCliente: f.nombrecliente,
                    fechaCreacion: f.fechacreacion,
                    fechaEntregaEstimada: f.fechaentregaestimada,
                    total: Number(f.total),
                    montoAbonado: Number(f.montoabonado || 0),
                    montoPendiente: Number(f.montopendiente || 0),
                    estado: { idEstado: f.idestado, nombre: ESTADO_NOMBRES[f.idestado] || 'Desconocido' },
                };
            }).filter(Boolean);

            const historialPagos = detalles.flatMap(d =>
                demoStore.getPagosByFactura(userId, d.idfactura).map(p => ({
                    idPago: p.idpago,
                    idFactura: p.idfactura,
                    numeroFactura: demoStore.getFacturaById(userId, p.idfactura)?.numerofactura || '',
                    monto: Number(p.monto),
                    fechaPago: p.fechapago,
                    metodoPago: p.metodopago,
                    referencia: p.referencia,
                    notas: p.notas,
                    usuario: 'Demo',
                }))
            ).sort((a, b) => b.fechaPago.localeCompare(a.fechaPago));

            const totalMonto = facturasFormateadas.reduce((s: number, f: any) => s + f.total, 0);
            const totalAbonado = facturasFormateadas.reduce((s: number, f: any) => s + f.montoAbonado, 0);
            const totalPendiente = facturasFormateadas.reduce((s: number, f: any) => s + f.montoPendiente, 0);

            return res.json({
                idGrupo: grupo.idgrupo,
                nombre: grupo.nombre,
                idCliente: grupo.idcliente,
                nombreCliente: grupo.nombrecliente,
                notas: grupo.notas,
                idEstado: grupo.idestado,
                estadoNombre: ESTADO_NOMBRES[grupo.idestado] || 'Desconocido',
                fechaCreacion: grupo.fechacreacion,
                fechaUltimaActualizacion: grupo.fechaultimaactualizacion,
                totalFacturas: facturasFormateadas.length,
                totalMonto,
                totalAbonado,
                totalPendiente,
                facturas: facturasFormateadas,
                historialPagos,
            });
        }

        const grupoDb = await db.select({
            grupo: schema.gruposFacturas,
            estadoNombre: schema.estados.nombre,
            clienteNombre: schema.clientes.nombre,
            clienteApellido: schema.clientes.apellido,
        })
        .from(schema.gruposFacturas)
        .innerJoin(schema.estados, eq(schema.gruposFacturas.idestado, schema.estados.idestado))
        .leftJoin(schema.clientes, eq(schema.gruposFacturas.idcliente, schema.clientes.idcliente))
        .where(eq(schema.gruposFacturas.idgrupo, idNum));

        if (!grupoDb.length) return res.status(404).json({ error: 'Grupo no encontrado' });

        const g = grupoDb[0];
        const facturasGrupo = await db.select({ factura: schema.facturas, estadoNombre: schema.estados.nombre })
            .from(schema.gruposFacturasDetalle)
            .innerJoin(schema.facturas, eq(schema.gruposFacturasDetalle.idfactura, schema.facturas.idfactura))
            .innerJoin(schema.estados, eq(schema.facturas.idestado, schema.estados.idestado))
            .where(eq(schema.gruposFacturasDetalle.idgrupo, idNum))
            .orderBy(asc(schema.facturas.fechacreacion));

        const idFacturas = facturasGrupo.map(f => f.factura.idfactura);
        let historialPagos: any[] = [];
        if (idFacturas.length > 0) {
            const pagosDb = await db.select({
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

export const createGrupo = async (req: AuthRequest, res: Response) => {
    if (DEMO_MODE) {
        try {
            const { nombre, idCliente, nombreCliente, notas, idsFacturas } = req.body;
            const userId = Number(req.user?.nameid);
            if (!nombre?.trim()) return res.status(400).json({ error: 'El nombre del grupo es requerido' });

            const now = getDRDateTime();
            const nuevoGrupo = demoStore.addGrupo(userId, {
                nombre: nombre.trim(),
                idcliente: idCliente || null,
                nombrecliente: idCliente ? null : (nombreCliente?.trim() || null),
                notas: notas?.trim() || null,
                idestado: 4,
                idusuario: userId,
                fechacreacion: now,
                fechaultimaactualizacion: now,
            });

            if (Array.isArray(idsFacturas) && idsFacturas.length > 0) {
                const allDetalles = demoStore.getAllGrupoDetalles(userId);
                const yaAsignadas = idsFacturas.filter((fid: number) =>
                    allDetalles.some(gd => gd.idfactura === fid)
                );
                if (yaAsignadas.length > 0) {
                    demoStore.deleteGrupo(userId, nuevoGrupo.idgrupo);
                    return res.status(400).json({ error: `Las siguientes facturas ya pertenecen a un grupo: ${yaAsignadas.join(', ')}` });
                }
                for (const fid of idsFacturas) {
                    demoStore.addGrupoDetalle(userId, { idgrupo: nuevoGrupo.idgrupo, idfactura: fid, fechaasignacion: now });
                }
            }

            return res.status(201).json({ message: 'Grupo creado exitosamente', idGrupo: nuevoGrupo.idgrupo });
        } catch (error: any) {
            return res.status(500).json({ error: 'Error al crear el grupo' });
        }
    }

    try {
        const { nombre, idCliente, nombreCliente, notas, idsFacturas } = req.body;
        const idUsuario = Number(req.user?.nameid);
        if (!nombre?.trim()) return res.status(400).json({ error: 'El nombre del grupo es requerido' });

        const result = await db.transaction(async (tx) => {
            const [nuevoGrupo] = await tx.insert(schema.gruposFacturas).values({
                nombre: nombre.trim(),
                idcliente: idCliente || null,
                nombrecliente: idCliente ? null : (nombreCliente?.trim() || null),
                notas: notas?.trim() || null,
                idestado: 4,
                fechacreacion: getDRDateTime(),
                fechaultimaactualizacion: getDRDateTime(),
                idusuario: idUsuario!,
            }).returning();

            if (Array.isArray(idsFacturas) && idsFacturas.length > 0) {
                const yaAsignadas = await tx.select({ idfactura: schema.gruposFacturasDetalle.idfactura })
                    .from(schema.gruposFacturasDetalle)
                    .where(inArray(schema.gruposFacturasDetalle.idfactura, idsFacturas));
                if (yaAsignadas.length > 0) {
                    throw new Error(`Las siguientes facturas ya pertenecen a un grupo: ${yaAsignadas.map(f => f.idfactura).join(', ')}`);
                }
                const now = getDRDateTime();
                await tx.insert(schema.gruposFacturasDetalle).values(
                    idsFacturas.map((id: number) => ({ idgrupo: nuevoGrupo.idgrupo, idfactura: id, fechaasignacion: now }))
                );
            }
            return nuevoGrupo;
        });

        res.status(201).json({ message: 'Grupo creado exitosamente', idGrupo: result.idgrupo });
    } catch (error: any) {
        console.error('Error createGrupo:', error);
        if (error.message?.includes('ya pertenecen')) return res.status(400).json({ error: error.message });
        res.status(500).json({ error: 'Error al crear el grupo' });
    }
};

export const updateGrupo = async (req: AuthRequest, res: Response) => {
    const idNum = Number(req.params.id);

    if (DEMO_MODE) {
        if (isDemoId(idNum)) {
            const userId = Number(req.user?.nameid);
            const { nombre, notas } = req.body;
            const existing = demoStore.getGrupoById(userId, idNum);
            if (!existing) return res.status(404).json({ error: 'Grupo no encontrado' });
            demoStore.updateGrupo(userId, idNum, {
                nombre: nombre?.trim() || existing.nombre,
                notas: notas !== undefined ? (notas?.trim() || null) : existing.notas,
                fechaultimaactualizacion: getDRDateTime(),
            });
            return res.json({ message: 'Grupo actualizado exitosamente' });
        }
        return res.status(403).json({ message: 'Modo demo: no se pueden modificar datos historicos.' });
    }

    try {
        const { nombre, notas } = req.body;
        const existing = await db.select().from(schema.gruposFacturas).where(eq(schema.gruposFacturas.idgrupo, idNum));
        if (!existing.length) return res.status(404).json({ error: 'Grupo no encontrado' });

        await db.update(schema.gruposFacturas)
            .set({
                nombre: nombre?.trim() || existing[0].nombre,
                notas: notas !== undefined ? (notas?.trim() || null) : existing[0].notas,
                fechaultimaactualizacion: getDRDateTime(),
            })
            .where(eq(schema.gruposFacturas.idgrupo, idNum));

        res.json({ message: 'Grupo actualizado exitosamente' });
    } catch (error) {
        console.error('Error updateGrupo:', error);
        res.status(500).json({ error: 'Error al actualizar el grupo' });
    }
};

export const deleteGrupo = async (req: AuthRequest, res: Response) => {
    const idNum = Number(req.params.id);

    if (DEMO_MODE) {
        if (isDemoId(idNum)) {
            const userId = Number(req.user?.nameid);
            demoStore.deleteGrupo(userId, idNum);
            return res.json({ message: 'Grupo eliminado exitosamente' });
        }
        return res.status(403).json({ message: 'Modo demo: no se pueden eliminar datos historicos.' });
    }

    try {
        const existing = await db.select().from(schema.gruposFacturas).where(eq(schema.gruposFacturas.idgrupo, idNum));
        if (!existing.length) return res.status(404).json({ error: 'Grupo no encontrado' });
        await db.delete(schema.gruposFacturas).where(eq(schema.gruposFacturas.idgrupo, idNum));
        res.json({ message: 'Grupo eliminado exitosamente' });
    } catch (error) {
        console.error('Error deleteGrupo:', error);
        res.status(500).json({ error: 'Error al eliminar el grupo' });
    }
};

export const addFacturasAlGrupo = async (req: AuthRequest, res: Response) => {
    const idNum = Number(req.params.id);
    const { idsFacturas } = req.body;

    if (!Array.isArray(idsFacturas) || idsFacturas.length === 0) {
        return res.status(400).json({ error: 'Debes enviar al menos una factura' });
    }

    if (DEMO_MODE) {
        if (isDemoId(idNum)) {
            const userId = Number(req.user?.nameid);
            const grupo = demoStore.getGrupoById(userId, idNum);
            if (!grupo) return res.status(404).json({ error: 'Grupo no encontrado' });

            const allDetalles = demoStore.getAllGrupoDetalles(userId);
            const yaEnOtroGrupo = idsFacturas.filter((fid: number) =>
                allDetalles.some(gd => gd.idfactura === fid && gd.idgrupo !== idNum)
            );
            if (yaEnOtroGrupo.length > 0) {
                return res.status(400).json({ error: `Las siguientes facturas ya pertenecen a otro grupo: ${yaEnOtroGrupo.join(', ')}` });
            }

            const yaEnEsteGrupo = allDetalles.filter(gd => gd.idgrupo === idNum).map(gd => gd.idfactura);
            const nuevas = idsFacturas.filter((fid: number) => !yaEnEsteGrupo.includes(fid));
            if (nuevas.length === 0) return res.status(400).json({ error: 'Todas las facturas ya estan en este grupo' });

            const now = getDRDateTime();
            for (const fid of nuevas) {
                demoStore.addGrupoDetalle(userId, { idgrupo: idNum, idfactura: fid, fechaasignacion: now });
            }
            demoStore.updateGrupo(userId, idNum, { fechaultimaactualizacion: now });
            return res.json({ message: `${nuevas.length} factura(s) agregada(s) al grupo exitosamente` });
        }
        return res.status(403).json({ message: 'Modo demo: no se pueden modificar datos historicos.' });
    }

    try {
        const grupo = await db.select().from(schema.gruposFacturas).where(eq(schema.gruposFacturas.idgrupo, idNum));
        if (!grupo.length) return res.status(404).json({ error: 'Grupo no encontrado' });

        const yaAsignadas = await db.select({ idfactura: schema.gruposFacturasDetalle.idfactura })
            .from(schema.gruposFacturasDetalle)
            .where(and(inArray(schema.gruposFacturasDetalle.idfactura, idsFacturas), not(eq(schema.gruposFacturasDetalle.idgrupo, idNum))));

        if (yaAsignadas.length > 0) {
            return res.status(400).json({ error: `Las siguientes facturas ya pertenecen a otro grupo: ${yaAsignadas.map(f => f.idfactura).join(', ')}` });
        }

        const yaEnEsteGrupo = await db.select({ idfactura: schema.gruposFacturasDetalle.idfactura })
            .from(schema.gruposFacturasDetalle)
            .where(and(inArray(schema.gruposFacturasDetalle.idfactura, idsFacturas), eq(schema.gruposFacturasDetalle.idgrupo, idNum)));

        const nuevas = idsFacturas.filter((fid: number) => !yaEnEsteGrupo.some(y => y.idfactura === fid));
        if (nuevas.length === 0) return res.status(400).json({ error: 'Todas las facturas ya estan en este grupo' });

        const now = getDRDateTime();
        await db.insert(schema.gruposFacturasDetalle).values(nuevas.map((fid: number) => ({ idgrupo: idNum, idfactura: fid, fechaasignacion: now })));
        await db.update(schema.gruposFacturas).set({ fechaultimaactualizacion: now }).where(eq(schema.gruposFacturas.idgrupo, idNum));

        res.json({ message: `${nuevas.length} factura(s) agregada(s) al grupo exitosamente` });
    } catch (error) {
        console.error('Error addFacturasAlGrupo:', error);
        res.status(500).json({ error: 'Error al agregar facturas al grupo' });
    }
};

export const removeFacturaDelGrupo = async (req: AuthRequest, res: Response) => {
    const idNum = Number(req.params.id);
    const idFactura = Number(req.params.idFactura);

    if (DEMO_MODE) {
        if (isDemoId(idNum)) {
            const userId = Number(req.user?.nameid);
            const detalle = demoStore.getGrupoDetalles(userId, idNum).find(gd => gd.idfactura === idFactura);
            if (!detalle) return res.status(404).json({ error: 'La factura no pertenece a este grupo' });
            demoStore.removeGrupoDetalle(userId, idNum, idFactura);
            demoStore.updateGrupo(userId, idNum, { fechaultimaactualizacion: getDRDateTime() });
            return res.json({ message: 'Factura removida del grupo exitosamente' });
        }
        return res.status(403).json({ message: 'Modo demo: no se pueden modificar datos historicos.' });
    }

    try {
        const detalle = await db.select().from(schema.gruposFacturasDetalle)
            .where(and(eq(schema.gruposFacturasDetalle.idgrupo, idNum), eq(schema.gruposFacturasDetalle.idfactura, idFactura)));

        if (!detalle.length) return res.status(404).json({ error: 'La factura no pertenece a este grupo' });

        await db.delete(schema.gruposFacturasDetalle)
            .where(and(eq(schema.gruposFacturasDetalle.idgrupo, idNum), eq(schema.gruposFacturasDetalle.idfactura, idFactura)));
        await db.update(schema.gruposFacturas).set({ fechaultimaactualizacion: getDRDateTime() }).where(eq(schema.gruposFacturas.idgrupo, idNum));

        res.json({ message: 'Factura removida del grupo exitosamente' });
    } catch (error) {
        console.error('Error removeFacturaDelGrupo:', error);
        res.status(500).json({ error: 'Error al remover la factura del grupo' });
    }
};

export const pagarGrupo = async (req: AuthRequest, res: Response) => {
    const idNum = Number(req.params.id);
    const { monto, metodoPago, referencia, notas } = req.body;
    const idUsuario = Number(req.user?.nameid);

    const montoNum = Number(monto);
    if (!montoNum || montoNum <= 0) return res.status(400).json({ error: 'El monto debe ser mayor a 0' });
    if (!metodoPago) return res.status(400).json({ error: 'El metodo de pago es requerido' });
    const metodosValidos = ['efectivo', 'tarjeta', 'transferencia', 'otro'];
    if (!metodosValidos.includes(metodoPago)) return res.status(400).json({ error: 'Metodo de pago invalido' });

    if (DEMO_MODE) {
        if (isDemoId(idNum)) {
            const grupo = demoStore.getGrupoById(idUsuario, idNum);
            if (!grupo) return res.status(404).json({ error: 'Grupo no encontrado' });

            const detalles = demoStore.getGrupoDetalles(idUsuario, idNum);
            const facturasPendientes = detalles
                .map(d => demoStore.getFacturaById(idUsuario, d.idfactura))
                .filter(f => f && Number(f.montopendiente) > 0)
                .sort((a, b) => a!.fechacreacion.localeCompare(b!.fechacreacion));

            if (facturasPendientes.length === 0) {
                return res.status(400).json({ error: 'No hay facturas pendientes de pago en este grupo' });
            }

            const now = getDRDateTime();
            let restante = montoNum;
            const distribucion: any[] = [];

            for (const factura of facturasPendientes) {
                if (!factura || restante <= 0.001) break;
                const pendiente = Number(factura.montopendiente || 0);
                if (pendiente <= 0) continue;

                const aplicar = Math.min(restante, pendiente);
                restante = Math.max(0, restante - aplicar);

                const nuevoAbonado = Number(factura.montoabonado || 0) + aplicar;
                const nuevoPendiente = Math.max(0, pendiente - aplicar);
                const nuevoEstado = nuevoPendiente < 0.01 ? 5 : 4;

                demoStore.updateFactura(idUsuario, factura.idfactura, {
                    montoabonado: nuevoAbonado.toFixed(2),
                    montopendiente: nuevoPendiente.toFixed(2),
                    idestado: nuevoEstado,
                    metodopago: metodoPago,
                    fechaultimaactualizacion: now,
                });

                demoStore.addPago(idUsuario, {
                    idfactura: factura.idfactura,
                    monto: aplicar.toFixed(2),
                    idestado: 5,
                    fechapago: now,
                    metodopago: metodoPago,
                    referencia: referencia || null,
                    notas: notas ? `${notas} [Pago de grupo #${idNum}]` : `Pago de grupo #${idNum}`,
                    idusuario: idUsuario,
                });

                distribucion.push({
                    idFactura: factura.idfactura,
                    numeroFactura: factura.numerofactura,
                    montoAplicado: aplicar,
                    nuevoMontoPendiente: nuevoPendiente,
                });
            }

            const totalPendiente = demoStore.getGrupoDetalles(idUsuario, idNum)
                .map(d => demoStore.getFacturaById(idUsuario, d.idfactura))
                .reduce((s, f) => s + Number(f?.montopendiente || 0), 0);

            demoStore.updateGrupo(idUsuario, idNum, {
                idestado: totalPendiente < 0.01 ? 5 : 4,
                fechaultimaactualizacion: now,
            });

            return res.json({ message: 'Pago registrado exitosamente', montoAplicado: montoNum, distribucion });
        }
        return res.status(403).json({ message: 'Modo demo: no se pueden modificar datos historicos.' });
    }

    try {
        const grupo = await db.select().from(schema.gruposFacturas).where(eq(schema.gruposFacturas.idgrupo, idNum));
        if (!grupo.length) return res.status(404).json({ error: 'Grupo no encontrado' });

        const facturasPendientes = await db.select({ factura: schema.facturas })
            .from(schema.gruposFacturasDetalle)
            .innerJoin(schema.facturas, eq(schema.gruposFacturasDetalle.idfactura, schema.facturas.idfactura))
            .where(and(eq(schema.gruposFacturasDetalle.idgrupo, idNum), gt(schema.facturas.montopendiente, '0')))
            .orderBy(asc(schema.facturas.fechacreacion));

        if (!facturasPendientes.length) return res.status(400).json({ error: 'No hay facturas pendientes de pago en este grupo' });

        const distribucion = await db.transaction(async (tx) => {
            let restante = montoNum;
            const dist: any[] = [];
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

                await tx.insert(schema.pagos).values({
                    idfactura: factura.idfactura,
                    monto: aplicar.toFixed(2),
                    idestado: 5,
                    fechapago: now,
                    metodopago: metodoPago,
                    referencia: referencia || null,
                    notas: notas ? `${notas} [Pago de grupo #${idNum}]` : `Pago de grupo #${idNum}`,
                    idusuario: idUsuario!,
                });

                await tx.update(schema.facturas)
                    .set({ montoabonado: nuevoAbonado.toFixed(2), montopendiente: nuevoPendiente.toFixed(2), idestado: nuevoEstado, metodopago: metodoPago, fechaultimaactualizacion: now })
                    .where(eq(schema.facturas.idfactura, factura.idfactura));

                dist.push({ idFactura: factura.idfactura, numeroFactura: factura.numerofactura, montoAplicado: aplicar, nuevoMontoPendiente: nuevoPendiente });
            }

            const pendienteTotal = await tx.select({ suma: sql<number>`coalesce(sum(${schema.facturas.montopendiente}), 0)` })
                .from(schema.gruposFacturasDetalle)
                .leftJoin(schema.facturas, eq(schema.gruposFacturasDetalle.idfactura, schema.facturas.idfactura))
                .where(eq(schema.gruposFacturasDetalle.idgrupo, idNum));

            await tx.update(schema.gruposFacturas)
                .set({ idestado: Number(pendienteTotal[0]?.suma || 0) < 0.01 ? 5 : 4, fechaultimaactualizacion: now })
                .where(eq(schema.gruposFacturas.idgrupo, idNum));

            return dist;
        });

        res.json({ message: 'Pago registrado exitosamente', montoAplicado: montoNum, distribucion });
    } catch (error) {
        console.error('Error pagarGrupo:', error);
        res.status(500).json({ error: 'Error al procesar el pago del grupo' });
    }
};

export const getFacturasDisponibles = async (req: AuthRequest, res: Response) => {
    try {
        const { search } = req.query;

        const asignadas = await db.select({ idfactura: schema.gruposFacturasDetalle.idfactura }).from(schema.gruposFacturasDetalle);
        const idsAsignados = asignadas.map(a => a.idfactura);

        const filters: any[] = [gt(schema.facturas.montopendiente, '0')];
        if (idsAsignados.length > 0) filters.push(not(inArray(schema.facturas.idfactura, idsAsignados)));
        if (search) {
            const s = `%${search}%`;
            filters.push(or(ilike(schema.facturas.numerofactura, s), ilike(schema.facturas.nombrecliente, s))!);
        }

        const facturasDb = await db.select({ factura: schema.facturas, estadoNombre: schema.estados.nombre })
            .from(schema.facturas)
            .innerJoin(schema.estados, eq(schema.facturas.idestado, schema.estados.idestado))
            .where(and(...filters))
            .orderBy(desc(schema.facturas.fechacreacion))
            .limit(50);

        let facturas = facturasDb.map(f => ({
            idFactura: f.factura.idfactura,
            numeroFactura: f.factura.numerofactura,
            nombreCliente: f.factura.nombrecliente,
            fechaCreacion: f.factura.fechacreacion,
            total: Number(f.factura.total),
            montoAbonado: Number(f.factura.montoabonado || 0),
            montoPendiente: Number(f.factura.montopendiente || 0),
            estado: { idEstado: f.factura.idestado, nombre: f.estadoNombre },
        }));

        if (DEMO_MODE) {
            const userId = Number(req.user?.nameid);
            const allDemoDetalles = demoStore.getAllGrupoDetalles(userId);
            const demoAsignadosIds = allDemoDetalles.map(gd => gd.idfactura);

            let demoFacturas = demoStore.getFacturas(userId)
                .filter(f => Number(f.montopendiente) > 0 && !demoAsignadosIds.includes(f.idfactura));

            if (search) {
                const s = (search as string).toLowerCase();
                demoFacturas = demoFacturas.filter(f =>
                    f.numerofactura.toLowerCase().includes(s) || f.nombrecliente.toLowerCase().includes(s)
                );
            }

            const demoItems = demoFacturas.slice(0, 50).map(f => ({
                idFactura: f.idfactura,
                numeroFactura: f.numerofactura,
                nombreCliente: f.nombrecliente,
                fechaCreacion: f.fechacreacion,
                total: Number(f.total),
                montoAbonado: Number(f.montoabonado || 0),
                montoPendiente: Number(f.montopendiente || 0),
                estado: { idEstado: f.idestado, nombre: ESTADO_NOMBRES[f.idestado] || 'Desconocido' },
            }));

            facturas = [...demoItems, ...facturas];
        }

        res.json(facturas);
    } catch (error) {
        console.error('Error getFacturasDisponibles:', error);
        res.status(500).json({ error: 'Error al obtener facturas disponibles' });
    }
};

export const getGrupoDeFactura = async (req: AuthRequest, res: Response) => {
    try {
        const idFactura = Number(req.params.idFactura);

        if (DEMO_MODE && isDemoId(idFactura)) {
            const userId = Number(req.user?.nameid);
            const detalle = demoStore.getGrupoDetalleByFactura(userId, idFactura);
            if (!detalle) return res.json(null);
            const grupo = demoStore.getGrupoById(userId, detalle.idgrupo);
            if (!grupo) return res.json(null);
            return res.json({
                idGrupo: grupo.idgrupo,
                nombre: grupo.nombre,
                estadoNombre: ESTADO_NOMBRES[grupo.idestado] || 'Desconocido',
            });
        }

        const detalle = await db.select({ grupo: schema.gruposFacturas, estadoNombre: schema.estados.nombre })
            .from(schema.gruposFacturasDetalle)
            .innerJoin(schema.gruposFacturas, eq(schema.gruposFacturasDetalle.idgrupo, schema.gruposFacturas.idgrupo))
            .innerJoin(schema.estados, eq(schema.gruposFacturas.idestado, schema.estados.idestado))
            .where(eq(schema.gruposFacturasDetalle.idfactura, idFactura));

        if (!detalle.length) return res.json(null);

        const g = detalle[0];
        res.json({ idGrupo: g.grupo.idgrupo, nombre: g.grupo.nombre, estadoNombre: g.estadoNombre });
    } catch (error) {
        console.error('Error getGrupoDeFactura:', error);
        res.status(500).json({ error: 'Error al consultar el grupo de la factura' });
    }
};
