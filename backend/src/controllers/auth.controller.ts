import { Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import { User } from '../models/user.model';
import { ApiResponse, sendResponse } from '../utils/apiResponse';
import { logger } from '../utils/logger';
import { config } from '../config/environment';

// Extend Express Request to include user
interface AuthRequest extends Request {
  user?: any;
}

export class AuthController {
  /**
   * Register a new user
   */
  async register(req: Request, res: Response) {
    try {
      const { name, email, password } = req.body;

      // Check if user already exists
      const existingUser = await User.findOne({ email });
      if (existingUser) {
        const response = ApiResponse.error('User already exists with this email', 400);
        return sendResponse(res, response);
      }

      // Create new user
      const user = new User({
        name,
        email,
        password,
        walletBalance: 0,
        status: 'active'
      });

      await user.save();

      // Generate JWT token
      const token = this.generateToken(user._id.toString());

      const userResponse = {
        id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
        walletBalance: user.walletBalance,
        status: user.status
      };

      const response = ApiResponse.success('User registered successfully', {
        user: userResponse,
        token
      }, 201);

      logger.info('New user registered', { email: user.email, userId: user._id });
      sendResponse(res, response);

    } catch (error) {
      logger.error('Registration error:', error);
      const response = ApiResponse.error('Registration failed', 500);
      sendResponse(res, response);
    }
  }

  /**
   * Login user
   */
  async login(req: Request, res: Response) {
    try {
      const { email, password } = req.body;

      // Find user by email
      const user = await User.findOne({ email });
      if (!user) {
        const response = ApiResponse.error('Invalid email or password', 401);
        return sendResponse(res, response);
      }

      // Check if user is active
      if (user.status !== 'active') {
        const response = ApiResponse.error('Account is not active', 401);
        return sendResponse(res, response);
      }

      // Check password
      const isPasswordValid = await user.comparePassword(password);
      if (!isPasswordValid) {
        const response = ApiResponse.error('Invalid email or password', 401);
        return sendResponse(res, response);
      }

      // Generate JWT token
      const token = this.generateToken(user._id.toString());

      const userResponse = {
        id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
        walletBalance: user.walletBalance,
        status: user.status
      };

      const response = ApiResponse.success('Login successful', {
        user: userResponse,
        token
      });

      logger.info('User logged in', { email: user.email, userId: user._id });
      sendResponse(res, response);

    } catch (error) {
      logger.error('Login error:', error);
      const response = ApiResponse.error('Login failed', 500);
      sendResponse(res, response);
    }
  }

  /**
   * Refresh token
   */
  async refreshToken(req: Request, res: Response) {
    try {
      const authHeader = req.header('Authorization');
      const token = authHeader?.replace('Bearer ', '');

      if (!token) {
        const response = ApiResponse.error('No token provided', 401);
        return sendResponse(res, response);
      }

      // Verify the token
      const decoded = jwt.verify(token, config.jwtSecret) as any;
      
      // Find user
      const user = await User.findById(decoded.id);
      if (!user || user.status !== 'active') {
        const response = ApiResponse.error('Invalid token', 401);
        return sendResponse(res, response);
      }

      // Generate new token
      const newToken = this.generateToken(user._id.toString());

      const response = ApiResponse.success('Token refreshed successfully', {
        token: newToken
      });

      sendResponse(res, response);

    } catch (error) {
      logger.error('Token refresh error:', error);
      const response = ApiResponse.error('Invalid token', 401);
      sendResponse(res, response);
    }
  }

  /**
   * Logout user (client-side token removal)
   */
  async logout(req: Request, res: Response) {
    try {
      const response = ApiResponse.success('Logout successful');
      
      logger.info('User logged out', { userId: (req as AuthRequest).user?._id });
      sendResponse(res, response);

    } catch (error) {
      logger.error('Logout error:', error);
      const response = ApiResponse.error('Logout failed', 500);
      sendResponse(res, response);
    }
  }

  /**
   * Get current user profile
   */
  async getProfile(req: Request, res: Response) {
    try {
      const user = (req as AuthRequest).user;

      const userResponse = {
        id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
        walletBalance: user.walletBalance,
        status: user.status,
        createdAt: user.createdAt,
        updatedAt: user.updatedAt
      };

      const response = ApiResponse.success('Profile retrieved successfully', {
        user: userResponse
      });

      sendResponse(res, response);

    } catch (error) {
      logger.error('Get profile error:', error);
      const response = ApiResponse.error('Failed to get profile', 500);
      sendResponse(res, response);
    }
  }

  /**
   * Update user profile
   */
  async updateProfile(req: Request, res: Response) {
    try {
      const user = (req as AuthRequest).user;
      const { name } = req.body;

      // Only allow updating name for now
      if (name) {
        user.name = name;
        await user.save();
      }

      const userResponse = {
        id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
        walletBalance: user.walletBalance,
        status: user.status
      };

      const response = ApiResponse.success('Profile updated successfully', {
        user: userResponse
      });

      logger.info('User profile updated', { userId: user._id });
      sendResponse(res, response);

    } catch (error) {
      logger.error('Update profile error:', error);
      const response = ApiResponse.error('Failed to update profile', 500);
      sendResponse(res, response);
    }
  }

  /**
   * Change password
   */
  async changePassword(req: Request, res: Response) {
    try {
      const user = (req as AuthRequest).user;
      const { currentPassword, newPassword } = req.body;

      // Verify current password
      const isCurrentPasswordValid = await user.comparePassword(currentPassword);
      if (!isCurrentPasswordValid) {
        const response = ApiResponse.error('Current password is incorrect', 400);
        return sendResponse(res, response);
      }

      // Update password
      user.password = newPassword;
      await user.save();

      const response = ApiResponse.success('Password changed successfully');

      logger.info('User password changed', { userId: user._id });
      sendResponse(res, response);

    } catch (error) {
      logger.error('Change password error:', error);
      const response = ApiResponse.error('Failed to change password', 500);
      sendResponse(res, response);
    }
  }

 /**
   * Generate JWT token - FIXED VERSION
   */
 /**
 * Generate JWT token - SIMPLE FIX
 */
private generateToken(userId: string): string {
  const payload = { id: userId };
  // cast through unknown to satisfy the SignOptions union type (e.g. "1h" strings)
  const options: jwt.SignOptions = { 
    expiresIn: config.jwtExpiresIn as unknown as jwt.SignOptions['expiresIn']
  };
  
  return jwt.sign(payload, config.jwtSecret, options);
}
}