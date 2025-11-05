// models/User.js
const userSchema = new mongoose.Schema({
  username: { type: String, required: true, unique: true },
  email: { type: String, required: true, unique: true },
  password: { type: String, required: true },
  walletBalance: { type: Number, default: 0 },
  totalEarnings: { type: Number, default: 0 },
  gamesPlayed: { type: Number, default: 0 },
  correctAnswers: { type: Number, default: 0 },
  rank: { type: String, default: 'Beginner' },
  isVerified: { type: Boolean, default: false },
  preferences: {
    categories: [String],
    difficulty: { type: String, enum: ['easy', 'medium', 'hard'], default: 'medium' }
  }
}, { timestamps: true });