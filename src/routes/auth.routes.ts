import { Router } from 'express';
import {
    login,
    me,
    logout,
    forgotPassword,
    validateResetToken,
    resetPassword
} from '../controllers/auth.controller.js';
import { authorize } from '../middlewares/auth.middleware.js';

const router = Router();

// Endpoints públicos
router.post('/login', login);
router.post('/forgot-password', forgotPassword);
router.post('/validate-reset-token', validateResetToken);
router.post('/reset-password', resetPassword);

// Endpoints protegidos
router.get('/me', authorize, me);
router.post('/logout', authorize, logout);

export default router;