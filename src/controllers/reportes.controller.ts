import { Request, Response } from 'express';
import { and, gte, lte, eq, sum } from 'drizzle-orm';
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

// ==========================================
// 1. REPORTE FINANCIERO COMPLETO (GET)
// ==========================================
export const getReporteFinancieroCompleto = async (req: Request, res: Response) => {
    try {
        const { fromDb, toDb, fromIso, toIso } = getBoundaries(req.query.fechaDesde, req.query.fechaHasta);
        const userId = DEMO_MODE ? Number((req as any).user?.nameid) : undefined;

        const resumenFinanciero = await GetResumenFinancieroReporte(fromDb, toDb, fromIso, toIso, userId);
        const estadisticasGastos = await GetEstadisticasGastosReporte(fromDb, toDb, fromIso, toIso, userId);
        const estadisticasFacturas = await GetEstadisticasFacturasReporte(fromDb, toDb, fromIso, toIso, userId);

        const reporte = {
            resumenFinanciero,
            estadisticasGastos,
            estadisticasFacturas,
            fechaGeneracion: getDRDateTime(),
            recomendaciones: [] as any[]
        };

        reporte.recomendaciones = GenerarRecomendaciones(reporte);

        res.json(reporte);
    } catch (error: any) {
        console.error("Error en getReporteFinancieroCompleto:", error);
        res.status(500).json({ message: "Error al generar reporte financiero", error: error.message });
    }
};

export const getResumenFinanciero = async (req: Request, res: Response) => {
    try {
        const { fromDb, toDb, fromIso, toIso } = getBoundaries(req.query.fechaDesde, req.query.fechaHasta);
        const userId = DEMO_MODE ? Number((req as any).user?.nameid) : undefined;
        const resumen = await GetResumenFinancieroReporte(fromDb, toDb, fromIso, toIso, userId);
        res.json(resumen);
    } catch (error: any) {
        res.status(500).json({ message: "Error al obtener resumen financiero", error: error.message });
    }
};

export const getEstadisticasGastos = async (req: Request, res: Response) => {
    try {
        const { fromDb, toDb, fromIso, toIso } = getBoundaries(req.query.fechaDesde, req.query.fechaHasta);
        const userId = DEMO_MODE ? Number((req as any).user?.nameid) : undefined;
        const estadisticas = await GetEstadisticasGastosReporte(fromDb, toDb, fromIso, toIso, userId);
        res.json(estadisticas);
    } catch (error: any) {
        res.status(500).json({ message: "Error al obtener estadísticas de gastos", error: error.message });
    }
};

export const getEstadisticasFacturas = async (req: Request, res: Response) => {
    try {
        const { fromDb, toDb, fromIso, toIso } = getBoundaries(req.query.fechaDesde, req.query.fechaHasta);
        const userId = DEMO_MODE ? Number((req as any).user?.nameid) : undefined;
        const estadisticas = await GetEstadisticasFacturasReporte(fromDb, toDb, fromIso, toIso, userId);
        res.json(estadisticas);
    } catch (error: any) {
        res.status(500).json({ message: "Error al obtener estadísticas de facturas", error: error.message });
    }
};

// ==========================================
// MÉTODOS PRIVADOS / LÓGICA DE REPORTE
// ==========================================

const GetResumenFinancieroReporte = async (fromDb: string, toDb: string, fromIso: string, toIso: string, userId?: number) => {
    const ingresosResult = await db.select({ total: sum(schema.pagos.monto) })
        .from(schema.pagos)
        .where(and(gte(schema.pagos.fechapago, fromDb), lte(schema.pagos.fechapago, toDb)));
    const totalIngresosDb = Number(ingresosResult[0]?.total) || 0;

    const gastosResult = await db.select({ total: sum(schema.gastos.monto) })
        .from(schema.gastos)
        .where(and(gte(schema.gastos.fechagasto, fromDb), lte(schema.gastos.fechagasto, toDb)));
    const totalGastosDb = Number(gastosResult[0]?.total) || 0;

    const demoIngresos = DEMO_MODE && userId ? demoStore.getTotalPagosInRange(userId, fromIso, toIso) : 0;
    const demoGastos   = DEMO_MODE && userId ? demoStore.getTotalGastosInRange(userId, fromIso, toIso) : 0;

    const totalIngresos = totalIngresosDb + demoIngresos;
    const totalGastos   = totalGastosDb + demoGastos;

    const gananciaNeta = totalIngresos - totalGastos;
    const margenGanancia = totalIngresos > 0 ? (gananciaNeta / totalIngresos * 100) : 0;

    return { totalIngresos, totalGastos, gananciaNeta, margenGanancia, fechaDesde: fromIso, fechaHasta: toIso };
};

interface GastoNorm {
    monto: string;
    fechagasto: string;
    categoriaNombre: string;
    categoriaColor: string;
}

const GetEstadisticasGastosReporte = async (fromDb: string, toDb: string, fromIso: string, toIso: string, userId?: number) => {
    const gastosDb = await db.select({
        gasto: schema.gastos,
        categoriaNombre: schema.categoriasgasto.nombre,
        categoriaColor: schema.categoriasgasto.color
    })
    .from(schema.gastos)
    .leftJoin(schema.categoriasgasto, eq(schema.gastos.idcategoriagasto, schema.categoriasgasto.idcategoriagasto))
    .where(and(gte(schema.gastos.fechagasto, fromDb), lte(schema.gastos.fechagasto, toDb)));

    const gastos: GastoNorm[] = gastosDb.map(g => ({
        monto: g.gasto.monto,
        fechagasto: g.gasto.fechagasto,
        categoriaNombre: g.categoriaNombre || "Sin Categoría",
        categoriaColor: g.categoriaColor || '#6B7280'
    }));

    if (DEMO_MODE && userId) {
        for (const g of demoStore.getGastosInRange(userId, fromIso, toIso)) {
            gastos.push({
                monto: g.monto,
                fechagasto: g.fechagasto,
                categoriaNombre: g.categoriaNombre,
                categoriaColor: g.categoriaColor
            });
        }
    }

    if (gastos.length === 0) return { totalGastos: 0, promedioGasto: 0, totalRegistros: 0, gastosPorCategoria: [], gastosPorMes: [] };

    const totalGastos = gastos.reduce((acc, g) => acc + Number(g.monto), 0);

    const catMap = new Map<string, { color: string, total: number, cantidad: number }>();
    gastos.forEach(g => {
        const cat = g.categoriaNombre;
        const color = g.categoriaColor;
        const monto = Number(g.monto);
        if (!catMap.has(cat)) catMap.set(cat, { color, total: 0, cantidad: 0 });
        const data = catMap.get(cat)!;
        data.total += monto; data.cantidad += 1;
    });

    const gastosPorCategoria = Array.from(catMap.entries()).map(([categoria, data]) => ({
        categoria, color: data.color, total: data.total, cantidad: data.cantidad,
        porcentaje: totalGastos > 0 ? (data.total / totalGastos * 100) : 0
    })).sort((a, b) => b.total - a.total);

    const mesesNombres = ["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"];
    const mesMap = new Map<string, { año: number, mes: number, mesNombre: string, total: number, cantidad: number }>();

    gastos.forEach(g => {
        const year = Number(g.fechagasto.substring(0, 4));
        const month = Number(g.fechagasto.substring(5, 7));
        const key = `${year}-${month}`;
        if (!mesMap.has(key)) mesMap.set(key, { año: year, mes: month, mesNombre: mesesNombres[month - 1], total: 0, cantidad: 0 });
        const data = mesMap.get(key)!;
        data.total += Number(g.monto); data.cantidad += 1;
    });

    return {
        totalGastos, promedioGasto: totalGastos / gastos.length, totalRegistros: gastos.length,
        gastosPorCategoria,
        gastosPorMes: Array.from(mesMap.values()).sort((a, b) => (a.año - b.año) || (a.mes - b.mes))
    };
};

const GetEstadisticasFacturasReporte = async (fromDb: string, toDb: string, fromIso: string, toIso: string, userId?: number) => {
    const facturasDb = await db.select()
        .from(schema.facturas)
        .where(and(gte(schema.facturas.fechacreacion, fromDb), lte(schema.facturas.fechacreacion, toDb)));

    type FacturaShape = { total: any; montoabonado: any; montopendiente: any; idestado: number };
    let facturas: FacturaShape[] = facturasDb as FacturaShape[];

    if (DEMO_MODE && userId) {
        const demoFacturas = demoStore.getFacturasInRange(userId, fromIso, toIso);
        facturas = [...facturas, ...demoFacturas as FacturaShape[]];
    }

    if (facturas.length === 0) return { totalFacturas: 0, totalVentas: 0, totalAbonado: 0, totalPendiente: 0, facturasPagadas: 0, facturasPendientes: 0, promedioVenta: 0 };

    const totalFacturas = facturas.length;
    const totalVentas = facturas.reduce((acc, f) => acc + Number(f.total), 0);
    const totalAbonado = facturas.reduce((acc, f) => acc + Number(f.montoabonado || 0), 0);
    const totalPendiente = facturas.reduce((acc, f) => acc + Number(f.montopendiente || 0), 0);

    return {
        totalFacturas, totalVentas, totalAbonado, totalPendiente,
        facturasPagadas: facturas.filter(f => f.idestado === 5).length,
        facturasPendientes: facturas.filter(f => f.idestado === 4).length,
        promedioVenta: totalVentas / totalFacturas
    };
};

const GenerarRecomendaciones = (reporte: any) => {
    const recomendaciones = [];
    const rf = reporte.resumenFinanciero;
    const eg = reporte.estadisticasGastos;
    const ef = reporte.estadisticasFacturas;

    if (rf.gananciaNeta < 0) recomendaciones.push({ tipo: "warning", mensaje: "El negocio esta operando en perdidas. Considera reducir gastos o aumentar ingresos." });
    if (rf.margenGanancia < 20 && rf.gananciaNeta > 0) recomendaciones.push({ tipo: "warning", mensaje: `Margen de ganancia bajo (${rf.margenGanancia.toFixed(1)}%). Revisa la estructura de costos.` });
    else if (rf.margenGanancia >= 20 && rf.margenGanancia < 40) recomendaciones.push({ tipo: "success", mensaje: `Margen saludable (${rf.margenGanancia.toFixed(1)}%). El negocio esta funcionando bien.` });
    else if (rf.margenGanancia >= 40) recomendaciones.push({ tipo: "success", mensaje: `Excelente margen (${rf.margenGanancia.toFixed(1)}%).` });

    if (eg.gastosPorCategoria && eg.gastosPorCategoria.length > 0) {
        const mayorGasto = eg.gastosPorCategoria[0];
        recomendaciones.push({ tipo: "info", mensaje: `Mayor gasto: ${mayorGasto.categoria} (RD$ ${mayorGasto.total.toFixed(2)}). Representa el ${mayorGasto.porcentaje.toFixed(1)}% del total.` });
    }

    if (ef.totalPendiente > (ef.totalAbonado * 0.3)) recomendaciones.push({ tipo: "warning", mensaje: "Hay un monto significativo pendiente de cobro. Considera hacer seguimiento a clientes." });

    return recomendaciones;
};
