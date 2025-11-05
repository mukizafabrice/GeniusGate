// services/rewardService.js
class RewardService {
  async calculateReward(gameSession) {
    const correctAnswers = gameSession.questions.filter(
      (q) => q.isCorrect
    ).length;
    const totalQuestions = gameSession.questions.length;
    const accuracy = correctAnswers / totalQuestions;

    // Base reward calculation
    let baseReward = this.calculateBaseReward(accuracy, totalQuestions);

    // Time bonus (faster completion = higher bonus)
    const timeBonus = this.calculateTimeBonus(
      gameSession.timeSpent,
      totalQuestions
    );

    // Streak bonus
    const streakBonus = await this.calculateStreakBonus(gameSession.userId);

    const totalReward = baseReward + timeBonus + streakBonus;

    // Update user wallet and records
    await this.distributeReward(
      gameSession.userId,
      totalReward,
      gameSession._id
    );

    return totalReward;
  }

  calculateBaseReward(accuracy, totalQuestions) {
    const baseAmount = totalQuestions * 2; // $2 per question base
    return Math.floor(baseAmount * accuracy * 100) / 100; // Convert to monetary value
  }

  calculateTimeBonus(timeSpent, totalQuestions) {
    const avgTimePerQuestion = 30; // 30 seconds per question average
    const expectedTime = totalQuestions * avgTimePerQuestion;

    if (timeSpent < expectedTime) {
      const timeSaved = expectedTime - timeSpent;
      return (timeSaved / 60) * 0.5; // $0.5 per minute saved
    }
    return 0;
  }

  async calculateStreakBonus(userId) {
    // Get recent successful games
    const recentWins = await GameSession.countDocuments({
      userId,
      status: "completed",
      totalScore: { $gte: 0.7 }, // 70% or higher accuracy
      createdAt: { $gte: new Date(Date.now() - 24 * 60 * 60 * 1000) }, // Last 24 hours
    });

    return recentWins * 2; // $2 bonus per consecutive win
  }

  async distributeReward(userId, amount, gameSessionId) {
    const session = await mongoose.startSession();
    session.startTransaction();

    try {
      // Update user wallet
      await User.findByIdAndUpdate(
        userId,
        {
          $inc: {
            walletBalance: amount,
            totalEarnings: amount,
            gamesPlayed: 1,
          },
        },
        { session }
      );

      // Record reward transaction
      await Transaction.create(
        [
          {
            userId,
            type: "reward",
            amount,
            status: "success",
            paymentMethod: "wallet",
            reference: `REWARD_${gameSessionId}`,
            description: `Quiz reward for session ${gameSessionId}`,
          },
        ],
        { session }
      );

      await session.commitTransaction();
    } catch (error) {
      await session.abortTransaction();
      throw error;
    } finally {
      session.endSession();
    }
  }
}
