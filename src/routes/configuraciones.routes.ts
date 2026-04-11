import { Router } from 'express';
import { 
    getConfiguracionesGenerales, 
    toggleControlStock, 
    toggleControlEntregas,
    getAllConfiguraciones,
    createConfiguracion,
    updateConfiguracionByKey
} from '../controllers/configuraciones.controller.js';
import { authorize } from '../middlewares/auth.middleware.js';

const router = Router();

router.use(authorize);

router.get('/', getAllConfiguraciones);
router.post('/', createConfiguracion);
router.put('/:claveParam', updateConfiguracionByKey);

router.get('/generales', getConfiguracionesGenerales);
router.post('/toggle-control-stock', toggleControlStock);
router.post('/toggle-control-entregas', toggleControlEntregas);

export default router;