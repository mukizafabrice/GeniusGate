// src/types/ai.types.ts
import { Document, Schema } from 'mongoose';

export interface IAIQuestion extends Document {
  category: string;
  difficulty: 'easy' | 'medium' | 'hard';
  questions: Question[];
  aiModel: string;
  aiPrompt: string;
  tokensUsed: number;
  cost: number;
  cacheKey: string;
  isActive: boolean;
  usageCount: number;
  lastUsed: Date;
  expiresAt: Date;
  metadata: Record<string, any>;
  createdAt: Date;
  updatedAt: Date;
}

export interface Question {
  question: string;
  options: string[];
  correctAnswer: string;
  explanation?: string;
  topic?: string;
  timeLimit?: number;
}

export interface AIQuestionCacheParams {
  category: string;
  difficulty: string;
  count: number;
}

export interface AIResponseMetrics {
  tokensUsed: number;
  responseTime: number;
  cost: number;
  model: string;
}