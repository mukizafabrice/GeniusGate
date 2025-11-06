// config/redis.js
const redis = require("redis");

const client = redis.createClient({
  url: process.env.REDIS_URL,
});

client.on("error", (err) => console.log("Redis Client Error", err));

const cacheService = {
  // Cache AI-generated questions for 1 hour to reduce API calls
  async cacheQuestions(category, difficulty, questions) {
    const key = `questions:${category}:${difficulty}`;
    await client.setEx(key, 3600, JSON.stringify(questions));
  },

  // Cache user sessions and leaderboard
  async cacheLeaderboard() {
    const leaderboard = await User.find()
      .sort({ totalEarnings: -1 })
      .limit(100)
      .select("username totalEarnings rank");

    await client.setEx("leaderboard", 300, JSON.stringify(leaderboard));
  },
};
