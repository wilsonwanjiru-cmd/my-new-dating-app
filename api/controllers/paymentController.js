const axios = require("axios");
const User = require("../models/user");
const { fetchAccessToken } = require("../utils/mpesaUtils");

// @desc    Initiate M-Pesa STK Push payment
// @route   POST /api/payments/pay
exports.initiatePayment = async (req, res) => {
  try {
    const { phoneNumber, amount } = req.body;

    if (!phoneNumber || !amount) {
      return res.status(400).json({ message: "Phone number and amount are required" });
    }

    // Sanitize phone number: remove '+' and ensure it's in 2547... format
    const sanitizedPhoneNumber = phoneNumber.replace(/^\+/, "");

    console.log(`Initiating payment for ${sanitizedPhoneNumber} with amount ${amount}`);

    // Fetch fresh access token
    const accessToken = await fetchAccessToken();

    const paymentPayload = {
      BusinessShortCode: process.env.MPESA_PAYBILL,
      Amount: amount,
      PartyA: sanitizedPhoneNumber,
      PartyB: process.env.MPESA_PAYBILL,
      PhoneNumber: sanitizedPhoneNumber,
      CallBackURL: `${process.env.SERVER_URL}/api/payments/callback`,
      AccountReference: process.env.ACCOUNT_NUMBER || "Subscription",
      TransactionDesc: `Payment to ${process.env.BUSINESS_NAME || "Your Business"}`,
      TransactionType: "CustomerPayBillOnline",
    };

    const mpesaResponse = await axios.post(
      "https://api.safaricom.co.ke/mpesa/stkpush/v1/processrequest",
      paymentPayload,
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
      }
    );

    console.log("Payment initiation response:", mpesaResponse.data);

    return res.status(200).json({
      message: "Payment initiated successfully",
      data: mpesaResponse.data,
    });
  } catch (error) {
    console.error("Error initiating payment:", error.message);
    return res.status(500).json({
      message: "Payment initiation failed",
      error: error.message,
      details: error.response?.data || null,
    });
  }
};

// @desc    Handle M-Pesa callback from Safaricom
// @route   POST /api/payments/callback
exports.handleCallback = async (req, res) => {
  try {
    const { Body } = req.body;

    if (!Body?.stkCallback) {
      return res.status(400).json({ message: "Invalid callback format" });
    }

    const { stkCallback } = Body;
    const { ResultCode, CallbackMetadata } = stkCallback;

    if (ResultCode === 0 && CallbackMetadata) {
      const items = CallbackMetadata.Item || [];
      const phoneItem = items.find(item => item.Name === "PhoneNumber");

      if (!phoneItem?.Value) {
        console.log("PhoneNumber not found in metadata");
        return res.status(400).json({ message: "PhoneNumber missing in callback" });
      }

      const phoneNumber = phoneItem.Value.toString();
      console.log("Payment confirmed for phone number:", phoneNumber);

      // Update user subscription status
      const user = await User.findOne({ phoneNumber });
      if (user) {
        user.isSubscribed = true;
        user.subscriptionExpires = new Date(Date.now() + 24 * 60 * 60 * 1000); // Add 24 hours
        await user.save();
        console.log("User subscription updated for:", phoneNumber);
      } else {
        console.warn("User not found for phone number:", phoneNumber);
      }
    } else {
      console.log("M-Pesa STK Push failed. ResultCode:", ResultCode);
    }

    return res.status(200).json({ message: "Callback processed successfully" });
  } catch (error) {
    console.error("Error handling callback:", error.message);
    return res.status(500).json({ message: "Callback processing failed", error: error.message });
  }
};

// @desc    Validate incoming M-Pesa request (Validation URL)
// @route   POST /api/payments/validate
exports.validateMpesaRequest = (req, res) => {
  try {
    console.log("M-Pesa validation request received:", req.body);
    return res.status(200).json({
      ResultCode: 0,
      ResultDesc: "Accepted",
    });
  } catch (error) {
    console.error("Validation error:", error.message);
    return res.status(500).json({
      ResultCode: 1,
      ResultDesc: "Validation failed",
    });
  }
};

// @desc    Confirm incoming M-Pesa payment (Confirmation URL)
// @route   POST /api/payments/confirm
exports.confirmPayment = (req, res) => {
  try {
    console.log("M-Pesa confirmation request received:", req.body);
    return res.status(200).json({
      ResultCode: 0,
      ResultDesc: "Confirmed",
    });
  } catch (error) {
    console.error("Confirmation error:", error.message);
    return res.status(500).json({
      ResultCode: 1,
      ResultDesc: "Confirmation failed",
    });
  }
};
