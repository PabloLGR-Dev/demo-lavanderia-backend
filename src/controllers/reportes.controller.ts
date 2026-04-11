import { Request, Response } from 'express';
import { and, gte, lte, eq, sum } from 'drizzle-orm';
import { db } from '../db/index.js';
import * as schema from '../db/schema.js';

// --- HELPER DE ZONA HORARIA Y RANGOS (República Dominicana UTC-4) ---
const getDRDateTime = (dateVal?: string | Date) => {
    const d = dateVal ? new Date(dateVal) : new Date();
    // Si la fecha es inválida, usar la actual
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
        // Cortamos solo la fecha (YYYY-MM-DD) para asegurarnos del día exacto en RD
        fromDateStr = getDRDateTime(desdeQuery as string).substring(0, 10);
        toDateStr = getDRDateTime(hastaQuery as string).substring(0, 10);
    } else {
        // Por defecto: Todo el mes actual
        const hoyStr = getDRDateTime().substring(0, 10);
        const year = hoyStr.substring(0, 4);
        const month = hoyStr.substring(5, 7);
        const lastDay = new Date(Number(year), Number(month), 0).getDate();
        fromDateStr = `${year}-${month}-01`;
        toDateStr = `${year}-${month}-${lastDay}`;
    }

    // Para consultar en PostgreSQL (usa espacio)
    const fromDb = `${fromDateStr} 00:00:00`;
    const toDb = `${toDateStr} 23:59:59`;
    
    // Para devolver al Frontend (usa 'T' para que parseISO no falle)
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

        const resumenFinanciero = await GetResumenFinancieroReporte(fromDb, toDb, fromIso, toIso);
        const estadisticasGastos = await GetEstadisticasGastosReporte(fromDb, toDb);
        const estadisticasFacturas = await GetEstadisticasFacturasReporte(fromDb, toDb);

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
        const resumen = await GetResumenFinancieroReporte(fromDb, toDb, fromIso, toIso);
        res.json(resumen);
    } catch (error: any) {
        res.status(500).json({ message: "Error al obtener resumen financiero", error: error.message });
    }
};

export const getEstadisticasGastos = async (req: Request, res: Response) => {
    try {
        const { fromDb, toDb } = getBoundaries(req.query.fechaDesde, req.query.fechaHasta);
        const estadisticas = await GetEstadisticasGastosReporte(fromDb, toDb);
        res.json(estadisticas);
    } catch (error: any) {
        res.status(500).json({ message: "Error al obtener estadísticas de gastos", error: error.message });
    }
};

export const getEstadisticasFacturas = async (req: Request, res: Response) => {
    try {
        const { fromDb, toDb } = getBoundaries(req.query.fechaDesde, req.query.fechaHasta);
        const estadisticas = await GetEstadisticasFacturasReporte(fromDb, toDb);
        res.json(estadisticas);
    } catch (error: any) {
        res.status(500).json({ message: "Error al obtener estadísticas de facturas", error: error.message });
    }
};

// ==========================================
// MÉTODOS PRIVADOS / LÓGICA DE REPORTE
// ==========================================

const GetResumenFinancieroReporte = async (fromDb: string, toDb: string, fromIso: string, toIso: string) => {
    // 🌟 CORRECCIÓN CONTABLE: Ingresos calculados desde la tabla PAGOS por su fecha de pago real
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

const GetEstadisticasGastosReporte = async (fromDb: string, toDb: string) => {
    const gastos = await db.select({
        gasto: schema.gastos,
        categoriaNombre: schema.categoriasgasto.nombre,
        categoriaColor: schema.categoriasgasto.color
    })
    .from(schema.gastos)
    .leftJoin(schema.categoriasgasto, eq(schema.gastos.idcategoriagasto, schema.categoriasgasto.idcategoriagasto))
    .where(and(gte(schema.gastos.fechagasto, fromDb), lte(schema.gastos.fechagasto, toDb)));

    if (gastos.length === 0) return { totalGastos: 0, promedioGasto: 0, totalRegistros: 0, gastosPorCategoria: [], gastosPorMes: [] };

    const totalGastos = gastos.reduce((acc, g) => acc + Number(g.gasto.monto), 0);
    
    const catMap = new Map<string, { color: string, total: number, cantidad: number }>();
    gastos.forEach(g => {
        const cat = g.categoriaNombre || "Sin Categoría";
        const color = g.categoriaColor || '#6B7280';
        const monto = Number(g.gasto.monto);
        
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
        // Fechas de base de datos son de la forma "2026-04-09 20:28:44"
        const year = Number(g.gasto.fechagasto.substring(0, 4));
        const month = Number(g.gasto.fechagasto.substring(5, 7)); 
        const key = `${year}-${month}`;

        if (!mesMap.has(key)) mesMap.set(key, { año: year, mes: month, mesNombre: mesesNombres[month - 1], total: 0, cantidad: 0 });
        const data = mesMap.get(key)!;
        data.total += Number(g.gasto.monto); data.cantidad += 1;
    });

    return { totalGastos, promedioGasto: totalGastos / gastos.length, totalRegistros: gastos.length, gastosPorCategoria, gastosPorMes: Array.from(mesMap.values()).sort((a, b) => (a.año - b.año) || (a.mes - b.mes)) };
};

const GetEstadisticasFacturasReporte = async (fromDb: string, toDb: string) => {
    const facturas = await db.select()
        .from(schema.facturas)
        .where(and(gte(schema.facturas.fechacreacion, fromDb), lte(schema.facturas.fechacreacion, toDb)));

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

    if (rf.gananciaNeta < 0) recomendaciones.push({ tipo: "warning", mensaje: "⚠️ El negocio está operando en pérdidas. Considera reducir gastos o aumentar ingresos.", icono: "⚠️" });
    if (rf.margenGanancia < 20 && rf.gananciaNeta > 0) recomendaciones.push({ tipo: "warning", mensaje: `📉 Margen de ganancia bajo (${rf.margenGanancia.toFixed(1)}%). Revisa la estructura de costos.`, icono: "📉" });
    else if (rf.margenGanancia >= 20 && rf.margenGanancia < 40) recomendaciones.push({ tipo: "success", mensaje: `✅ Margen saludable (${rf.margenGanancia.toFixed(1)}%). El negocio está funcionando bien.`, icono: "✅" });
    else if (rf.margenGanancia >= 40) recomendaciones.push({ tipo: "success", mensaje: `🎯 Excelente margen (${rf.margenGanancia.toFixed(1)}%). ¡Buen trabajo!`, icono: "🎯" });

    if (eg.gastosPorCategoria && eg.gastosPorCategoria.length > 0) {
        const mayorGasto = eg.gastosPorCategoria[0];
        recomendaciones.push({ tipo: "info", mensaje: `📊 Mayor gasto: ${mayorGasto.categoria} (RD$ ${mayorGasto.total.toFixed(2)}). Representa el ${mayorGasto.porcentaje.toFixed(1)}% del total.`, icono: "📊" });
    }

    if (ef.totalPendiente > (ef.totalAbonado * 0.3)) recomendaciones.push({ tipo: "warning", mensaje: "💸 Hay un monto significativo pendiente de cobro. Considera hacer seguimiento a clientes.", icono: "💸" });

    return recomendaciones;
};