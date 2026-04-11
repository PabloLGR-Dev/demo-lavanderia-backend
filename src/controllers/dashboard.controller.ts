import { Request, Response } from 'express';
import { and, gte, lte, desc, sum, eq } from 'drizzle-orm';
import { db } from '../db/index.js';
import * as schema from '../db/schema.js';

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

        const resumenFinanciero = await obtenerResumenFinancieroLogica(fromDb, toDb, fromIso, toIso);
        const estadisticasFacturas = await obtenerEstadisticasFacturasLogica(fromDb, toDb);
        const ultimosMovimientos = await obtenerUltimosMovimientosLogica();

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
        const resumen = await obtenerResumenFinancieroLogica(fromDb, toDb, fromIso, toIso);
        res.json(resumen);
    } catch (error: any) { res.status(500).json({ message: "Error" }); }
};

export const getEstadisticasFacturas = async (req: Request, res: Response) => {
    try {
        const { fromDb, toDb } = getBoundaries(req.query.fechaDesde, req.query.fechaHasta);
        const estadisticas = await obtenerEstadisticasFacturasLogica(fromDb, toDb);
        res.json(estadisticas);
    } catch (error: any) { res.status(500).json({ message: "Error" }); }
};

export const getUltimosMovimientos = async (req: Request, res: Response) => {
    try {
        const movimientos = await obtenerUltimosMovimientosLogica();
        res.json(movimientos);
    } catch (error: any) { res.status(500).json({ message: "Error" }); }
};

const obtenerResumenFinancieroLogica = async (fromDb: string, toDb: string, fromIso: string, toIso: string) => {
    // 🌟 CORRECCIÓN CONTABLE: Ingresos calculados desde la tabla PAGOS
    const ingresosResult = await db.select({ total: sum(schema.pagos.monto) })
        .from(schema.pagos)
        .where(and(gte(schema.pagos.fechapago, fromDb), lte(schema.pagos.fechapago, toDb)));
    const totalIngresos = Number(ingresosResult[0]?.total) || 0;
    
    const gastosResult = await db.select({ total: sum(schema.gastos.monto) })
        .from(schema.gastos)
        .where(and(gte(schema.gastos.fechagasto, fromDb), lte(schema.gastos.fechagasto, toDb)));
    const totalGastos = Number(gastosResult[0]?.total) || 0;

    const gananciaNeta = totalIngresos - totalGastos;
    const margenGanancia = totalIngresos > 0 ? (gananciaNeta / totalIngresos * 100) : 0;

    return { totalIngresos, totalGastos, gananciaNeta, margenGanancia, fechaDesde: fromIso, fechaHasta: toIso };
};

const obtenerEstadisticasFacturasLogica = async (fromDb: string, toDb: string) => {
    const facturas = await db.select().from(schema.facturas)
        .where(and(gte(schema.facturas.fechacreacion, fromDb), lte(schema.facturas.fechacreacion, toDb)));

    const totalFacturas = facturas.length;
    const totalVentas = facturas.reduce((acc, f) => acc + Number(f.total), 0);
    const totalAbonado = facturas.reduce((acc, f) => acc + Number(f.montoabonado || 0), 0);
    const totalPendiente = facturas.reduce((acc, f) => acc + Number(f.montopendiente || 0), 0);
    
    return {
        totalFacturas,
        facturasPagadas: facturas.filter(f => f.idestado === 5).length,
        facturasPendientes: facturas.filter(f => f.idestado === 4).length,
        promedioVenta: totalFacturas > 0 ? (totalVentas / totalFacturas) : 0,
        totalAbonado, totalPendiente
    };
};

const obtenerUltimosMovimientosLogica = async () => {
    const movimientos: any[] = [];
    const ultimasFacturas = await db.select({ factura: schema.facturas, estadoNombre: schema.estados.nombre })
    .from(schema.facturas).leftJoin(schema.estados, eq(schema.facturas.idestado, schema.estados.idestado))
    .orderBy(desc(schema.facturas.fechacreacion)).limit(2);

    for (const row of ultimasFacturas) {
        movimientos.push({
            id: row.factura.idfactura, tipo: "ingreso", descripcion: `${row.factura.numerofactura} - ${row.factura.nombrecliente}`,
            monto: Number(row.factura.montoabonado || 0), fecha: row.factura.fechacreacion ? row.factura.fechacreacion.replace(" ", "T") : null, categoria: row.estadoNombre
        });
    }

    const ultimosGastos = await db.select({ gasto: schema.gastos, categoriaNombre: schema.categoriasgasto.nombre, categoriaColor: schema.categoriasgasto.color })
    .from(schema.gastos).leftJoin(schema.categoriasgasto, eq(schema.gastos.idcategoriagasto, schema.categoriasgasto.idcategoriagasto))
    .orderBy(desc(schema.gastos.fechagasto)).limit(2);

    for (const row of ultimosGastos) {
        movimientos.push({
            id: row.gasto.idgasto, tipo: "gasto", descripcion: row.gasto.descripcion || row.categoriaNombre || "Sin descripción",
            monto: Number(row.gasto.monto), fecha: row.gasto.fechagasto ? row.gasto.fechagasto.replace(" ", "T") : null, categoria: row.categoriaNombre, color: row.categoriaColor
        });
    }

    return movimientos.sort((a, b) => new Date(b.fecha).getTime() - new Date(a.fecha).getTime()).slice(0, 4);
};