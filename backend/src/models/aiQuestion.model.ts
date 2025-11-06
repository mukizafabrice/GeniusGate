import { Schema, model } from 'mongoose';

// Question interface for individual questions
interface IQuestion {
  question: string;
  options: string[];
  correctAnswer: string;
  explanation?: string;
  topic?: string;
  timeLimit?: number;
}

// Main AI Question interface
interface IAIQuestion {
  category: string;
  difficulty: 'easy' | 'medium' | 'hard';
  questions: IQuestion[];
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

// Sub-schema for individual questions
const questionSchema = new Schema<IQuestion>({
  question: { 
    type: String, 
    required: true,
    trim: true,
    minlength: 10,
    maxlength: 500
  },
  options: {
    type: [String],
    required: true,
    validate: {
      validator: function(options: string[]) {
        return options.length === 4 && options.every(opt => opt.length > 0);
      },
      message: 'Each question must have exactly 4 non-empty options'
    }
  },
  correctAnswer: {
    type: String,
    required: true,
    enum: ['A', 'B', 'C', 'D'],
    uppercase: true,
    trim: true
  },
  explanation: {
    type: String,
    required: false,
    maxlength: 1000
  },
  topic: {
    type: String,
    required: false,
    trim: true
  },
  timeLimit: {
    type: Number,
    default: 30,
    min: 10,
    max: 120
  }
}, { _id: false });

// Main AI Question schema
const aiQuestionSchema = new Schema<IAIQuestion>({
  category: {
    type: String,
    required: true,
    trim: true,
    index: true,
    enum: [
      'science', 'technology', 'history', 'geography', 
      'sports', 'entertainment', 'politics', 'art',
      'literature', 'mathematics', 'biology', 'physics',
      'chemistry', 'general-knowledge', 'programming'
    ]
  },
  difficulty: {
    type: String,
    required: true,
    enum: ['easy', 'medium', 'hard'],
    default: 'medium',
    index: true
  },
  questions: {
    type: [questionSchema],
    required: true,
    validate: {
      validator: function(questions: IQuestion[]) {
        return questions.length > 0 && questions.length <= 20;
      },
      message: 'Question set must contain between 1 and 20 questions'
    }
  },
  aiModel: {
    type: String,
    required: true,
    default: 'gpt-3.5-turbo',
    enum: ['gpt-3.5-turbo', 'gpt-4', 'gpt-4-turbo']
  },
  aiPrompt: {
    type: String,
    required: true,
    maxlength: 5000
  },
  tokensUsed: {
    type: Number,
    required: true,
    min: 0,
    default: 0
  },
  cost: {
    type: Number,
    required: true,
    min: 0,
    default: 0
  },
  cacheKey: {
    type: String,
    required: true,
    unique: true,
    index: true
  },
  isActive: {
    type: Boolean,
    default: true,
    index: true
  },
  usageCount: {
    type: Number,
    default: 0,
    min: 0
  },
  lastUsed: {
    type: Date,
    default: Date.now
  },
  expiresAt: {
    type: Date,
    required: true,
    index: true,
    expires: 0 // MongoDB TTL index
  },
  metadata: {
    type: Schema.Types.Mixed,
    default: {}
  }
}, {
  timestamps: true
});

// Virtual for question count
aiQuestionSchema.virtual('questionCount').get(function() {
  return this.questions.length;
});

// Index for efficient querying
aiQuestionSchema.index({ 
  category: 1, 
  difficulty: 1, 
  isActive: 1, 
  expiresAt: 1 
});

aiQuestionSchema.index({ cacheKey: 1 });
aiQuestionSchema.index({ createdAt: -1 });

// Static method to find active cached questions
aiQuestionSchema.statics.findActiveByCategoryAndDifficulty = function(
  category: string, 
  difficulty: string
) {
  return this.findOne({
    category: category.toLowerCase(),
    difficulty: difficulty.toLowerCase(),
    isActive: true,
    expiresAt: { $gt: new Date() }
  }).sort({ createdAt: -1 });
};

// Static method to increment usage count
aiQuestionSchema.statics.incrementUsage = function(cacheKey: string) {
  return this.findOneAndUpdate(
    { cacheKey },
    { 
      $inc: { usageCount: 1 },
      $set: { lastUsed: new Date() }
    },
    { new: true }
  );
};

// Static method to deactivate expired questions
aiQuestionSchema.statics.deactivateExpired = function() {
  return this.updateMany(
    { 
      expiresAt: { $lte: new Date() },
      isActive: true 
    },
    { 
      $set: { isActive: false } 
    }
  );
};

// Instance method to check if cache is fresh
aiQuestionSchema.methods.isFresh = function(hours: number = 1): boolean {
  const ageInHours = (Date.now() - this.createdAt.getTime()) / (1000 * 60 * 60);
  return ageInHours < hours;
};

// Pre-save middleware to generate cache key
aiQuestionSchema.pre('save', function(next) {
  if (this.isModified('category') || this.isModified('difficulty') || this.isNew) {
    const timestamp = Math.floor(Date.now() / (1000 * 60 * 60));
    this.cacheKey = `ai_questions:${this.category}:${this.difficulty}:${timestamp}`;
  }
  
  // Set expiration (24 hours from creation)
  if (this.isNew) {
    const expiresAt = new Date();
    expiresAt.setHours(expiresAt.getHours() + 24);
    this.expiresAt = expiresAt;
  }
  
  next();
});

// Pre-save middleware to calculate cost based on tokens
aiQuestionSchema.pre('save', function(next) {
  if (this.isModified('tokensUsed')) {
    const costPerToken = this.aiModel.includes('gpt-4') ? 0.00003 : 0.000002;
    this.cost = this.tokensUsed * costPerToken;
  }
  next();
});

export const AIQuestion = model<IAIQuestion>('AIQuestion', aiQuestionSchema);