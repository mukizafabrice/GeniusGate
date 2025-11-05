// models/Transaction.js
const transactionSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    type: {
      type: String,
      enum: ["payment", "payout", "refund", "reward"],
      required: true,
    },
    amount: { type: Number, required: true },
    currency: { type: String, default: "USD" },
    status: {
      type: String,
      enum: ["pending", "success", "failed", "cancelled"],
      default: "pending",
    },
    paymentMethod: {
      type: String,
      enum: ["flutterwave", "stripe", "momo", "wallet"],
    },
    reference: { type: String, unique: true },
    providerReference: String, // Payment gateway reference
    description: String,
    metadata: mongoose.Schema.Types.Mixed,
  },
  { timestamps: true }
);
