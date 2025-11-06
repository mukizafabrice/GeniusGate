import { Request, Response } from 'express';
import { Transaction } from '../models/transaction.model';
import { User } from '../models/user.model';
import { ApiResponse, sendResponse } from '../utils/apiResponse';
import { logger } from '../utils/logger';
import { PaymentService } from '../services/payment.service';

// Extend Express Request to include user
interface AuthRequest extends Request {
  user?: any;
}

export class PaymentController {
  private paymentService: PaymentService;

  constructor() {
    this.paymentService = new PaymentService();
  }

  /**
   * Initialize payment for quiz play
   */
  async initializePayment(req: Request, res: Response) {
    try {
      const user = (req as AuthRequest).user;
      const { amount, paymentMethod, quizCategory } = req.body;

      // Validate payment method
      const validPaymentMethods = ['flutterwave', 'stripe', 'momo'];
      if (!validPaymentMethods.includes(paymentMethod)) {
        const response = ApiResponse.error('Invalid payment method', 400);
        return sendResponse(res, response);
      }

      // Validate amount (minimum quiz price)
      if (!amount || amount < 1.00) {
        const response = ApiResponse.error('Minimum payment amount is $1.00', 400);
        return sendResponse(res, response);
      }

      // Initialize payment with payment service
      const paymentResult = await this.paymentService.initializePayment({
        userId: user._id.toString(),
        email: user.email,
        amount,
        paymentMethod,
        metadata: {
          quizCategory,
          purpose: 'quiz_payment'
        }
      });

      // Create pending transaction record
      const transaction = new Transaction({
        user: user._id,
        amount,
        type: 'debit',
        status: 'pending',
        description: `Quiz payment for ${quizCategory}`,
        paymentMethod,
        paymentReference: paymentResult.paymentReference,
        metadata: {
          quizCategory,
          gatewayResponse: paymentResult.gatewayData
        }
      });

      await transaction.save();

      const responseData = {
        paymentReference: paymentResult.paymentReference,
        paymentUrl: paymentResult.paymentUrl,
        gatewayData: paymentResult.gatewayData,
        transactionId: transaction._id
      };

      const response = ApiResponse.success('Payment initialized successfully', responseData);

      logger.info('Payment initialized', {
        userId: user._id,
        amount,
        paymentMethod,
        paymentReference: paymentResult.paymentReference
      });

      sendResponse(res, response);

    } catch (error) {
      logger.error('Initialize payment error:', error);
      const response = ApiResponse.error('Failed to initialize payment', 500);
      sendResponse(res, response);
    }
  }

  /**
   * Verify payment status
   */
  async verifyPayment(req: Request, res: Response) {
    try {
      const user = (req as AuthRequest).user;
      const { reference } = req.params;

      if (!reference) {
        const response = ApiResponse.error('Payment reference is required', 400);
        return sendResponse(res, response);
      }

      // Find transaction
      const transaction = await Transaction.findOne({
        paymentReference: reference,
        user: user._id
      });

      if (!transaction) {
        const response = ApiResponse.error('Transaction not found', 404);
        return sendResponse(res, response);
      }

      // If already completed, return current status
      if (transaction.status === 'completed') {
        const response = ApiResponse.success('Payment already verified', {
          transaction,
          status: 'completed'
        });
        return sendResponse(res, response);
      }

      // Verify payment with payment gateway
      const verificationResult = await this.paymentService.verifyPayment(
        reference,
        transaction.paymentMethod
      );

      // Update transaction status based on verification
      if (verificationResult.success) {
        transaction.status = 'completed';
        transaction.metadata = {
          ...transaction.metadata,
          verificationData: verificationResult.data,
          verifiedAt: new Date()
        };

        // Update user wallet balance for quiz payment
        if (transaction.type === 'debit') {
          const user = await User.findById(transaction.user);
          if (user) {
            user.walletBalance += transaction.amount; // Add funds to wallet
            await user.save();

            logger.info('User wallet funded', {
              userId: user._id,
              amount: transaction.amount,
              newBalance: user.walletBalance
            });
          }
        }

        await transaction.save();

        const response = ApiResponse.success('Payment verified successfully', {
          transaction,
          status: 'completed',
          walletBalance: user.walletBalance
        });

        logger.info('Payment verified successfully', {
          userId: user._id,
          reference,
          amount: transaction.amount
        });

        sendResponse(res, response);

      } else {
        // Payment failed
        transaction.status = 'failed';
        transaction.metadata = {
          ...transaction.metadata,
          verificationError: verificationResult.error,
          verifiedAt: new Date()
        };

        await transaction.save();

        const response = ApiResponse.error('Payment verification failed', 400, {
          transaction,
          status: 'failed',
          error: verificationResult.error
        });

        logger.warn('Payment verification failed', {
          userId: user._id,
          reference,
          error: verificationResult.error
        });

        sendResponse(res, response);
      }

    } catch (error) {
      logger.error('Verify payment error:', error);
      const response = ApiResponse.error('Failed to verify payment', 500);
      sendResponse(res, response);
    }
  }

  /**
   * Get user's transaction history
   */
  async getTransactions(req: Request, res: Response) {
    try {
      const user = (req as AuthRequest).user;
      const page = parseInt(req.query.page as string) || 1;
      const limit = parseInt(req.query.limit as string) || 10;
      const type = req.query.type as string;
      const status = req.query.status as string;

      const skip = (page - 1) * limit;

      // Build filter
      const filter: any = { user: user._id };
      if (type) filter.type = type;
      if (status) filter.status = status;

      // Get transactions with pagination
      const [transactions, total] = await Promise.all([
        Transaction.find(filter)
          .sort({ createdAt: -1 })
          .skip(skip)
          .limit(limit),
        Transaction.countDocuments(filter)
      ]);

      const pagination = {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit)
      };

      const response = ApiResponse.success('Transactions retrieved successfully', {
        transactions,
        pagination
      });

      sendResponse(res, response);

    } catch (error) {
      logger.error('Get transactions error:', error);
      const response = ApiResponse.error('Failed to retrieve transactions', 500);
      sendResponse(res, response);
    }
  }

  /**
   * Get wallet balance
   */
  async getWalletBalance(req: Request, res: Response) {
    try {
      const user = (req as AuthRequest).user;

      // Get recent transactions for context
      const recentTransactions = await Transaction.find({
        user: user._id
      })
      .sort({ createdAt: -1 })
      .limit(5);

      const walletInfo = {
        balance: user.walletBalance,
        currency: 'USD',
        recentTransactions
      };

      const response = ApiResponse.success('Wallet balance retrieved successfully', walletInfo);
      sendResponse(res, response);

    } catch (error) {
      logger.error('Get wallet balance error:', error);
      const response = ApiResponse.error('Failed to retrieve wallet balance', 500);
      sendResponse(res, response);
    }
  }

  /**
   * Process wallet withdrawal
   */
  async withdrawFromWallet(req: Request, res: Response) {
    try {
      const user = (req as AuthRequest).user;
      const { amount, paymentMethod, accountDetails } = req.body;

      // Validate withdrawal amount
      if (!amount || amount <= 0) {
        const response = ApiResponse.error('Invalid withdrawal amount', 400);
        return sendResponse(res, response);
      }

      // Check sufficient balance
      if (user.walletBalance < amount) {
        const response = ApiResponse.error('Insufficient wallet balance', 400);
        return sendResponse(res, response);
      }

      // Validate payment method for withdrawal
      const validWithdrawalMethods = ['flutterwave', 'momo', 'bank_transfer'];
      if (!validWithdrawalMethods.includes(paymentMethod)) {
        const response = ApiResponse.error('Invalid withdrawal method', 400);
        return sendResponse(res, response);
      }

      // Create withdrawal transaction
      const transaction = new Transaction({
        user: user._id,
        amount,
        type: 'credit', // Credit for withdrawal (money leaving system)
        status: 'pending',
        description: `Withdrawal to ${paymentMethod}`,
        paymentMethod,
        paymentReference: `withdraw_${Date.now()}`,
        metadata: {
          accountDetails,
          withdrawalRequest: true
        }
      });

      // Deduct from wallet immediately
      user.walletBalance -= amount;

      await Promise.all([transaction.save(), user.save()]);

      // Process withdrawal with payment gateway (async - could be webhook)
      // This would typically be handled by a background job

      const responseData = {
        transaction,
        newBalance: user.walletBalance,
        message: 'Withdrawal request submitted successfully'
      };

      const response = ApiResponse.success('Withdrawal request submitted', responseData);

      logger.info('Withdrawal request submitted', {
        userId: user._id,
        amount,
        paymentMethod,
        transactionId: transaction._id
      });

      sendResponse(res, response);

    } catch (error) {
      logger.error('Withdraw from wallet error:', error);
      const response = ApiResponse.error('Failed to process withdrawal', 500);
      sendResponse(res, response);
    }
  }

  /**
   * Webhook for payment gateway callbacks
   */
  async paymentWebhook(req: Request, res: Response) {
    try {
      const { reference, status, gateway } = req.body;

      logger.info('Payment webhook received', {
        reference,
        status,
        gateway,
        payload: req.body
      });

      // Find transaction by reference
      const transaction = await Transaction.findOne({ paymentReference: reference });
      if (!transaction) {
        logger.warn('Transaction not found for webhook', { reference });
        return res.status(404).json({ success: false, message: 'Transaction not found' });
      }

      // Verify webhook signature (implementation depends on payment gateway)
      const isValidWebhook = await this.paymentService.verifyWebhookSignature(req);
      if (!isValidWebhook) {
        logger.warn('Invalid webhook signature', { reference, gateway });
        return res.status(401).json({ success: false, message: 'Invalid signature' });
      }

      // Update transaction status based on webhook
      if (status === 'successful' || status === 'completed') {
        transaction.status = 'completed';

        // Update user wallet if it's a deposit
        if (transaction.type === 'debit') {
          const user = await User.findById(transaction.user);
          if (user) {
            user.walletBalance += transaction.amount;
            await user.save();

            logger.info('Wallet funded via webhook', {
              userId: user._id,
              amount: transaction.amount,
              reference
            });
          }
        }

        await transaction.save();

        logger.info('Payment completed via webhook', { reference, status });

      } else if (status === 'failed' || status === 'cancelled') {
        transaction.status = 'failed';
        await transaction.save();

        logger.warn('Payment failed via webhook', { reference, status });
      }

      // Return success to payment gateway
      res.status(200).json({ success: true, message: 'Webhook processed' });

    } catch (error) {
      logger.error('Payment webhook error:', error);
      res.status(500).json({ success: false, message: 'Webhook processing failed' });
    }
  }

  /**
   * Get transaction by ID
   */
  async getTransactionById(req: Request, res: Response) {
    try {
      const user = (req as AuthRequest).user;
      const { id } = req.params;

      const transaction = await Transaction.findOne({
        _id: id,
        user: user._id
      });

      if (!transaction) {
        const response = ApiResponse.error('Transaction not found', 404);
        return sendResponse(res, response);
      }

      const response = ApiResponse.success('Transaction retrieved successfully', { transaction });
      sendResponse(res, response);

    } catch (error) {
      logger.error('Get transaction by ID error:', error);
      const response = ApiResponse.error('Failed to retrieve transaction', 500);
      sendResponse(res, response);
    }
  }
}