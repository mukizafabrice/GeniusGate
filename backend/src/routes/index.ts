import { Router } from 'express';
import authRoutes from './auth.routes';
import quizRoutes from './quiz.routes';
import paymentRoutes from './payment.routes';
import adminRoutes from './admin.routes';

const router = Router();

router.use('/auth', authRoutes);
router.use('/quiz', quizRoutes);
router.use('/payment', paymentRoutes);
router.use('/admin', adminRoutes);

export default router;