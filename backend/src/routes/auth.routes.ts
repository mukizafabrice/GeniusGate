// src/routes/auth.routes.ts
import { Router } from 'express';
import { AuthController } from '../controllers/auth.controller';
import { validationMiddleware } from '../middleware/validation.middleware';
import { RegisterSchema, LoginSchema } from '../utils/validation';

const router = Router();
const authController = new AuthController();

router.post('/register', validationMiddleware(RegisterSchema), authController.register);
router.post('/login', validationMiddleware(LoginSchema), authController.login);
router.post('/refresh-token', authController.refreshToken);
router.post('/logout', authController.logout);

export default router;