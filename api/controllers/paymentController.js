const axios = require('axios');
const crypto = require('crypto');
const User = require('../models/user');
const Payment = require('../models/Payment');
const Subscription = require('../models/Subscription');
const Notification = require('../models/notification');
const { formatDistanceToNow } = require('date-fns');

// Constants
const SUBSCRIPTION_AMOUNT = 10; // KES 10 for 24-hour chat access
const SUBSCRIPTION_DURATION_MS = 24 * 60 * 60 * 1000; // 24 hours

// Error handler
const handleError = (error, res) => {
  console.error('Payment Controller Error:', error);
  
  const response = {
    success: false,
    code: 'PAYMENT_ERROR',
    message: 'Payment processing failed'
  };

  if (process.env.NODE_ENV === 'development') {
    response.error = error.message;
    response.stack = error.stack;
  }

  return res.status(500).json(response);
};

/**
 * Initiate M-Pesa STK Push for chat subscription
 */
const initiateSubscription = async (req, res) => {
  try {
    const { phoneNumber } = req.body;
    const user = req.user;

    // Validate phone number format
    const formattedPhone = formatPhoneNumber(phoneNumber);
    if (!formattedPhone) {
      return res.status(400).json({
        success: false,
        code: 'INVALID_PHONE',
        message: 'Please use a valid Kenyan phone number (e.g. 2547XXXXXXXX)'
      });
    }

    // Check for existing active subscription
    if (user.subscription?.isActive && new Date(user.subscription.expiresAt) > new Date()) {
      return res.status(200).json({
        success: true,
        code: 'SUBSCRIPTION_ACTIVE',
        message: 'You already have an active subscription',
        expiresAt: user.subscription.expiresAt
      });
    }

    // Initiate M-Pesa payment
    const paymentData = {
      phoneNumber: formattedPhone,
      amount: SUBSCRIPTION_AMOUNT,
      accountReference: `RudaChat-${user._id}`,
      transactionDesc: '24-hour chat access'
    };

    const stkPush = await initiateSTKPush(paymentData);

    if (!stkPush.success) {
      return res.status(400).json({
        success: false,
        code: 'MPESA_FAILED',
        message: 'Failed to initiate M-Pesa payment',
        details: stkPush.error
      });
    }

    // Create payment record
    const payment = await Payment.create({
      user: user._id,
      amount: SUBSCRIPTION_AMOUNT,
      paymentMethod: 'mpesa',
      status: 'pending',
      reference: stkPush.CheckoutRequestID,
      phoneNumber: formattedPhone
    });

    return res.status(200).json({
      success: true,
      message: 'Payment request sent to your phone',
      data: {
        checkoutRequestID: stkPush.CheckoutRequestID,
        paymentId: payment._id,
        amount: SUBSCRIPTION_AMOUNT
      }
    });

  } catch (error) {
    handleError(error, res);
  }
};

/**
 * Handle M-Pesa callback
 */
const handleMpesaCallback = async (req, res) => {
  try {
    const callback = req.body;
    console.log('MPesa Callback:', callback);

    // Successful payment
    if (callback.ResultCode === 0) {
      const metadata = callback.CallbackMetadata?.Item || [];
      const paymentData = {
        amount: metadata.find(i => i.Name === 'Amount')?.Value,
        receiptNumber: metadata.find(i => i.Name === 'MpesaReceiptNumber')?.Value,
        phoneNumber: metadata.find(i => i.Name === 'PhoneNumber')?.Value,
        transactionDate: metadata.find(i => i.Name === 'TransactionDate')?.Value,
        checkoutRequestID: callback.CheckoutRequestID
      };

      // Update payment record
      const payment = await Payment.findOneAndUpdate(
        { reference: paymentData.checkoutRequestID },
        {
          status: 'completed',
          transactionId: paymentData.receiptNumber,
          phoneNumber: paymentData.phoneNumber,
          completedAt: new Date()
        },
        { new: true }
      );

      if (!payment) {
        console.error('Payment record not found for callback:', paymentData.checkoutRequestID);
        return res.status(200).send(); // Still acknowledge callback
      }

      // Create or update subscription
      const expiresAt = new Date(Date.now() + SUBSCRIPTION_DURATION_MS);
      const subscription = await Subscription.findOneAndUpdate(
        { user: payment.user },
        {
          isActive: true,
          payment: payment._id,
          expiresAt,
          lastRenewalAt: new Date()
        },
        { upsert: true, new: true }
      );

      // Update user subscription status
      await User.findByIdAndUpdate(payment.user, {
        $set: {
          'subscription.isActive': true,
          'subscription.expiresAt': expiresAt,
          'subscription.lastPayment': {
            amount: payment.amount,
            date: new Date(),
            method: 'mpesa',
            transactionId: payment.transactionId
          }
        }
      });

      // Send notification
      await Notification.create({
        user: payment.user,
        type: 'subscription_activated',
        message: 'Your 24-hour chat access is now active!',
        data: {
          expiresAt,
          amount: payment.amount
        }
      });

      console.log(`Subscription activated for user ${payment.user}`);
    }

    // Always acknowledge callback
    return res.status(200).send();

  } catch (error) {
    console.error('Callback processing error:', error);
    return res.status(200).send(); // Always acknowledge callback
  }
};

/**
 * Verify payment status
 */
const verifyPayment = async (req, res) => {
  try {
    const { checkoutRequestID } = req.body;
    const user = req.user;

    // Check payment status
    const payment = await Payment.findOne({
      reference: checkoutRequestID,
      user: user._id
    });

    if (!payment) {
      return res.status(404).json({
        success: false,
        code: 'PAYMENT_NOT_FOUND',
        message: 'Payment record not found'
      });
    }

    // Check subscription status if payment succeeded
    let subscriptionStatus = null;
    if (payment.status === 'completed') {
      const subscription = await Subscription.findOne({ payment: payment._id });
      subscriptionStatus = {
        isActive: subscription?.isActive || false,
        expiresAt: subscription?.expiresAt
      };
    }

    return res.status(200).json({
      success: true,
      data: {
        payment: {
          status: payment.status,
          amount: payment.amount,
          createdAt: payment.createdAt
        },
        subscription: subscriptionStatus
      }
    });

  } catch (error) {
    handleError(error, res);
  }
};

/**
 * Get current subscription status
 */
const getSubscriptionStatus = async (req, res) => {
  try {
    const user = await User.findById(req.user._id)
      .select('subscription');

    const isActive = user.subscription?.isActive && 
                     new Date(user.subscription.expiresAt) > new Date();

    return res.status(200).json({
      success: true,
      data: {
        isActive,
        expiresAt: user.subscription?.expiresAt,
        timeRemaining: isActive 
          ? formatDistanceToNow(new Date(user.subscription.expiresAt))
          : 'Expired'
      }
    });

  } catch (error) {
    handleError(error, res);
  }
};

/**
 * Get payment history
 */
const getPaymentHistory = async (req, res) => {
  try {
    const payments = await Payment.find({ user: req.user._id })
      .sort({ createdAt: -1 })
      .lean();

    return res.status(200).json({
      success: true,
      data: {
        payments
      }
    });

  } catch (error) {
    handleError(error, res);
  }
};

/**
 * MPesa STK Push Helper
 */
const initiateSTKPush = async (paymentData) => {
  try {
    const accessToken = await getMpesaAccessToken();
    const timestamp = generateTimestamp();
    const password = generatePassword(timestamp);

    const response = await axios.post(
      `${process.env.MPESA_API_URL}/stkpush/v1/processrequest`,
      {
        BusinessShortCode: process.env.MPESA_PAYBILL,
        Password: password,
        Timestamp: timestamp,
        TransactionType: 'CustomerPayBillOnline',
        Amount: paymentData.amount,
        PartyA: paymentData.phoneNumber,
        PartyB: process.env.MPESA_PAYBILL,
        PhoneNumber: paymentData.phoneNumber,
        CallBackURL: `${process.env.API_BASE_URL}/api/payments/mpesa-callback`,
        AccountReference: paymentData.accountReference,
        TransactionDesc: paymentData.transactionDesc
      },
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        }
      }
    );

    return {
      success: true,
      ...response.data
    };

  } catch (error) {
    console.error('STK Push Error:', error.response?.data || error.message);
    return {
      success: false,
      error: error.response?.data || error.message
    };
  }
};

/**
 * Helper: Get MPesa Access Token
 */
const getMpesaAccessToken = async () => {
  try {
    const response = await axios.get(
      `${process.env.MPESA_API_URL}/oauth/v1/generate?grant_type=client_credentials`,
      {
        auth: {
          username: process.env.MPESA_CONSUMER_KEY,
          password: process.env.MPESA_CONSUMER_SECRET
        }
      }
    );
    return response.data.access_token;
  } catch (error) {
    console.error('Access Token Error:', error.response?.data || error.message);
    throw new Error('Failed to get MPesa access token');
  }
};

/**
 * Helper: Format Kenyan phone number
 */
const formatPhoneNumber = (phone) => {
  const cleaned = phone.replace(/\D/g, '');
  if (/^0[17]\d{8}$/.test(cleaned)) return `254${cleaned.substring(1)}`;
  if (/^254[17]\d{8}$/.test(cleaned)) return cleaned;
  if (/^[17]\d{8}$/.test(cleaned)) return `254${cleaned}`;
  return null;
};

/**
 * Helper: Generate MPesa password
 */
const generatePassword = (timestamp) => {
  const passkey = process.env.MPESA_PASSKEY;
  const shortcode = process.env.MPESA_PAYBILL;
  return Buffer.from(`${shortcode}${passkey}${timestamp}`).toString('base64');
};

/**
 * Helper: Generate MPesa timestamp
 */
const generateTimestamp = () => {
  return new Date().toISOString().replace(/[^0-9]/g, '').slice(0, 14);
};

module.exports = {
  initiateSubscription,
  handleMpesaCallback,
  verifyPayment,
  getSubscriptionStatus,
  getPaymentHistory,
  _helpers: {
    initiateSTKPush,
    getMpesaAccessToken,
    formatPhoneNumber
  }
};