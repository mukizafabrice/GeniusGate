// src/services/ai.service.ts
import OpenAI from 'openai';
import { CacheService } from './cache.service';
import { AIQuestionService } from './aiQuestion.service';
import { Question, AIResponseMetrics } from '../types/ai.types';
import { logger } from '../utils/logger';

export class AIService {
  private openai: OpenAI;
  private cache: CacheService;
  private aiQuestionService: AIQuestionService;

  constructor() {
    this.openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY!
    });
    this.cache = new CacheService();
    this.aiQuestionService = new AIQuestionService();
  }

  async generateQuestions(
    category: string, 
    difficulty: string = 'medium', 
    count: number = 10
  ): Promise<Question[]> {
    
    // Try to get from MongoDB cache first
    const cachedQuestions = await this.aiQuestionService.getCachedQuestions(category, difficulty);
    if (cachedQuestions && cachedQuestions.length >= count) {
      logger.info('Using cached questions from MongoDB', { category, difficulty });
      return cachedQuestions.slice(0, count);
    }

    // Try Redis cache as fallback
    const redisCacheKey = `ai_questions:${category}:${difficulty}:${count}`;
    const cached = await this.cache.get(redisCacheKey);
    if (cached) {
      logger.info('Using cached questions from Redis', { category, difficulty });
      return JSON.parse(cached);
    }

    // Generate new questions via AI
    const prompt = this.buildPrompt(category, difficulty, count);
    const startTime = Date.now();
    
    try {
      const completion = await this.openai.chat.completions.create({
        model: "gpt-3.5-turbo",
        messages: [
          {
            role: "system",
            content: "You are a quiz question generator. Always return valid JSON format only."
          },
          {
            role: "user",
            content: prompt
          }
        ],
        temperature: 0.7,
        max_tokens: 2000
      });

      const content = completion.choices[0]?.message?.content;
      if (!content) {
        throw new Error('No response from AI service');
      }

      const questions = this.parseAIResponse(content);
      const responseTime = Date.now() - startTime;

      // Cache metrics
      const metrics: AIResponseMetrics = {
        tokensUsed: completion.usage?.total_tokens || 0,
        responseTime,
        cost: 0,
        model: "gpt-3.5-turbo"
      };

      // Cache in MongoDB for long-term storage
      await this.aiQuestionService.cacheQuestions(questions, category, difficulty, metrics, prompt);

      // Also cache in Redis for fast access
      await this.cache.set(redisCacheKey, JSON.stringify(questions), 3600);
      
      logger.info('Generated new AI questions', {
        category,
        difficulty,
        questionCount: questions.length,
        tokensUsed: metrics.tokensUsed,
        responseTime
      });

      return questions;
    } catch (error) {
      logger.error('AI Service Error:', error);
      throw new Error('Failed to generate questions');
    }
  }

  private buildPrompt(category: string, difficulty: string, count: number): string {
    return `
Generate ${count} multiple-choice ${category} questions at ${difficulty} difficulty level.
Each question should have:
- A clear and concise question
- 4 plausible options (labeled A, B, C, D)
- One correct answer (specify the letter A, B, C, or D)
- A brief explanation

Return ONLY valid JSON in this exact format:
[
  {
    "question": "Question text?",
    "options": ["Option A", "Option B", "Option C", "Option D"],
    "correctAnswer": "A",
    "explanation": "Brief explanation of the correct answer"
  }
]

Ensure questions are diverse, educational, and appropriate for ${difficulty} level.
    `.trim();
  }

  private parseAIResponse(content: string): Question[] {
    try {
      const cleanContent = content.replace(/```json\n?|\n?```/g, '').trim();
      const questions = JSON.parse(cleanContent);
      
      if (!Array.isArray(questions)) {
        throw new Error('AI response is not an array');
      }
      
      return questions.map((q: any) => ({
        question: q.question,
        options: q.options,
        correctAnswer: q.correctAnswer,
        explanation: q.explanation
      }));
    } catch (error) {
      logger.error('AI Response Parsing Error:', error);
      throw new Error('Invalid AI response format');
    }
  }
}