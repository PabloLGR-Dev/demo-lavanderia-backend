export const DEMO_MODE = process.env.DEMO_MODE === 'true';

export const DEMO_ID_START = 90001;

export const isDemoId = (id: number) => id >= DEMO_ID_START;

export const ESTADO_NOMBRES: Record<number, string> = {
    1: 'Activo',
    2: 'usuario_inactivo',
    3: 'usuario_suspendido',
    4: 'pago_pendiente',
    5: 'pago_completado',
    6: 'pago_reembolsado',
    7: 'Entrega_Pendiente',
    8: 'Entrega_Completada',
    9: 'Entrega_Parcial',
    10: 'Eliminado',
    11: 'prueba',
};

// ==========================================
// TYPES
// ==========================================

export interface DemoFactura {
    idfactura: number;
    nombrecliente: string;
    telefonocliente: string | null;
    idcliente: number | null;
    idusuario: number;
    idestado: number;
    numerofactura: string;
    fechacreacion: string;
    fechaultimaactualizacion: string;
    fechaentregaestimada: string | null;
    fechaentregareal: string | null;
    subtotal: string;
    impuestos: string;
    descuento: string;
    total: string;
    metodopago: string;
    notas: string | null;
    montoabonado: string;
    montopendiente: string;
    idestadoentrega: number | null;
    recogidopor: string | null;
    notasentrega: string | null;
}

export interface DemoDetalle {
    iddetalle: number;
    idfactura: number;
    idprendaservicio: number | null;
    idproducto: number | null;
    cantidad: number;
    preciounitario: string;
    descripcion: string | null;
    fechacreacion: string;
}

export interface DemoPago {
    idpago: number;
    idfactura: number;
    monto: string;
    idestado: number;
    fechapago: string;
    metodopago: string;
    referencia: string | null;
    idusuario: number;
    notas: string | null;
}

export interface DemoGasto {
    idgasto: number;
    idcategoriagasto: number;
    categoriaNombre: string;
    categoriaColor: string;
    usuarioNombre: string;
    monto: string;
    fechagasto: string;
    descripcion: string | null;
    referencia: string | null;
    comprobanteurl: string | null;
    idusuario: number;
    idestado: number;
    fechacreacion: string;
    fechaultimaactualizacion: string;
}

export interface DemoCliente {
    idcliente: number;
    nombre: string;
    apellido: string | null;
    direccion: string | null;
    telefono: string | null;
    email: string | null;
    idestado: number;
    fecharegistro: string;
    fechaultimaactualizacion: string;
    notas: string | null;
}

export interface DemoServicio {
    idservicio: number;
    nombre: string;
    descripcion: string | null;
    duracionEstimada: number | null;
    idestado: number;
    fechaCreacion: string;
    fechaultimaactualizacion: string;
}

export interface DemoPrenda {
    idprenda: number;
    nombre: string;
    descripcion: string | null;
}

export interface DemoPrendaServicio {
    idprendaservicio: number;
    idprenda: number;
    idservicio: number;
    preciounitario: string;
    nombreServicio: string;
}

export interface DemoGrupo {
    idgrupo: number;
    nombre: string;
    idcliente: number | null;
    nombrecliente: string | null;
    notas: string | null;
    idestado: number;
    idusuario: number;
    fechacreacion: string;
    fechaultimaactualizacion: string;
}

export interface DemoGrupoDetalle {
    idgrupo: number;
    idfactura: number;
    fechaasignacion: string;
}

interface DemoConfig {
    controlStockActivo?: boolean;
    controlEntregasActivo?: boolean;
}

interface UserSession {
    facturas: DemoFactura[];
    detalles: DemoDetalle[];
    pagos: DemoPago[];
    gastos: DemoGasto[];
    clientes: DemoCliente[];
    servicios: DemoServicio[];
    prendas: DemoPrenda[];
    prendasServicios: DemoPrendaServicio[];
    grupos: DemoGrupo[];
    gruposDetalles: DemoGrupoDetalle[];
    config: DemoConfig;
    nextIds: {
        factura: number;
        detalle: number;
        pago: number;
        gasto: number;
        cliente: number;
        servicio: number;
        prenda: number;
        prendaServicio: number;
        grupo: number;
    };
}

// ==========================================
// STORE CLASS (singleton)
// ==========================================

class DemoStore {
    private sessions = new Map<number, UserSession>();

    private getSession(userId: number): UserSession {
        if (!this.sessions.has(userId)) {
            this.sessions.set(userId, {
                facturas: [],
                detalles: [],
                pagos: [],
                gastos: [],
                clientes: [],
                servicios: [],
                prendas: [],
                prendasServicios: [],
                grupos: [],
                gruposDetalles: [],
                config: {},
                nextIds: {
                    factura: DEMO_ID_START,
                    detalle: DEMO_ID_START,
                    pago: DEMO_ID_START,
                    gasto: DEMO_ID_START,
                    cliente: DEMO_ID_START,
                    servicio: DEMO_ID_START,
                    prenda: DEMO_ID_START,
                    prendaServicio: DEMO_ID_START,
                    grupo: DEMO_ID_START,
                },
            });
        }
        return this.sessions.get(userId)!;
    }

    clearSession(userId: number) {
        this.sessions.delete(userId);
    }

    // -- FACTURAS --

    addFactura(userId: number, data: Omit<DemoFactura, 'idfactura'>): DemoFactura {
        const s = this.getSession(userId);
        const factura: DemoFactura = { ...data, idfactura: s.nextIds.factura++ };
        s.facturas.push(factura);
        return factura;
    }

    getFacturas(userId: number): DemoFactura[] {
        return this.getSession(userId).facturas;
    }

    getFacturaById(userId: number, id: number): DemoFactura | undefined {
        return this.getSession(userId).facturas.find(f => f.idfactura === id);
    }

    updateFactura(userId: number, id: number, patch: Partial<DemoFactura>) {
        const s = this.getSession(userId);
        const i = s.facturas.findIndex(f => f.idfactura === id);
        if (i >= 0) s.facturas[i] = { ...s.facturas[i], ...patch };
    }

    deleteFactura(userId: number, id: number) {
        const s = this.getSession(userId);
        s.facturas = s.facturas.filter(f => f.idfactura !== id);
        s.detalles = s.detalles.filter(d => d.idfactura !== id);
        s.pagos    = s.pagos.filter(p => p.idfactura !== id);
        s.gruposDetalles = s.gruposDetalles.filter(gd => gd.idfactura !== id);
    }

    // -- DETALLES --

    addDetalle(userId: number, data: Omit<DemoDetalle, 'iddetalle'>): DemoDetalle {
        const s = this.getSession(userId);
        const detalle: DemoDetalle = { ...data, iddetalle: s.nextIds.detalle++ };
        s.detalles.push(detalle);
        return detalle;
    }

    getDetallesByFactura(userId: number, idfactura: number): DemoDetalle[] {
        return this.getSession(userId).detalles.filter(d => d.idfactura === idfactura);
    }

    // -- PAGOS --

    addPago(userId: number, data: Omit<DemoPago, 'idpago'>): DemoPago {
        const s = this.getSession(userId);
        const pago: DemoPago = { ...data, idpago: s.nextIds.pago++ };
        s.pagos.push(pago);
        return pago;
    }

    getPagosByFactura(userId: number, idfactura: number): DemoPago[] {
        return this.getSession(userId).pagos.filter(p => p.idfactura === idfactura);
    }

    getPagos(userId: number): DemoPago[] {
        return this.getSession(userId).pagos;
    }

    // -- GASTOS --

    addGasto(userId: number, data: Omit<DemoGasto, 'idgasto'>): DemoGasto {
        const s = this.getSession(userId);
        const gasto: DemoGasto = { ...data, idgasto: s.nextIds.gasto++ };
        s.gastos.push(gasto);
        return gasto;
    }

    getGastos(userId: number): DemoGasto[] {
        return this.getSession(userId).gastos;
    }

    getGastoById(userId: number, id: number): DemoGasto | undefined {
        return this.getSession(userId).gastos.find(g => g.idgasto === id);
    }

    updateGasto(userId: number, id: number, patch: Partial<DemoGasto>) {
        const s = this.getSession(userId);
        const i = s.gastos.findIndex(g => g.idgasto === id);
        if (i >= 0) s.gastos[i] = { ...s.gastos[i], ...patch };
    }

    deleteGasto(userId: number, id: number) {
        const s = this.getSession(userId);
        s.gastos = s.gastos.filter(g => g.idgasto !== id);
    }

    // -- CLIENTES --

    addCliente(userId: number, data: Omit<DemoCliente, 'idcliente'>): DemoCliente {
        const s = this.getSession(userId);
        const cliente: DemoCliente = { ...data, idcliente: s.nextIds.cliente++ };
        s.clientes.push(cliente);
        return cliente;
    }

    getClientes(userId: number): DemoCliente[] {
        return this.getSession(userId).clientes;
    }

    getClienteById(userId: number, id: number): DemoCliente | undefined {
        return this.getSession(userId).clientes.find(c => c.idcliente === id);
    }

    updateCliente(userId: number, id: number, patch: Partial<DemoCliente>) {
        const s = this.getSession(userId);
        const i = s.clientes.findIndex(c => c.idcliente === id);
        if (i >= 0) s.clientes[i] = { ...s.clientes[i], ...patch };
    }

    deleteCliente(userId: number, id: number) {
        const s = this.getSession(userId);
        s.clientes = s.clientes.filter(c => c.idcliente !== id);
    }

    // -- SERVICIOS --

    addServicio(userId: number, data: Omit<DemoServicio, 'idservicio'>): DemoServicio {
        const s = this.getSession(userId);
        const servicio: DemoServicio = { ...data, idservicio: s.nextIds.servicio++ };
        s.servicios.push(servicio);
        return servicio;
    }

    getServicios(userId: number): DemoServicio[] {
        return this.getSession(userId).servicios;
    }

    getServicioById(userId: number, id: number): DemoServicio | undefined {
        return this.getSession(userId).servicios.find(sv => sv.idservicio === id);
    }

    updateServicio(userId: number, id: number, patch: Partial<DemoServicio>) {
        const s = this.getSession(userId);
        const i = s.servicios.findIndex(sv => sv.idservicio === id);
        if (i >= 0) s.servicios[i] = { ...s.servicios[i], ...patch };
    }

    deleteServicio(userId: number, id: number) {
        const s = this.getSession(userId);
        s.servicios = s.servicios.filter(sv => sv.idservicio !== id);
    }

    // -- PRENDAS --

    addPrenda(userId: number, data: Omit<DemoPrenda, 'idprenda'>): DemoPrenda {
        const s = this.getSession(userId);
        const prenda: DemoPrenda = { ...data, idprenda: s.nextIds.prenda++ };
        s.prendas.push(prenda);
        return prenda;
    }

    getPrendas(userId: number): DemoPrenda[] {
        return this.getSession(userId).prendas;
    }

    getPrendaById(userId: number, id: number): DemoPrenda | undefined {
        return this.getSession(userId).prendas.find(p => p.idprenda === id);
    }

    updatePrenda(userId: number, id: number, patch: Partial<DemoPrenda>) {
        const s = this.getSession(userId);
        const i = s.prendas.findIndex(p => p.idprenda === id);
        if (i >= 0) s.prendas[i] = { ...s.prendas[i], ...patch };
    }

    deletePrenda(userId: number, id: number) {
        const s = this.getSession(userId);
        s.prendas = s.prendas.filter(p => p.idprenda !== id);
        s.prendasServicios = s.prendasServicios.filter(ps => ps.idprenda !== id);
    }

    // -- PRENDAS-SERVICIOS --

    addPrendaServicio(userId: number, data: Omit<DemoPrendaServicio, 'idprendaservicio'>): DemoPrendaServicio {
        const s = this.getSession(userId);
        const ps: DemoPrendaServicio = { ...data, idprendaservicio: s.nextIds.prendaServicio++ };
        s.prendasServicios.push(ps);
        return ps;
    }

    getPrendasServiciosByPrenda(userId: number, idprenda: number): DemoPrendaServicio[] {
        return this.getSession(userId).prendasServicios.filter(ps => ps.idprenda === idprenda);
    }

    getPrendaServicioById(userId: number, id: number): DemoPrendaServicio | undefined {
        return this.getSession(userId).prendasServicios.find(ps => ps.idprendaservicio === id);
    }

    updatePrendaServicio(userId: number, id: number, patch: Partial<DemoPrendaServicio>) {
        const s = this.getSession(userId);
        const i = s.prendasServicios.findIndex(ps => ps.idprendaservicio === id);
        if (i >= 0) s.prendasServicios[i] = { ...s.prendasServicios[i], ...patch };
    }

    deletePrendaServicio(userId: number, id: number) {
        const s = this.getSession(userId);
        s.prendasServicios = s.prendasServicios.filter(ps => ps.idprendaservicio !== id);
    }

    // -- GRUPOS --

    addGrupo(userId: number, data: Omit<DemoGrupo, 'idgrupo'>): DemoGrupo {
        const s = this.getSession(userId);
        const grupo: DemoGrupo = { ...data, idgrupo: s.nextIds.grupo++ };
        s.grupos.push(grupo);
        return grupo;
    }

    getGrupos(userId: number): DemoGrupo[] {
        return this.getSession(userId).grupos;
    }

    getGrupoById(userId: number, id: number): DemoGrupo | undefined {
        return this.getSession(userId).grupos.find(g => g.idgrupo === id);
    }

    updateGrupo(userId: number, id: number, patch: Partial<DemoGrupo>) {
        const s = this.getSession(userId);
        const i = s.grupos.findIndex(g => g.idgrupo === id);
        if (i >= 0) s.grupos[i] = { ...s.grupos[i], ...patch };
    }

    deleteGrupo(userId: number, id: number) {
        const s = this.getSession(userId);
        s.grupos = s.grupos.filter(g => g.idgrupo !== id);
        s.gruposDetalles = s.gruposDetalles.filter(gd => gd.idgrupo !== id);
    }

    // -- GRUPOS DETALLES (factura membership) --

    addGrupoDetalle(userId: number, data: DemoGrupoDetalle) {
        this.getSession(userId).gruposDetalles.push(data);
    }

    getGrupoDetalles(userId: number, idgrupo: number): DemoGrupoDetalle[] {
        return this.getSession(userId).gruposDetalles.filter(gd => gd.idgrupo === idgrupo);
    }

    getGrupoDetalleByFactura(userId: number, idfactura: number): DemoGrupoDetalle | undefined {
        return this.getSession(userId).gruposDetalles.find(gd => gd.idfactura === idfactura);
    }

    removeGrupoDetalle(userId: number, idgrupo: number, idfactura: number) {
        const s = this.getSession(userId);
        s.gruposDetalles = s.gruposDetalles.filter(
            gd => !(gd.idgrupo === idgrupo && gd.idfactura === idfactura)
        );
    }

    getAllGrupoDetalles(userId: number): DemoGrupoDetalle[] {
        return this.getSession(userId).gruposDetalles;
    }

    // -- CONFIG --

    getConfig(userId: number): DemoConfig {
        return this.getSession(userId).config;
    }

    setConfig(userId: number, key: keyof DemoConfig, value: boolean) {
        this.getSession(userId).config[key] = value;
    }

    // -- AGGREGATION HELPERS (dashboard / reportes) --

    getTotalPagosInRange(userId: number, from: string, to: string): number {
        return this.getSession(userId).pagos
            .filter(p => p.fechapago >= from && p.fechapago <= to)
            .reduce((acc, p) => acc + Number(p.monto), 0);
    }

    getTotalGastosInRange(userId: number, from: string, to: string): number {
        return this.getSession(userId).gastos
            .filter(g => g.fechagasto >= from && g.fechagasto <= to)
            .reduce((acc, g) => acc + Number(g.monto), 0);
    }

    getFacturasInRange(userId: number, from: string, to: string): DemoFactura[] {
        return this.getSession(userId).facturas
            .filter(f => f.fechacreacion >= from && f.fechacreacion <= to);
    }

    getGastosInRange(userId: number, from: string, to: string): DemoGasto[] {
        return this.getSession(userId).gastos
            .filter(g => g.fechagasto >= from && g.fechagasto <= to);
    }

    getLastFacturas(userId: number, limit: number): DemoFactura[] {
        return [...this.getSession(userId).facturas]
            .sort((a, b) => b.fechacreacion.localeCompare(a.fechacreacion))
            .slice(0, limit);
    }

    getLastGastos(userId: number, limit: number): DemoGasto[] {
        return [...this.getSession(userId).gastos]
            .sort((a, b) => b.fechagasto.localeCompare(a.fechagasto))
            .slice(0, limit);
    }
}

export const demoStore = new DemoStore();
