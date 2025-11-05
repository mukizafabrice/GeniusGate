// services/paymentService.js
const axios = require("axios");

class PaymentService {
  async initializeFlutterwavePayment(userId, amount, currency = "USD") {
    const reference = `FLW_${Date.now()}_${userId}`;

    const payload = {
      tx_ref: reference,
      amount,
      currency,
      redirect_url: `${process.env.FRONTEND_URL}/payment/verify`,
      customer: {
        email: user.email,
        name: user.username,
      },
      customizations: {
        title: "Quiz Game Payment",
        description: `Payment for quiz session - ${reference}`,
      },
    };

    const response = await axios.post(
      "https://api.flutterwave.com/v3/payments",
      payload,
      {
        headers: {
          Authorization: `Bearer ${process.env.FLUTTERWAVE_SECRET_KEY}`,
          "Content-Type": "application/json",
        },
      }
    );

    // Save transaction record
    await Transaction.create({
      userId,
      type: "payment",
      amount,
      currency,
      status: "pending",
      paymentMethod: "flutterwave",
      reference,
      providerReference: response.data.data.tx_ref,
    });

    return response.data;
  }

  async verifyPayment(reference) {
    // Verify with Flutterwave
    const response = await axios.get(
      `https://api.flutterwave.com/v3/transactions/verify_by_reference?tx_ref=${reference}`,
      {
        headers: {
          Authorization: `Bearer ${process.env.FLUTTERWAVE_SECRET_KEY}`,
        },
      }
    );

    const transaction = await Transaction.findOne({ reference });

    if (response.data.data.status === "successful") {
      transaction.status = "success";
      await transaction.save();

      // Update user wallet or start quiz session
      await this.handleSuccessfulPayment(transaction);

      return { success: true, transaction };
    } else {
      transaction.status = "failed";
      await transaction.save();
      return { success: false, transaction };
    }
  }
}
