import rateLimit from 'express-rate-limit';
import { Request, Response, NextFunction } from 'express';
import { config } from '../config/environment';
import { logger } from '../utils/logger';

/**
 * General rate limit for all routes
 */
export const rateLimitMiddleware = rateLimit({
  windowMs: config.rateLimit.windowMs, // 15 minutes
  max: config.rateLimit.max, // Limit each IP to 100 requests per windowMs
  message: {
    success: false,
    message: 'Too many requests from this IP, please try again later.'
  },
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req: Request, res: Response, next: NextFunction, options: any) => {
    logger.warn('Rate limit exceeded', {
      ip: req.ip,
      url: req.url,
      method: req.method,
      userAgent: req.get('user-agent')
    });
    
    res.status(options.statusCode).json(options.message);
  },
  skip: (req: Request) => {
    // Skip rate limiting for health checks and certain paths
    const skipPaths = ['/health', '/api/payment/webhook'];
    return skipPaths.some(path => req.path === path);
  }
});

/**
 * Strict rate limit for authentication endpoints
 */
export const authRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5, // Limit each IP to 5 login attempts per windowMs
  message: {
    success: false,
    message: 'Too many authentication attempts, please try again later.'
  },
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req: Request, res: Response, next: NextFunction, options: any) => {
    logger.warn('Auth rate limit exceeded', {
      ip: req.ip,
      url: req.url,
      method: req.method,
      email: req.body.email
    });
    
    res.status(options.statusCode).json(options.message);
  },
  skip: (req: Request) => {
    // Only apply to auth endpoints
    return !req.path.includes('/auth/');
  }
});

/**
 * Rate limit for AI question generation (costly operation)
 */
export const aiRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 20, // Limit each IP to 20 AI requests per windowMs
  message: {
    success: false,
    message: 'Too many AI requests, please try again later.'
  },
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req: Request, res: Response, next: NextFunction, options: any) => {
    logger.warn('AI rate limit exceeded', {
      ip: req.ip,
      url: req.url,
      method: req.method,
      userAgent: req.get('user-agent')
    });
    
    res.status(options.statusCode).json(options.message);
  },
  skip: (req: Request) => {
    // Only apply to quiz start endpoints (AI question generation)
    return !req.path.includes('/quiz/start');
  }
});

/**
 * Rate limit for payment endpoints (fraud prevention)
 */
export const paymentRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10, // Limit each IP to 10 payment requests per windowMs
  message: {
    success: false,
    message: 'Too many payment requests, please try again later.'
  },
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req: Request, res: Response, next: NextFunction, options: any) => {
    logger.warn('Payment rate limit exceeded', {
      ip: req.ip,
      url: req.url,
      method: req.method,
      userAgent: req.get('user-agent')
    });
    
    res.status(options.statusCode).json(options.message);
  },
  skip: (req: Request) => {
    // Only apply to payment initialization endpoints
    return !req.path.includes('/payment/initialize');
  }
});

/**
 * Rate limit for admin endpoints (security)
 */
export const adminRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 50, // Limit each IP to 50 admin requests per windowMs
  message: {
    success: false,
    message: 'Too many admin requests, please try again later.'
  },
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req: Request, res: Response, next: NextFunction, options: any) => {
    logger.warn('Admin rate limit exceeded', {
      ip: req.ip,
      url: req.url,
      method: req.method,
      userAgent: req.get('user-agent')
    });
    
    res.status(options.statusCode).json(options.message);
  },
  skip: (req: Request) => {
    // Only apply to admin endpoints
    return !req.path.startsWith('/api/admin');
  }
});

/**
 * Rate limit for quiz submission (prevent spam)
 */
export const quizSubmissionRateLimit = rateLimit({
  windowMs: 1 * 60 * 1000, // 1 minute
  max: 30, // Limit each IP to 30 quiz submissions per minute
  message: {
    success: false,
    message: 'Too many quiz submissions, please slow down.'
  },
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req: Request, res: Response, next: NextFunction, options: any) => {
    logger.warn('Quiz submission rate limit exceeded', {
      ip: req.ip,
      url: req.url,
      method: req.method
    });
    
    res.status(options.statusCode).json(options.message);
  },
  skip: (req: Request) => {
    // Only apply to quiz answer submission
    return !req.path.includes('/quiz/submit-answer');
  }
});

/**
 * Development mode rate limit (more lenient)
 */
export const developmentRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 1000, // Very high limit for development
  message: {
    success: false,
    message: 'Development rate limit exceeded.'
  },
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req: Request) => {
    // Only apply in development mode
    return config.nodeEnv !== 'development';
  }
});