// src/types/quiz.types.ts
import { Types } from 'mongoose';

export interface Question {
  question: string;
  options: string[];
  correctAnswer: string;
  explanation?: string;
}

export interface IQuizSession {
  _id: string;
  user: Types.ObjectId;
  category: string;
  questions: Question[];
  userAnswers: string[];
  score: number;
  totalQuestions: number;
  timeStarted: Date;
  timeCompleted?: Date;
  status: 'active' | 'completed' | 'abandoned';
  paymentReference: string;
  rewardEarned: number;
  difficulty: 'easy' | 'medium' | 'hard';
}
