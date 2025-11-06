// src/services/payment.service.ts
import { config } from '../config/environment';
import { logger } from '../utils/logger';
import { 
  PaymentInitiationData, 
  PaymentVerificationResult,
  AirtelMoneyPaymentData 
} from '../types/payment.types';
import { Transaction } from '../models/transaction.model';
import { User } from '../models/user.model';
import { Request } from 'express';

export class PaymentService {
  private airtelMoneyConfig = {
    baseUrl: process.env.AIRTEL_MONEY_BASE_URL || 'https://openapi.airtel.africa',
    clientId: process.env.AIRTEL_MONEY_CLIENT_ID!,
    clientSecret: process.env.AIRTEL_MONEY_CLIENT_SECRET!,
    country: process.env.AIRTEL_MONEY_COUNTRY || 'UG',
    currency: process.env.AIRTEL_MONEY_CURRENCY || 'UGX'
  };

  /**
   * Initialize payment with selected payment method
   */
  async initializePayment(paymentData: PaymentInitiationData): Promise<{
    paymentReference: string;
    paymentUrl?: string;
    gatewayData: any;
  }> {
    try {
      switch (paymentData.paymentMethod) {
        case 'airtel_money':
          return await this.initializeAirtelMoneyPayment(paymentData);
        
        case 'flutterwave':
          return await this.initializeFlutterwavePayment(paymentData);
        
        case 'momo':
          return await this.initializeMomoPayment(paymentData);
        
        case 'stripe':
          return await this.initializeStripePayment(paymentData);
        
        default:
          throw new Error(`Unsupported payment method: ${paymentData.paymentMethod}`);
      }
    } catch (error) {
      logger.error('Payment initialization error:', error);
      throw new Error('Failed to initialize payment');
    }
  }

  /**
   * Initialize Airtel Money payment
   */
  private async initializeAirtelMoneyPayment(paymentData: PaymentInitiationData): Promise<{
    paymentReference: string;
    paymentUrl?: string;
    gatewayData: any;
  }> {
    try {
      // Generate unique reference
      const reference = `AIR${Date.now()}${Math.random().toString(36).substr(2, 9)}`;
      
      // For Airtel Money, we typically collect phone number from frontend
      // and process the payment directly without redirect URL
      const airtelPayload = {
        reference,
        subscriber: {
          country: this.airtelMoneyConfig.country,
          currency: this.airtelMoneyConfig.currency,
          msisdn: paymentData.phoneNumber // Phone number from frontend
        },
        transaction: {
          amount: paymentData.amount,
          country: this.airtelMoneyConfig.country,
          currency: this.airtelMoneyConfig.currency,
          id: reference
        }
      };

      // Get access token first
      const authToken = await this.getAirtelMoneyAuthToken();
      
      // Make API call to Airtel Money
      const response = await fetch(`${this.airtelMoneyConfig.baseUrl}/merchant/v1/payments/`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Country': this.airtelMoneyConfig.country,
          'X-Currency': this.airtelMoneyConfig.currency,
          'Authorization': `Bearer ${authToken}`
        },
        body: JSON.stringify(airtelPayload)
      });

      const result: any = await response.json();

      if (result?.status?.success) {
        return {
          paymentReference: reference,
          gatewayData: {
            airtelTransactionId: result?.data?.transaction?.id,
            status: result?.data?.transaction?.status,
            message: result?.data?.transaction?.message
          }
        };
      } else {
        throw new Error(result?.status?.message || 'Airtel Money payment failed');
      }

    } catch (error) {
      logger.error('Airtel Money initialization error:', error);
      throw new Error('Airtel Money payment initialization failed');
    }
  }

  /**
   * Get Airtel Money authentication token
   */
  private async getAirtelMoneyAuthToken(): Promise<string> {
    try {
      const authString = Buffer.from(
        `${this.airtelMoneyConfig.clientId}:${this.airtelMoneyConfig.clientSecret}`
      ).toString('base64');

      const response = await fetch(`${this.airtelMoneyConfig.baseUrl}/auth/oauth2/token`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Basic ${authString}`
        },
        body: JSON.stringify({
          grant_type: 'client_credentials'
        })
      });

      const result: any = await response.json();

      if (result?.access_token) {
        return result.access_token;
      } else {
        throw new Error('Failed to get Airtel Money auth token');
      }
    } catch (error) {
      logger.error('Airtel Money auth token error:', error);
      throw new Error('Authentication with Airtel Money failed');
    }
  }

  /**
   * Verify Airtel Money payment
   */
  private async verifyAirtelMoneyPayment(reference: string): Promise<PaymentVerificationResult> {
    try {
      const authToken = await this.getAirtelMoneyAuthToken();
      
      const response = await fetch(
        `${this.airtelMoneyConfig.baseUrl}/standard/v1/payments/${reference}`, 
        {
          method: 'GET',
          headers: {
            'Content-Type': 'application/json',
            'X-Country': this.airtelMoneyConfig.country,
            'X-Currency': this.airtelMoneyConfig.currency,
            'Authorization': `Bearer ${authToken}`
          }
        }
      );

      const result: any = await response.json();

      if (result?.data?.transaction?.status === 'TS') { // TS = Transaction Successful
        return {
          success: true,
          data: result.data
        };
      } else if (result?.data?.transaction?.status === 'TF') { // TF = Transaction Failed
        return {
          success: false,
          error: result?.data?.transaction?.message || 'Payment failed'
        };
      } else {
        return {
          success: false,
          error: 'Payment pending or in progress'
        };
      }

    } catch (error) {
      logger.error('Airtel Money verification error:', error);
      return {
        success: false,
        error: 'Failed to verify Airtel Money payment'
      };
    }
  }

  /**
   * Verify payment with appropriate gateway
   */
  async verifyPayment(reference: string, paymentMethod: string): Promise<PaymentVerificationResult> {
    try {
      switch (paymentMethod) {
        case 'airtel_money':
          return await this.verifyAirtelMoneyPayment(reference);
        
        case 'flutterwave':
          return await this.verifyFlutterwavePayment(reference);
        
        case 'momo':
          return await this.verifyMomoPayment(reference);
        
        case 'stripe':
          return await this.verifyStripePayment(reference);
        
        default:
          return {
            success: false,
            error: `Unsupported payment method: ${paymentMethod}`
          };
      }
    } catch (error) {
      logger.error('Payment verification error:', error);
      return {
        success: false,
        error: 'Payment verification failed'
      };
    }
  }

  /**
   * Verify webhook signature (for Airtel Money)
   */
  async verifyAirtelMoneyWebhookSignature(payload: any, signature: string): Promise<boolean> {
    try {
      // Airtel Money typically sends webhook signatures for verification
      // Implementation depends on Airtel's specific webhook security
      // This is a simplified version - adjust based on actual Airtel documentation
      
      const expectedSignature = this.generateAirtelWebhookSignature(payload);
      return signature === expectedSignature;
    } catch (error) {
      logger.error('Airtel webhook signature verification error:', error);
      return false;
    }
  }

  /**
   * Generate signature for Airtel Money webhook verification
   */
  private generateAirtelWebhookSignature(payload: any): string {
    // Implement based on Airtel Money webhook documentation
    // This is a placeholder - replace with actual implementation
    const secret = process.env.AIRTEL_MONEY_WEBHOOK_SECRET;
    const data = JSON.stringify(payload) + secret;
    return Buffer.from(data).toString('base64');
  }

  /**
   * Process Airtel Money webhook
   */
  async processAirtelMoneyWebhook(webhookData: any): Promise<void> {
    try {
      const { transaction } = webhookData;
      
      // Find transaction by reference
      const dbTransaction = await Transaction.findOne({ 
        paymentReference: transaction.id 
      });

      if (!dbTransaction) {
        logger.warn('Airtel Money webhook: Transaction not found', { 
          reference: transaction.id 
        });
        return;
      }

      // Update transaction status based on webhook
      if (transaction.status === 'TS') { // Transaction Successful
        dbTransaction.status = 'completed';
        dbTransaction.metadata.airtelWebhookData = webhookData;
        
        // Update user wallet
        const user = await User.findById(dbTransaction.user);
        if (user && dbTransaction.type === 'debit') {
          user.walletBalance += dbTransaction.amount;
          await user.save();
        }
        
        await dbTransaction.save();
        
        logger.info('Airtel Money payment completed via webhook', {
          reference: transaction.id,
          amount: transaction.amount
        });

      } else if (transaction.status === 'TF') { // Transaction Failed
        dbTransaction.status = 'failed';
        dbTransaction.metadata.airtelWebhookData = webhookData;
        await dbTransaction.save();
        
        logger.warn('Airtel Money payment failed via webhook', {
          reference: transaction.id,
          reason: transaction.message
        });
      }

    } catch (error) {
      logger.error('Airtel Money webhook processing error:', error);
      throw error;
    }
  }

  // Placeholder methods for other payment providers
  private async initializeFlutterwavePayment(paymentData: PaymentInitiationData) {
    // Implementation for Flutterwave
    return { paymentReference: 'FLW_REF', gatewayData: {} };
  }

  private async initializeMomoPayment(paymentData: PaymentInitiationData) {
    // Implementation for MTN MoMo
    return { paymentReference: 'MOMO_REF', gatewayData: {} };
  }

  private async initializeStripePayment(paymentData: PaymentInitiationData) {
    // Implementation for Stripe
    return { paymentReference: 'STRIPE_REF', gatewayData: {} };
  }

  private async verifyFlutterwavePayment(reference: string): Promise<PaymentVerificationResult> {
    // Implementation for Flutterwave
    return { success: true, data: {} };
  }

  private async verifyMomoPayment(reference: string): Promise<PaymentVerificationResult> {
    // Implementation for MTN MoMo
    return { success: true, data: {} };
  }

  private async verifyStripePayment(reference: string): Promise<PaymentVerificationResult> {
    // Implementation for Stripe
    return { success: true, data: {} };
  }

  async verifyWebhookSignature(req: Request): Promise<boolean> {
    // Generic webhook verification - delegate to specific provider
    const gateway = req.body.gateway || this.detectGatewayFromRequest(req);
    
    switch (gateway) {
      case 'airtel_money':
        return await this.verifyAirtelMoneyWebhookSignature(
          req.body, 
          req.headers['x-airtel-signature'] as string
        );
      
      case 'flutterwave':
        // Implement Flutterwave webhook verification
        return true;
      
      default:
        logger.warn('Unknown gateway for webhook verification:', gateway);
        return false;
    }
  }

  private detectGatewayFromRequest(req: Request): string {
    // Detect payment gateway from request headers or body
    if (req.headers['x-airtel-signature']) return 'airtel_money';
    if (req.headers['verif-hash']) return 'flutterwave';
    return 'unknown';
  }
}