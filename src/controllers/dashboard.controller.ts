import { Request, Response } from 'express';
import { and, gte, lte, desc, sum, eq } from 'drizzle-orm';
import { db } from '../db/index.js';
import * as schema from '../db/schema.js';
import { DEMO_MODE, demoStore } from '../demo/store.js';

// --- HELPER DE ZONA HORARIA Y RANGOS (República Dominicana UTC-4) ---
const getDRDateTime = (dateVal?: string | Date) => {
    const d = dateVal ? new Date(dateVal) : new Date();
    if (isNaN(d.getTime())) return getDRDateTime();

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

const getBoundaries = (desdeQuery: any, hastaQuery: any) => {
    let fromDateStr = "";
    let toDateStr = "";

    if (desdeQuery && hastaQuery) {
        fromDateStr = getDRDateTime(desdeQuery as string).substring(0, 10);
        toDateStr = getDRDateTime(hastaQuery as string).substring(0, 10);
    } else {
        const hoyStr = getDRDateTime().substring(0, 10);
        const year = hoyStr.substring(0, 4);
        const month = hoyStr.substring(5, 7);
        const lastDay = new Date(Number(year), Number(month), 0).getDate();
        fromDateStr = `${year}-${month}-01`;
        toDateStr = `${year}-${month}-${lastDay}`;
    }

    const fromDb = `${fromDateStr} 00:00:00`;
    const toDb = `${toDateStr} 23:59:59`;
    const fromIso = `${fromDateStr}T00:00:00`;
    const toIso = `${toDateStr}T23:59:59`;

    return { fromDb, toDb, fromIso, toIso };
};

export const getResumenDashboard = async (req: Request, res: Response) => {
    try {
        const { fromDb, toDb, fromIso, toIso } = getBoundaries(null, null);
        const userId = DEMO_MODE ? Number((req as any).user?.nameid) : undefined;

        const resumenFinanciero = await obtenerResumenFinancieroLogica(fromDb, toDb, fromIso, toIso, userId);
        const estadisticasFacturas = await obtenerEstadisticasFacturasLogica(fromDb, toDb, fromIso, toIso, userId);
        const ultimosMovimientos = await obtenerUltimosMovimientosLogica(userId);

        const dashboard = {
            resumenFinanciero,
            estadisticasFacturas,
            ultimosMovimientos,
            fechaConsulta: getDRDateTime(),
            periodoConsultado: `${fromIso.substring(8,10)}/${fromIso.substring(5,7)}/${fromIso.substring(0,4)} - ${toIso.substring(8,10)}/${toIso.substring(5,7)}/${toIso.substring(0,4)}`
        };

        res.json(dashboard);
    } catch (error: any) {
        res.status(500).json({ message: "Error al obtener resumen del dashboard", error: error.message });
    }
};

export const getResumenFinanciero = async (req: Request, res: Response) => {
    try {
        const { fromDb, toDb, fromIso, toIso } = getBoundaries(req.query.fechaDesde, req.query.fechaHasta);
        const userId = DEMO_MODE ? Number((req as any).user?.nameid) : undefined;
        const resumen = await obtenerResumenFinancieroLogica(fromDb, toDb, fromIso, toIso, userId);
        res.json(resumen);
    } catch (error: any) { res.status(500).json({ message: "Error" }); }
};

export const getEstadisticasFacturas = async (req: Request, res: Response) => {
    try {
        const { fromDb, toDb, fromIso, toIso } = getBoundaries(req.query.fechaDesde, req.query.fechaHasta);
        const userId = DEMO_MODE ? Number((req as any).user?.nameid) : undefined;
        const estadisticas = await obtenerEstadisticasFacturasLogica(fromDb, toDb, fromIso, toIso, userId);
        res.json(estadisticas);
    } catch (error: any) { res.status(500).json({ message: "Error" }); }
};

export const getUltimosMovimientos = async (req: Request, res: Response) => {
    try {
        const userId = DEMO_MODE ? Number((req as any).user?.nameid) : undefined;
        const movimientos = await obtenerUltimosMovimientosLogica(userId);
        res.json(movimientos);
    } catch (error: any) { res.status(500).json({ message: "Error" }); }
};

const obtenerResumenFinancieroLogica = async (fromDb: string, toDb: string, fromIso: string, toIso: string, userId?: number) => {
    const ingresosResult = await db.select({ total: sum(schema.pagos.monto) })
        .from(schema.pagos)
        .where(and(gte(schema.pagos.fechapago, fromDb), lte(schema.pagos.fechapago, toDb)));

    const gastosResult = await db.select({ total: sum(schema.gastos.monto) })
        .from(schema.gastos)
        .where(and(gte(schema.gastos.fechagasto, fromDb), lte(schema.gastos.fechagasto, toDb)));

    const demoIngresos = DEMO_MODE && userId ? demoStore.getTotalPagosInRange(userId, fromIso, toIso) : 0;
    const demoGastos   = DEMO_MODE && userId ? demoStore.getTotalGastosInRange(userId, fromIso, toIso) : 0;

    const totalIngresos = (Number(ingresosResult[0]?.total) || 0) + demoIngresos;
    const totalGastos   = (Number(gastosResult[0]?.total) || 0) + demoGastos;

    const gananciaNeta = totalIngresos - totalGastos;
    const margenGanancia = totalIngresos > 0 ? (gananciaNeta / totalIngresos * 100) : 0;

    return { totalIngresos, totalGastos, gananciaNeta, margenGanancia, fechaDesde: fromIso, fechaHasta: toIso };
};

const obtenerEstadisticasFacturasLogica = async (fromDb: string, toDb: string, fromIso: string, toIso: string, userId?: number) => {
    const facturas = await db.select().from(schema.facturas)
        .where(and(gte(schema.facturas.fechacreacion, fromDb), lte(schema.facturas.fechacreacion, toDb)));

    type FacturaShape = { total: any; montoabonado: any; montopendiente: any; idestado: number };
    let allFacturas: FacturaShape[] = facturas as FacturaShape[];

    if (DEMO_MODE && userId) {
        const demoFacturas = demoStore.getFacturasInRange(userId, fromIso, toIso);
        allFacturas = [...allFacturas, ...demoFacturas as FacturaShape[]];
    }

    const totalFacturas = allFacturas.length;
    const totalVentas = allFacturas.reduce((acc, f) => acc + Number(f.total), 0);
    const totalAbonado = allFacturas.reduce((acc, f) => acc + Number(f.montoabonado || 0), 0);
    const totalPendiente = allFacturas.reduce((acc, f) => acc + Number(f.montopendiente || 0), 0);

    return {
        totalFacturas,
        facturasPagadas: allFacturas.filter(f => f.idestado === 5).length,
        facturasPendientes: allFacturas.filter(f => f.idestado === 4).length,
        promedioVenta: totalFacturas > 0 ? (totalVentas / totalFacturas) : 0,
        totalAbonado, totalPendiente
    };
};

const obtenerUltimosMovimientosLogica = async (userId?: number) => {
    const movimientos: any[] = [];

    const ultimasFacturas = await db.select({ factura: schema.facturas, estadoNombre: schema.estados.nombre })
        .from(schema.facturas).leftJoin(schema.estados, eq(schema.facturas.idestado, schema.estados.idestado))
        .orderBy(desc(schema.facturas.fechacreacion)).limit(2);

    for (const row of ultimasFacturas) {
        movimientos.push({
            id: row.factura.idfactura, tipo: "ingreso",
            descripcion: `${row.factura.numerofactura} - ${row.factura.nombrecliente}`,
            monto: Number(row.factura.montoabonado || 0),
            fecha: row.factura.fechacreacion ? row.factura.fechacreacion.replace(" ", "T") : null,
            categoria: row.estadoNombre
        });
    }

    const ultimosGastos = await db.select({ gasto: schema.gastos, categoriaNombre: schema.categoriasgasto.nombre, categoriaColor: schema.categoriasgasto.color })
        .from(schema.gastos).leftJoin(schema.categoriasgasto, eq(schema.gastos.idcategoriagasto, schema.categoriasgasto.idcategoriagasto))
        .orderBy(desc(schema.gastos.fechagasto)).limit(2);

    for (const row of ultimosGastos) {
        movimientos.push({
            id: row.gasto.idgasto, tipo: "gasto",
            descripcion: row.gasto.descripcion || row.categoriaNombre || "Sin descripción",
            monto: Number(row.gasto.monto),
            fecha: row.gasto.fechagasto ? row.gasto.fechagasto.replace(" ", "T") : null,
            categoria: row.categoriaNombre, color: row.categoriaColor
        });
    }

    if (DEMO_MODE && userId) {
        for (const f of demoStore.getLastFacturas(userId, 2)) {
            movimientos.push({
                id: f.idfactura, tipo: "ingreso",
                descripcion: `${f.numerofactura} - ${f.nombrecliente}`,
                monto: Number(f.montoabonado || 0), fecha: f.fechacreacion, categoria: 'Demo'
            });
        }
        for (const g of demoStore.getLastGastos(userId, 2)) {
            movimientos.push({
                id: g.idgasto, tipo: "gasto",
                descripcion: g.descripcion || g.categoriaNombre || "Sin descripción",
                monto: Number(g.monto), fecha: g.fechagasto,
                categoria: g.categoriaNombre, color: g.categoriaColor
            });
        }
    }

    return movimientos.sort((a, b) => new Date(b.fecha).getTime() - new Date(a.fecha).getTime()).slice(0, 4);
};
