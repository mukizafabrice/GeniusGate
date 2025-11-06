import { Request, Response } from 'express';
import { User } from '../models/user.model';
import { QuizSession } from '../models/quizSession.model';
import { Transaction } from '../models/transaction.model';
import { AIQuestion } from '../models/aiQuestion.model';
import { ApiResponse, sendResponse } from '../utils/apiResponse';
import { logger } from '../utils/logger';

// Extend Express Request to include user
interface AuthRequest extends Request {
  user?: any;
}

export class AdminController {
  /**
   * Get dashboard statistics
   */
  async getDashboardStats(req: Request, res: Response) {
    try {
      // Get all statistics in parallel for better performance
      const [
        totalUsers,
        totalAdmins,
        activeUsers,
        totalQuizSessions,
        completedQuizSessions,
        totalTransactions,
        totalRevenue,
        totalRewardsDistributed,
        aiCacheStats
      ] = await Promise.all([
        // User statistics
        User.countDocuments(),
        User.countDocuments({ role: 'admin' }),
        User.countDocuments({ status: 'active' }),
        
        // Quiz statistics
        QuizSession.countDocuments(),
        QuizSession.countDocuments({ status: 'completed' }),
        
        // Transaction statistics
        Transaction.countDocuments(),
        Transaction.aggregate([
          { 
            $match: { 
              type: 'debit', 
              status: 'completed' 
            } 
          },
          { 
            $group: { 
              _id: null, 
              total: { $sum: '$amount' } 
            } 
          }
        ]),
        Transaction.aggregate([
          { 
            $match: { 
              type: 'credit', 
              status: 'completed' 
            } 
          },
          { 
            $group: { 
              _id: null, 
              total: { $sum: '$amount' } 
            } 
          }
        ]),
        
        // AI cache statistics
        AIQuestion.aggregate([
          {
            $group: {
              _id: null,
              totalCached: { $sum: 1 },
              activeCached: {
                $sum: { $cond: [{ $eq: ['$isActive', true] }, 1, 0] }
              },
              totalUsage: { $sum: '$usageCount' },
              totalCost: { $sum: '$cost' }
            }
          }
        ])
      ]);

      const revenue = totalRevenue[0]?.total || 0;
      const rewards = totalRewardsDistributed[0]?.total || 0;
      const cacheStats = aiCacheStats[0] || {
        totalCached: 0,
        activeCached: 0,
        totalUsage: 0,
        totalCost: 0
      };

      const stats = {
        users: {
          total: totalUsers,
          admins: totalAdmins,
          active: activeUsers,
          inactive: totalUsers - activeUsers
        },
        quizzes: {
          total: totalQuizSessions,
          completed: completedQuizSessions,
          active: totalQuizSessions - completedQuizSessions,
          completionRate: totalQuizSessions > 0 
            ? (completedQuizSessions / totalQuizSessions) * 100 
            : 0
        },
        financial: {
          totalTransactions,
          totalRevenue: revenue,
          totalRewardsDistributed: rewards,
          netRevenue: revenue - rewards
        },
        ai: {
          totalCachedQuestions: cacheStats.totalCached,
          activeCachedQuestions: cacheStats.activeCached,
          totalCacheUsage: cacheStats.totalUsage,
          totalAICost: cacheStats.totalCost
        }
      };

      const response = ApiResponse.success('Dashboard stats retrieved successfully', stats);
      sendResponse(res, response);

    } catch (error) {
      logger.error('Get dashboard stats error:', error);
      const response = ApiResponse.error('Failed to retrieve dashboard stats', 500);
      sendResponse(res, response);
    }
  }

  /**
   * Get all users with pagination
   */
  async getUsers(req: Request, res: Response) {
    try {
      const page = parseInt(req.query.page as string) || 1;
      const limit = parseInt(req.query.limit as string) || 10;
      const search = req.query.search as string;
      const status = req.query.status as string;
      const role = req.query.role as string;

      const skip = (page - 1) * limit;

      // Build filter
      const filter: any = {};
      if (search) {
        filter.$or = [
          { name: { $regex: search, $options: 'i' } },
          { email: { $regex: search, $options: 'i' } }
        ];
      }
      if (status) filter.status = status;
      if (role) filter.role = role;

      // Get users with pagination
      const [users, total] = await Promise.all([
        User.find(filter)
          .select('-password')
          .sort({ createdAt: -1 })
          .skip(skip)
          .limit(limit),
        User.countDocuments(filter)
      ]);

      const pagination = {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit)
      };

      const response = ApiResponse.success('Users retrieved successfully', {
        users,
        pagination
      });

      sendResponse(res, response);

    } catch (error) {
      logger.error('Get users error:', error);
      const response = ApiResponse.error('Failed to retrieve users', 500);
      sendResponse(res, response);
    }
  }

  /**
   * Get user by ID
   */
  async getUserById(req: Request, res: Response) {
    try {
      const { id } = req.params;

      const user = await User.findById(id).select('-password');
      if (!user) {
        const response = ApiResponse.error('User not found', 404);
        return sendResponse(res, response);
      }

      // Get user's quiz sessions and transactions
      const [quizSessions, transactions] = await Promise.all([
        QuizSession.find({ user: id }).sort({ createdAt: -1 }).limit(10),
        Transaction.find({ user: id }).sort({ createdAt: -1 }).limit(10)
      ]);

      const userDetails = {
        user,
        recentQuizSessions: quizSessions,
        recentTransactions: transactions
      };

      const response = ApiResponse.success('User details retrieved successfully', userDetails);
      sendResponse(res, response);

    } catch (error) {
      logger.error('Get user by ID error:', error);
      const response = ApiResponse.error('Failed to retrieve user details', 500);
      sendResponse(res, response);
    }
  }

  /**
   * Update user status
   */
  async updateUserStatus(req: Request, res: Response) {
    try {
      const { id } = req.params;
      const { status } = req.body;

      if (!['active', 'suspended', 'inactive'].includes(status)) {
        const response = ApiResponse.error('Invalid status', 400);
        return sendResponse(res, response);
      }

      const user = await User.findByIdAndUpdate(
        id,
        { status },
        { new: true }
      ).select('-password');

      if (!user) {
        const response = ApiResponse.error('User not found', 404);
        return sendResponse(res, response);
      }

      logger.info('User status updated', { 
        adminId: (req as AuthRequest).user._id, 
        userId: id, 
        status 
      });

      const response = ApiResponse.success('User status updated successfully', { user });
      sendResponse(res, response);

    } catch (error) {
      logger.error('Update user status error:', error);
      const response = ApiResponse.error('Failed to update user status', 500);
      sendResponse(res, response);
    }
  }

  /**
   * Get all transactions with pagination
   */
  async getAllTransactions(req: Request, res: Response) {
    try {
      const page = parseInt(req.query.page as string) || 1;
      const limit = parseInt(req.query.limit as string) || 10;
      const type = req.query.type as string;
      const status = req.query.status as string;
      const paymentMethod = req.query.paymentMethod as string;

      const skip = (page - 1) * limit;

      // Build filter
      const filter: any = {};
      if (type) filter.type = type;
      if (status) filter.status = status;
      if (paymentMethod) filter.paymentMethod = paymentMethod;

      // Get transactions with user population
      const [transactions, total] = await Promise.all([
        Transaction.find(filter)
          .populate('user', 'name email')
          .sort({ createdAt: -1 })
          .skip(skip)
          .limit(limit),
        Transaction.countDocuments(filter)
      ]);

      const pagination = {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit)
      };

      const response = ApiResponse.success('Transactions retrieved successfully', {
        transactions,
        pagination
      });

      sendResponse(res, response);

    } catch (error) {
      logger.error('Get transactions error:', error);
      const response = ApiResponse.error('Failed to retrieve transactions', 500);
      sendResponse(res, response);
    }
  }

  /**
   * Get all quiz sessions with pagination
   */
  async getAllQuizSessions(req: Request, res: Response) {
    try {
      const page = parseInt(req.query.page as string) || 1;
      const limit = parseInt(req.query.limit as string) || 10;
      const status = req.query.status as string;
      const category = req.query.category as string;

      const skip = (page - 1) * limit;

      // Build filter
      const filter: any = {};
      if (status) filter.status = status;
      if (category) filter.category = category;

      // Get quiz sessions with user population
      const [quizSessions, total] = await Promise.all([
        QuizSession.find(filter)
          .populate('user', 'name email')
          .sort({ createdAt: -1 })
          .skip(skip)
          .limit(limit),
        QuizSession.countDocuments(filter)
      ]);

      const pagination = {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit)
      };

      const response = ApiResponse.success('Quiz sessions retrieved successfully', {
        quizSessions,
        pagination
      });

      sendResponse(res, response);

    } catch (error) {
      logger.error('Get quiz sessions error:', error);
      const response = ApiResponse.error('Failed to retrieve quiz sessions', 500);
      sendResponse(res, response);
    }
  }

  /**
   * Get AI cache statistics
   */
  async getAICacheStats(req: Request, res: Response) {
    try {
      const [cacheStats, usageByCategory, recentQuestions] = await Promise.all([
        // Overall cache stats
        AIQuestion.aggregate([
          {
            $group: {
              _id: null,
              totalCached: { $sum: 1 },
              activeCached: {
                $sum: { $cond: [{ $eq: ['$isActive', true] }, 1, 0] }
              },
              totalUsage: { $sum: '$usageCount' },
              totalCost: { $sum: '$cost' },
              avgTokens: { $avg: '$tokensUsed' },
              avgCost: { $avg: '$cost' }
            }
          }
        ]),
        // Usage by category
        AIQuestion.aggregate([
          {
            $group: {
              _id: '$category',
              usageCount: { $sum: '$usageCount' },
              questionCount: { $sum: { $size: '$questions' } },
              totalCost: { $sum: '$cost' }
            }
          },
          {
            $project: {
              category: '$_id',
              usageCount: 1,
              questionCount: 1,
              totalCost: 1,
              _id: 0
            }
          },
          {
            $sort: { usageCount: -1 }
          }
        ]),
        // Recent cached questions
        AIQuestion.find({ isActive: true })
          .sort({ lastUsed: -1 })
          .limit(5)
          .select('category difficulty questionCount usageCount lastUsed cost')
      ]);

      const stats = cacheStats[0] || {
        totalCached: 0,
        activeCached: 0,
        totalUsage: 0,
        totalCost: 0,
        avgTokens: 0,
        avgCost: 0
      };

      const responseData = {
        overall: stats,
        usageByCategory,
        recentQuestions
      };

      const response = ApiResponse.success('AI cache stats retrieved successfully', responseData);
      sendResponse(res, response);

    } catch (error) {
      logger.error('Get AI cache stats error:', error);
      const response = ApiResponse.error('Failed to retrieve AI cache stats', 500);
      sendResponse(res, response);
    }
  }

  /**
   * Process manual payout to user
   */
  async processPayout(req: Request, res: Response) {
    try {
      const { userId, amount, description } = req.body;

      if (!userId || !amount || amount <= 0) {
        const response = ApiResponse.error('Invalid user ID or amount', 400);
        return sendResponse(res, response);
      }

      // Find user
      const user = await User.findById(userId);
      if (!user) {
        const response = ApiResponse.error('User not found', 404);
        return sendResponse(res, response);
      }

      // Create credit transaction
      const transaction = new Transaction({
        user: userId,
        amount,
        type: 'credit',
        status: 'completed',
        description: description || 'Manual payout by admin',
        paymentMethod: 'system',
        paymentReference: `payout_${Date.now()}`,
        metadata: {
          processedBy: (req as AuthRequest).user._id,
          processedAt: new Date()
        }
      });

      // Update user wallet balance
      user.walletBalance += amount;

      await Promise.all([transaction.save(), user.save()]);

      logger.info('Manual payout processed', {
        adminId: (req as AuthRequest).user._id,
        userId,
        amount,
        transactionId: transaction._id
      });

      const response = ApiResponse.success('Payout processed successfully', {
        transaction,
        newBalance: user.walletBalance
      });

      sendResponse(res, response);

    } catch (error) {
      logger.error('Process payout error:', error);
      const response = ApiResponse.error('Failed to process payout', 500);
      sendResponse(res, response);
    }
  }
}