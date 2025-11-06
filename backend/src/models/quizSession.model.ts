
// src/models/quizSession.model.ts
import { Schema, model } from 'mongoose';
import { IQuizSession } from '../types/quiz.types';

const questionSchema = new Schema({
  question: { type: String, required: true },
  options: [{ type: String, required: true }],
  correctAnswer: { type: String, required: true },
  explanation: { type: String }
});

const quizSessionSchema = new Schema<IQuizSession>(
  {
    user: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    category: { type: String, required: true },
    questions: [questionSchema],
    userAnswers: [{ type: String }],
    score: { type: Number, default: 0 },
    totalQuestions: { type: Number, default: 10 },
    timeStarted: { type: Date, default: Date.now },
    timeCompleted: { type: Date },
    status: { 
      type: String, 
      enum: ['active', 'completed', 'abandoned'], 
      default: 'active' 
    },
    paymentReference: { type: String, required: true },
    rewardEarned: { type: Number, default: 0 },
    difficulty: { 
      type: String, 
      enum: ['easy', 'medium', 'hard'], 
      default: 'medium' 
    }
  },
  { timestamps: true }
);

export const QuizSession = model<IQuizSession>('QuizSession', quizSessionSchema);