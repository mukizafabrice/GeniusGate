import { config as dotenvConfig } from 'dotenv';

dotenvConfig();

export const config = {
  port: process.env.PORT || 5000,
  mongoUri: process.env.MONGO_URI!,
  jwtSecret: process.env.JWT_SECRET!,
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '7d',
  openaiApiKey: process.env.OPENAI_API_KEY!,
  paymentPublicKey: process.env.FLW_PUBLIC_KEY!,
  paymentSecretKey: process.env.FLW_SECRET_KEY!,
  redisUrl: process.env.REDIS_URL || 'redis://localhost:6379',
  nodeEnv: process.env.NODE_ENV || 'development',
  
  rateLimit: {
    windowMs: 15 * 60 * 1000,
    max: 100
  },

  corsOrigins: process.env.CORS_ORIGINS?.split(',') || ['http://localhost:3000']
};

// Validate required environment variables
const requiredEnvVars = ['MONGO_URI', 'JWT_SECRET', 'OPENAI_API_KEY'];
requiredEnvVars.forEach(envVar => {
  if (!process.env[envVar]) {
    throw new Error(`Environment variable ${envVar} is required`);
  }
});