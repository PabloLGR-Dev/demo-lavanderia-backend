import { Router } from 'express';
import { getPrendaServicioById, createPrendaServicio, 
    updatePrendaServicio, deletePrendaServicio } from '../controllers/prendas-servicios.controller.js';
import { authorize } from '../middlewares/auth.middleware.js';

const router = Router();
router.use(authorize);

router.get('/:id', getPrendaServicioById);
router.post('/', createPrendaServicio);
router.put('/:id', updatePrendaServicio);
router.delete('/:id', deletePrendaServicio);

export default router;