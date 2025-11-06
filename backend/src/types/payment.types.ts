// src/types/payment.types.ts
import { Document, Schema } from 'mongoose';

export interface ITransaction extends Document {
  _id: string;
  user: Schema.Types.ObjectId;
  amount: number;
  type: 'debit' | 'credit';
  status: 'pending' | 'completed' | 'failed';
  description: string;
  paymentMethod: 'flutterwave' | 'stripe' | 'momo' | 'airtel_money';
  paymentReference: string;
  metadata: Record<string, any>;
  createdAt: Date;
  updatedAt: Date;
}

export interface PaymentInitiationData {
  userId: string;
  email: string;
  amount: number;
  paymentMethod: string;
  phoneNumber?: string; // For Airtel Money
  metadata: {
    quizCategory?: string;
    purpose: string;
  };
}

export interface PaymentVerificationResult {
  success: boolean;
  data?: any;
  error?: string;
}

export interface AirtelMoneyPaymentData {
  reference: string;
  subscriberNumber: string;
  transactionId?: string;
  status: 'PENDING' | 'SUCCESS' | 'FAILED';
  amount: string;
  currency: string;
  message?: string;
}