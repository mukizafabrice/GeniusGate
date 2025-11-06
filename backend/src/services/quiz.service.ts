// src/services/quiz.service.ts
import { QuizSession } from '../models/quizSession.model';
import { User } from '../models/user.model';
import { Transaction } from '../models/transaction.model';
import { AIService } from './ai.service';
import { Question, IQuizSession } from '../types/quiz.types';
import { logger } from '../utils/logger';

export class QuizService {
  private aiService: AIService;

  constructor() {
    this.aiService = new AIService();
  }

  async startQuiz(userId: string, category: string, paymentReference: string): Promise<IQuizSession> {
    // Verify payment was successful
    const transaction = await Transaction.findOne({ 
      paymentReference, 
      user: userId, 
      status: 'completed' 
    });
    
    if (!transaction) {
      throw new Error('Payment not verified');
    }

    // Generate AI questions
    const questions = await this.aiService.generateQuestions(category);
    
    // Create quiz session
    const quizSession = new QuizSession({
      user: userId,
      category,
      questions,
      totalQuestions: questions.length,
      paymentReference,
      status: 'active'
    });

    await quizSession.save();
    return quizSession;
  }

  async submitAnswer(sessionId: string, questionIndex: number, answer: string): Promise<{ 
    isCorrect: boolean; 
    correctAnswer: string;
    explanation?: string;
  }> {
    const session = await QuizSession.findById(sessionId);
    if (!session) {
      throw new Error('Quiz session not found');
    }

    if (session.status !== 'active') {
      throw new Error('Quiz session is not active');
    }

    const question = session.questions[questionIndex];
    if (!question) {
      throw new Error('Invalid question index');
    }

    const isCorrect = answer === question.correctAnswer;
    
    // Update user answers
    session.userAnswers[questionIndex] = answer;
    await session.save();

    return {
      isCorrect,
      correctAnswer: question.correctAnswer,
      explanation: question.explanation
    };
  }

  async completeQuiz(sessionId: string, userId: string): Promise<{ 
    score: number; 
    total: number; 
    reward: number;
    percentage: number;
  }> {
    const session = await QuizSession.findOne({ _id: sessionId, user: userId });
    if (!session) {
      throw new Error('Quiz session not found');
    }

    // Calculate score
    let score = 0;
    session.questions.forEach((question, index) => {
      if (session.userAnswers[index] === question.correctAnswer) {
        score++;
      }
    });

    // Calculate reward (example: $0.10 per correct answer)
    const rewardRate = 0.10;
    const reward = score * rewardRate;

    // Update session
    session.score = score;
    session.status = 'completed';
    session.timeCompleted = new Date();
    session.rewardEarned = reward;

    // Update user wallet
    await User.findByIdAndUpdate(userId, {
      $inc: { walletBalance: reward }
    });

    // Record reward transaction
    const rewardTransaction = new Transaction({
      user: userId,
      amount: reward,
      type: 'credit',
      status: 'completed',
      description: `Quiz reward for ${session.category}`,
      paymentMethod: 'system',
      paymentReference: `reward_${sessionId}`
    });

    await Promise.all([session.save(), rewardTransaction.save()]);

    return {
      score,
      total: session.totalQuestions,
      reward,
      percentage: (score / session.totalQuestions) * 100
    };
  }
}