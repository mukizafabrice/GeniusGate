// models/GameSession.js
const gameSessionSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    category: { type: String, required: true },
    questions: [
      {
        question: String,
        options: [String],
        correctAnswer: String,
        userAnswer: String,
        isCorrect: Boolean,
        points: Number,
      },
    ],
    totalScore: { type: Number, default: 0 },
    totalPoints: { type: Number, default: 0 },
    timeSpent: Number, // in seconds
    status: {
      type: String,
      enum: ["active", "completed", "abandoned"],
      default: "active",
    },
    paymentId: { type: mongoose.Schema.Types.ObjectId, ref: "Transaction" },
    completedAt: Date,
  },
  { timestamps: true }
);
