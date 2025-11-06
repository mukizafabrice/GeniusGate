import { Request, Response } from 'express';
import { QuizSession } from '../models/quizSession.model';
import { Transaction } from '../models/transaction.model';
import { User } from '../models/user.model';
import { ApiResponse, sendResponse } from '../utils/apiResponse';
import { logger } from '../utils/logger';
import { QuizService } from '../services/quiz.service';
import { AIService } from '../services/ai.service';

interface AuthRequest extends Request {
  user?: any;
}

export class QuizController {
  private quizService: QuizService;
  private aiService: AIService;

  constructor() {
    this.quizService = new QuizService();
    this.aiService = new AIService();
  }

  /**
   * Start a new quiz session
   */
  async startQuiz(req: Request, res: Response) {
    try {
      const user = (req as AuthRequest).user;
      const { category, difficulty, paymentReference } = req.body;

      // Validate input
      const validationError = this.validateQuizStartInput(category, difficulty, paymentReference);
      if (validationError) {
        const response = ApiResponse.error(validationError, 400);
        return sendResponse(res, response);
      }

      // Check if user has sufficient balance
      if (user.walletBalance < 1.00) {
        const response = ApiResponse.error('Insufficient wallet balance. Please top up your wallet.', 400);
        return sendResponse(res, response);
      }

      // Start quiz session
      const quizSession = await this.quizService.startQuiz(
        user._id.toString(),
        category,
        paymentReference
      );

      // Deduct quiz fee from wallet
      user.walletBalance -= 1.00;
      await user.save();

      // Record quiz fee transaction
      const feeTransaction = new Transaction({
        user: user._id,
        amount: 1.00,
        type: 'debit',
        status: 'completed',
        description: `Quiz fee for ${category}`,
        paymentMethod: 'system',
        paymentReference: `quiz_fee_${quizSession._id}`
      });
      await feeTransaction.save();

      const responseData = {
        quizSession: {
          id: quizSession._id,
          category: quizSession.category,
          difficulty: quizSession.difficulty,
          totalQuestions: quizSession.totalQuestions,
          timeStarted: quizSession.timeStarted,
          status: quizSession.status,
          questions: quizSession.questions.map(q => ({
            question: q.question,
            options: q.options
            // Removed timeLimit since it doesn't exist in our model
          }))
        }
      };

      const response = ApiResponse.success('Quiz started successfully', responseData);

      logger.info('Quiz started', {
        userId: user._id,
        quizSessionId: quizSession._id,
        category,
        difficulty
      });

      sendResponse(res, response);

    } catch (error: any) {
      logger.error('Start quiz error:', error);
      const response = ApiResponse.error(
        error.message || 'Failed to start quiz', 
        500
      );
      sendResponse(res, response);
    }
  }

  /**
   * Get quiz session details
   */
  async getQuizSession(req: Request, res: Response) {
    try {
      const user = (req as AuthRequest).user;
      const { sessionId } = req.params;

      const quizSession = await QuizSession.findOne({
        _id: sessionId,
        user: user._id
      });

      if (!quizSession) {
        const response = ApiResponse.error('Quiz session not found', 404);
        return sendResponse(res, response);
      }

      // Don't expose correct answers for active sessions
      const sessionData = this.sanitizeQuizSession(quizSession);

      const response = ApiResponse.success('Quiz session retrieved successfully', {
        quizSession: sessionData
      });

      sendResponse(res, response);

    } catch (error: any) {
      logger.error('Get quiz session error:', error);
      const response = ApiResponse.error(
        error.message || 'Failed to retrieve quiz session', 
        500
      );
      sendResponse(res, response);
    }
  }

  /**
   * Submit answer for a question
   */
  async submitAnswer(req: Request, res: Response) {
    try {
      const user = (req as AuthRequest).user;
      const { sessionId, questionIndex, answer } = req.body;

      // Validate input
      const validationError = this.validateAnswerInput(sessionId, questionIndex, answer);
      if (validationError) {
        const response = ApiResponse.error(validationError, 400);
        return sendResponse(res, response);
      }

      // Submit answer
      const result = await this.quizService.submitAnswer(
        sessionId,
        questionIndex,
        answer
      );

      const responseData = {
        isCorrect: result.isCorrect,
        correctAnswer: result.correctAnswer,
        explanation: result.explanation,
        nextQuestionIndex: questionIndex + 1
      };

      const response = ApiResponse.success('Answer submitted successfully', responseData);

      logger.info('Answer submitted', {
        userId: user._id,
        sessionId,
        questionIndex,
        isCorrect: result.isCorrect
      });

      sendResponse(res, response);

    } catch (error: any) {
      logger.error('Submit answer error:', error);
      const response = ApiResponse.error(
        error.message || 'Failed to submit answer', 
        500
      );
      sendResponse(res, response);
    }
  }

  /**
   * Complete quiz and calculate results
   */
  async completeQuiz(req: Request, res: Response) {
    try {
      const user = (req as AuthRequest).user;
      const { sessionId } = req.body;

      if (!sessionId) {
        const response = ApiResponse.error('Session ID is required', 400);
        return sendResponse(res, response);
      }

      // Complete quiz and calculate rewards
      const result = await this.quizService.completeQuiz(sessionId, user._id.toString());

      const responseData = {
        score: result.score,
        totalQuestions: result.total,
        percentage: result.percentage,
        reward: result.reward,
        performance: this.getPerformanceRating(result.percentage)
      };

      const response = ApiResponse.success('Quiz completed successfully', responseData);

      logger.info('Quiz completed', {
        userId: user._id,
        sessionId,
        score: result.score,
        totalQuestions: result.total,
        reward: result.reward
      });

      sendResponse(res, response);

    } catch (error: any) {
      logger.error('Complete quiz error:', error);
      const response = ApiResponse.error(
        error.message || 'Failed to complete quiz', 
        500
      );
      sendResponse(res, response);
    }
  }

  /**
   * Get user's quiz history
   */
  async getQuizHistory(req: Request, res: Response) {
    try {
      const user = (req as AuthRequest).user;
      const page = parseInt(req.query.page as string) || 1;
      const limit = parseInt(req.query.limit as string) || 10;
      const category = req.query.category as string;
      const status = req.query.status as string;

      const skip = (page - 1) * limit;

      // Build filter
      const filter: any = { user: user._id };
      if (category) filter.category = category;
      if (status) filter.status = status;

      // Get quiz sessions with pagination
      const [quizSessions, total] = await Promise.all([
        QuizSession.find(filter)
          .sort({ createdAt: -1 })
          .skip(skip)
          .limit(limit)
          .select('-questions'), // Exclude questions for list view
        QuizSession.countDocuments(filter)
      ]);

      // Calculate statistics
      const stats = await this.calculateQuizStats(user._id);

      const pagination = {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit)
      };

      const response = ApiResponse.success('Quiz history retrieved successfully', {
        quizSessions,
        pagination,
        stats
      });

      sendResponse(res, response);

    } catch (error: any) {
      logger.error('Get quiz history error:', error);
      const response = ApiResponse.error(
        error.message || 'Failed to retrieve quiz history', 
        500
      );
      sendResponse(res, response);
    }
  }

  /**
   * Get available quiz categories
   */
  async getCategories(req: Request, res: Response) {
    try {
      const categories = [
        { value: 'science', label: 'Science', description: 'Test your scientific knowledge' },
        { value: 'technology', label: 'Technology', description: 'Latest in tech and innovation' },
        { value: 'history', label: 'History', description: 'Historical events and figures' },
        { value: 'geography', label: 'Geography', description: 'World geography and cultures' },
        { value: 'sports', label: 'Sports', description: 'Sports trivia and records' },
        { value: 'entertainment', label: 'Entertainment', description: 'Movies, music, and pop culture' },
        { value: 'politics', label: 'Politics', description: 'Political systems and events' },
        { value: 'art', label: 'Art', description: 'Art history and famous works' },
        { value: 'literature', label: 'Literature', description: 'Books, authors, and literary works' },
        { value: 'mathematics', label: 'Mathematics', description: 'Math problems and concepts' },
        { value: 'biology', label: 'Biology', description: 'Life sciences and organisms' },
        { value: 'physics', label: 'Physics', description: 'Physical laws and principles' },
        { value: 'chemistry', label: 'Chemistry', description: 'Chemical elements and reactions' },
        { value: 'general-knowledge', label: 'General Knowledge', description: 'Mixed topics and trivia' },
        { value: 'programming', label: 'Programming', description: 'Coding and software development' }
      ];

      const response = ApiResponse.success('Categories retrieved successfully', { categories });
      sendResponse(res, response);

    } catch (error: any) {
      logger.error('Get categories error:', error);
      const response = ApiResponse.error(
        error.message || 'Failed to retrieve categories', 
        500
      );
      sendResponse(res, response);
    }
  }

  /**
   * Get quiz leaderboard
   */
  async getLeaderboard(req: Request, res: Response) {
    try {
      const limit = parseInt(req.query.limit as string) || 20;
      const timeframe = (req.query.timeframe as string) || 'all-time'; // all-time, weekly, monthly

      // Calculate date range based on timeframe
      let dateFilter = {};
      if (timeframe === 'weekly') {
        const oneWeekAgo = new Date();
        oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);
        dateFilter = { createdAt: { $gte: oneWeekAgo } };
      } else if (timeframe === 'monthly') {
        const oneMonthAgo = new Date();
        oneMonthAgo.setMonth(oneMonthAgo.getMonth() - 1);
        dateFilter = { createdAt: { $gte: oneMonthAgo } };
      }

      // Get top performers based on total rewards
      const leaderboard = await QuizSession.aggregate([
        { $match: { ...dateFilter, status: 'completed' } },
        {
          $group: {
            _id: '$user',
            totalRewards: { $sum: '$rewardEarned' },
            totalQuizzes: { $sum: 1 },
            averageScore: { $avg: { $multiply: [{ $divide: ['$score', '$totalQuestions'] }, 100] } },
            lastPlayed: { $max: '$createdAt' }
          }
        },
        { $sort: { totalRewards: -1 } },
        { $limit: limit },
        {
          $lookup: {
            from: 'users',
            localField: '_id',
            foreignField: '_id',
            as: 'user'
          }
        },
        { $unwind: '$user' },
        {
          $project: {
            userId: '$_id',
            name: '$user.name',
            totalRewards: 1,
            totalQuizzes: 1,
            averageScore: { $round: ['$averageScore', 2] },
            lastPlayed: 1
          }
        }
      ]);

      const response = ApiResponse.success('Leaderboard retrieved successfully', {
        leaderboard,
        timeframe
      });

      sendResponse(res, response);

    } catch (error: any) {
      logger.error('Get leaderboard error:', error);
      const response = ApiResponse.error(
        error.message || 'Failed to retrieve leaderboard', 
        500
      );
      sendResponse(res, response);
    }
  }

  /**
   * Validate quiz start input
   */
  private validateQuizStartInput(category: string, difficulty: string, paymentReference: string): string | null {
    const validCategories = [
      'science', 'technology', 'history', 'geography', 'sports', 
      'entertainment', 'politics', 'art', 'literature', 'mathematics',
      'biology', 'physics', 'chemistry', 'general-knowledge', 'programming'
    ];

    const validDifficulties = ['easy', 'medium', 'hard'];

    if (!category || !validCategories.includes(category)) {
      return 'Invalid quiz category';
    }

    if (!difficulty || !validDifficulties.includes(difficulty)) {
      return 'Invalid difficulty level';
    }

    if (!paymentReference) {
      return 'Payment reference is required';
    }

    return null;
  }

  /**
   * Validate answer input
   */
  private validateAnswerInput(sessionId: string, questionIndex: number, answer: string): string | null {
    if (!sessionId) {
      return 'Session ID is required';
    }

    if (questionIndex === undefined || questionIndex < 0) {
      return 'Invalid question index';
    }

    if (!answer || !['A', 'B', 'C', 'D'].includes(answer.toUpperCase())) {
      return 'Answer must be A, B, C, or D';
    }

    return null;
  }

  /**
   * Sanitize quiz session data (hide correct answers for active sessions)
   */
  private sanitizeQuizSession(quizSession: any): any {
    const sanitized = {
      id: quizSession._id,
      category: quizSession.category,
      difficulty: quizSession.difficulty,
      totalQuestions: quizSession.totalQuestions,
      currentQuestion: quizSession.userAnswers.length,
      score: quizSession.score,
      status: quizSession.status,
      timeStarted: quizSession.timeStarted,
      timeCompleted: quizSession.timeCompleted,
      rewardEarned: quizSession.rewardEarned,
      questions: quizSession.questions.map((q: any, index: number) => ({
        question: q.question,
        options: q.options,
        userAnswer: quizSession.userAnswers[index],
        isAnswered: index < quizSession.userAnswers.length
      }))
    };

    // Only include correct answers for completed sessions
    if (quizSession.status === 'completed') {
      sanitized.questions = quizSession.questions.map((q: any, index: number) => ({
        ...sanitized.questions[index],
        correctAnswer: q.correctAnswer,
        explanation: q.explanation,
        isCorrect: quizSession.userAnswers[index] === q.correctAnswer
      }));
    }

    return sanitized;
  }

  /**
   * Calculate user quiz statistics
   */
  private async calculateQuizStats(userId: any): Promise<any> {
    const stats = await QuizSession.aggregate([
      { $match: { user: userId, status: 'completed' } },
      {
        $group: {
          _id: null,
          totalQuizzes: { $sum: 1 },
          totalRewards: { $sum: '$rewardEarned' },
          totalCorrect: { $sum: '$score' },
          totalQuestions: { $sum: '$totalQuestions' },
          averageScore: { $avg: { $multiply: [{ $divide: ['$score', '$totalQuestions'] }, 100] } },
          bestScore: { $max: { $multiply: [{ $divide: ['$score', '$totalQuestions'] }, 100] } }
        }
      }
    ]);

    if (stats.length === 0) {
      return {
        totalQuizzes: 0,
        totalRewards: 0,
        totalCorrect: 0,
        totalQuestions: 0,
        averageScore: 0,
        bestScore: 0,
        accuracy: 0
      };
    }

    const stat = stats[0];
    return {
      totalQuizzes: stat.totalQuizzes,
      totalRewards: stat.totalRewards,
      totalCorrect: stat.totalCorrect,
      totalQuestions: stat.totalQuestions,
      averageScore: Math.round(stat.averageScore),
      bestScore: Math.round(stat.bestScore),
      accuracy: stat.totalQuestions > 0 ? Math.round((stat.totalCorrect / stat.totalQuestions) * 100) : 0
    };
  }

  /**
   * Get performance rating based on percentage
   */
  private getPerformanceRating(percentage: number): string {
    if (percentage >= 90) return 'Excellent';
    if (percentage >= 80) return 'Great';
    if (percentage >= 70) return 'Good';
    if (percentage >= 60) return 'Average';
    return 'Needs Improvement';
  }
}