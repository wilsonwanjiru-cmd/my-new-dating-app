const User = require("../models/user");
const { fetchAccessToken } = require("../utils/mpesaUtils");
const axios = require("axios");

// Initiate Payment
exports.initiatePayment = async (req, res) => {
  try {
    const { phoneNumber, amount } = req.body;

    if (!phoneNumber || !amount) {
      return res.status(400).json({ message: "Phone number and amount are required" });
    }

    // Ensure the phone number format is correct (no '+' sign)
    const sanitizedPhoneNumber = phoneNumber.replace("+", "");

    console.log("Initiating payment for phone number:", sanitizedPhoneNumber);

    // Fetch a fresh access token
    const accessToken = await fetchAccessToken();

    const response = await axios.post(
      "https://api.safaricom.co.ke/mpesa/stkpush/v1/processrequest",
      {
        BusinessShortCode: process.env.MPESA_PAYBILL,
        Amount: amount,
        PartyA: sanitizedPhoneNumber,
        PartyB: process.env.MPESA_PAYBILL,
        PhoneNumber: sanitizedPhoneNumber,
        CallBackURL: `${process.env.SERVER_URL}/api/payments/callback`,
        AccountReference: process.env.ACCOUNT_NUMBER || "Subscription",
        TransactionDesc: `Payment to ${process.env.BUSINESS_NAME || "Your Business"}`,
        TransactionType: "CustomerPayBillOnline",
      },
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
      }
    );

    console.log("Payment initiation successful:", response.data);

    return res.status(200).json({ message: "Payment initiated", data: response.data });
  } catch (error) {
    console.error("Payment initiation error:", error);

    return res.status(500).json({
      message: "Payment initiation failed",
      error: error.message,
      details: error.response?.data || null,
    });
  }
};

// Handle Callback
exports.handleCallback = async (req, res) => {
  try {
    const { Body } = req.body;

    if (!Body || !Body.stkCallback) {
      return res.status(400).json({ message: "Invalid callback data" });
    }

    const { ResultCode, CallbackMetadata } = Body.stkCallback;

    if (ResultCode === 0 && CallbackMetadata) {
      const phoneNumber = CallbackMetadata.Item.find((item) => item.Name === "PhoneNumber").Value;

      console.log("Payment successful for phone number:", phoneNumber);

      const user = await User.findOne({ phoneNumber });
      if (user) {
        user.isSubscribed = true;
        user.subscriptionExpires = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours from now
        await user.save();
      }
    } else {
      console.log("Payment failed with ResultCode:", ResultCode);
    }

    return res.status(200).json({ message: "Callback handled successfully" });
  } catch (error) {
    console.error("Callback handling error:", error);
    return res.status(500).json({ message: "Callback handling failed", error: error.message });
  }
};

// Validate M-Pesa Payment
exports.validateMpesaRequest = (req, res) => {
  try {
    console.log("Validation request received:", req.body);
    return res.status(200).json({ ResultCode: 0, ResultDesc: "Accepted" });
  } catch (error) {
    console.error("Validation error:", error);
    return res.status(500).json({ ResultCode: 1, ResultDesc: "Validation failed" });
  }
};

// Confirm M-Pesa Payment
exports.confirmPayment = (req, res) => {
  try {
    console.log("Confirmation request received:", req.body);
    return res.status(200).json({ ResultCode: 0, ResultDesc: "Confirmed" });
  } catch (error) {
    console.error("Confirmation error:", error);
    return res.status(500).json({ ResultCode: 1, ResultDesc: "Confirmation failed" });
  }
};
