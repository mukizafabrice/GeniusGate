// src/services/aiQuestion.service.ts
import { AIQuestion } from '../models/aiQuestion.model';
import { Question, AIQuestionCacheParams, AIResponseMetrics } from '../types/ai.types';
import { logger } from '../utils/logger';

export class AIQuestionService {
  
  async cacheQuestions(
    questions: Question[],
    category: string,
    difficulty: string,
    metrics: AIResponseMetrics,
    aiPrompt: string
  ): Promise<string> {
    try {
      const aiQuestion = new AIQuestion({
        category: category.toLowerCase(),
        difficulty: difficulty.toLowerCase(),
        questions,
        aiModel: metrics.model,
        aiPrompt,
        tokensUsed: metrics.tokensUsed,
        cost: metrics.cost,
        metadata: {
          responseTime: metrics.responseTime,
          questionCount: questions.length
        }
      });

      await aiQuestion.save();
      
      logger.info('AI questions cached successfully', {
        category,
        difficulty,
        questionCount: questions.length,
        cacheKey: aiQuestion.cacheKey
      });

      return aiQuestion.cacheKey;
    } catch (error) {
      logger.error('Failed to cache AI questions:', error);
      throw new Error('Failed to cache questions');
    }
  }

  async getCachedQuestions(
    category: string,
    difficulty: string
  ): Promise<Question[] | null> {
    try {
      const cached = await AIQuestion.findOne({
        category: category.toLowerCase(),
        difficulty: difficulty.toLowerCase(),
        isActive: true
      }).sort({ createdAt: -1 }).exec();

      if (!cached) {
        return null;
      }

      // Try to use model's incrementUsage if available, otherwise update usageCount directly
      if (typeof (AIQuestion as any).incrementUsage === 'function') {
        await (AIQuestion as any).incrementUsage(cached.cacheKey);
      } else {
        await AIQuestion.updateOne(
          { cacheKey: cached.cacheKey },
          { $inc: { usageCount: 1 } }
        ).exec();
      }

      logger.debug('Retrieved cached AI questions', {
        category,
        difficulty,
        cacheKey: cached.cacheKey,
        usageCount: cached.usageCount + 1
      });

      return cached.questions;
    } catch (error) {
      logger.error('Error retrieving cached questions:', error);
      return null;
    }
  }

  async getCacheStats(): Promise<{
    totalCached: number;
    activeCached: number;
    totalUsage: number;
    totalCost: number;
  }> {
    try {
      const stats = await AIQuestion.aggregate([
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
      ]);

      return stats[0] || {
        totalCached: 0,
        activeCached: 0,
        totalUsage: 0,
        totalCost: 0
      };
    } catch (error) {
      logger.error('Error getting cache stats:', error);
      return {
        totalCached: 0,
        activeCached: 0,
        totalUsage: 0,
        totalCost: 0
      };
    }
  }

  async cleanupExpiredCache(): Promise<number> {
    try {
      // Deactivate expired cache entries by updating documents where expiresAt is in the past
      const result = await AIQuestion.updateMany(
        { isActive: true, expiresAt: { $lte: new Date() } },
        { $set: { isActive: false } }
      ).exec();

      const deactivatedCount = (result as any).modifiedCount ?? (result as any).nModified ?? 0;

      logger.info('Cleaned up expired cache entries', {
        deactivatedCount
      });

      return deactivatedCount;
    } catch (error) {
      logger.error('Error cleaning up expired cache:', error);
      return 0;
    }
  }

  async getCacheUsageByCategory(): Promise<Array<{
    category: string;
    usageCount: number;
    questionCount: number;
  }>> {
    try {
      const usage = await AIQuestion.aggregate([
        {
          $group: {
            _id: '$category',
            usageCount: { $sum: '$usageCount' },
            questionCount: { $sum: { $size: '$questions' } }
          }
        },
        {
          $project: {
            category: '$_id',
            usageCount: 1,
            questionCount: 1,
            _id: 0
          }
        },
        {
          $sort: { usageCount: -1 }
        }
      ]);

      return usage;
    } catch (error) {
      logger.error('Error getting cache usage by category:', error);
      return [];
    }
  }

  async invalidateCache(category: string, difficulty?: string): Promise<number> {
    try {
      const filter: any = { 
        category: category.toLowerCase(),
        isActive: true 
      };

      if (difficulty) {
        filter.difficulty = difficulty.toLowerCase();
      }

      const result = await AIQuestion.updateMany(
        filter,
        { $set: { isActive: false } }
      );

      logger.info('Invalidated cache entries', {
        category,
        difficulty,
        invalidatedCount: result.modifiedCount
      });

      return result.modifiedCount;
    } catch (error) {
      logger.error('Error invalidating cache:', error);
      return 0;
    }
  }
}