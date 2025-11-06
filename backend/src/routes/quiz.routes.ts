// src/routes/quiz.routes.ts
import { Router } from 'express';
import { QuizController } from '../controllers/quiz.controller';
import { authMiddleware } from '../middleware/auth.middleware';

const router = Router();
const quizController = new QuizController();

router.use(authMiddleware);

router.post('/start', quizController.startQuiz);
router.get('/session/:sessionId', quizController.getQuizSession);
router.post('/submit-answer', quizController.submitAnswer);
router.post('/complete', quizController.completeQuiz);
router.get('/history', quizController.getQuizHistory);

export default router;