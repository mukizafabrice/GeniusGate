
// src/models/transaction.model.ts
import { Schema, model } from 'mongoose';
import { ITransaction } from '../types/payment.types';

const transactionSchema = new Schema<ITransaction>(
  {
    user: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    amount: { type: Number, required: true },
    type: { type: String, enum: ['debit', 'credit'], required: true },
    status: { 
      type: String, 
      enum: ['pending', 'completed', 'failed'], 
      default: 'pending' 
    },
    description: { type: String, required: true },
    paymentMethod: { 
      type: String, 
      enum: ['flutterwave', 'stripe', 'momo'], 
      required: true 
    },
    paymentReference: { type: String, required: true, unique: true },
    metadata: { type: Schema.Types.Mixed, default: {} }
  },
  { timestamps: true }
);

export const Transaction = model<ITransaction>('Transaction', transactionSchema);