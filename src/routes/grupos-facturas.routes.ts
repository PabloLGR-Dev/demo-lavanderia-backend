import { Router } from 'express';
import {
    getGruposResumen,
    getGrupoDetalle,
    createGrupo,
    updateGrupo,
    deleteGrupo,
    addFacturasAlGrupo,
    removeFacturaDelGrupo,
    pagarGrupo,
    getFacturasDisponibles,
    getGrupoDeFactura,
} from '../controllers/grupos-facturas.controller.js';
import { authorize } from '../middlewares/auth.middleware.js';

const router = Router();

router.use(authorize);

// Rutas estáticas primero
router.get('/resumen', getGruposResumen);
router.get('/facturas-disponibles', getFacturasDisponibles);
router.get('/por-factura/:idFactura', getGrupoDeFactura);

// CRUD de grupo
router.post('/', createGrupo);
router.get('/:id', getGrupoDetalle);
router.put('/:id', updateGrupo);
router.delete('/:id', deleteGrupo);

// Gestión de facturas en el grupo
router.post('/:id/facturas', addFacturasAlGrupo);
router.delete('/:id/facturas/:idFactura', removeFacturaDelGrupo);

// Pago al grupo
router.post('/:id/pagar', pagarGrupo);

export default router;
