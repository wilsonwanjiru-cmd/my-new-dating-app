// controllers/paymentController.js

const mongoose = require('mongoose');
const axios = require('axios');
const crypto = require('crypto');
const User = require('../models/user');
const Payment = require('../models/Payment');
const Subscription = require('../models/Subscription');
const Notification = require('../models/Notification');
const { formatDistanceToNow } = require('date-fns');

// 🔒 Centralized error handler
const handleError = (error, res) => {
  console.error('Payment Controller Error:', error);

  if (error instanceof mongoose.Error.ValidationError) {
    return res.status(400).json({ success: false, message: error.message });
  }

  if (error instanceof mongoose.Error.CastError) {
    return res.status(400).json({ success: false, message: 'Invalid ID format' });
  }

  return res.status(500).json({
    success: false,
    message: 'Internal server error',
    error: process.env.NODE_ENV === 'development' ? error : undefined
  });
};

// 🔁 POST /api/payments/process
const processPayment = async (req, res) => {
  try {
    const { amount, paymentMethod, userId } = req.body;

    if (amount !== 10) {
      return res.status(400).json({
        success: false,
        message: 'Amount must be exactly KES 10 for daily subscription'
      });
    }

    const payment = new Payment({
      amount,
      paymentMethod,
      user: userId,
      status: 'completed',
      date: new Date()
    });

    await payment.save();

    const subscription = await Subscription.findOneAndUpdate(
      { user: userId },
      {
        $set: {
          status: 'active',
          startDate: new Date(),
          endDate: new Date(Date.now() + 24 * 60 * 60 * 1000)
        }
      },
      { upsert: true, new: true }
    );

    await User.findByIdAndUpdate(userId, {
      $set: {
        'subscription.isActive': true,
        'subscription.expiresAt': subscription.endDate,
        'subscription.lastPayment': {
          amount,
          date: new Date(),
          transactionId: payment._id,
          method: paymentMethod
        },
        lastSubscribedAt: new Date()
      }
    });

    await Notification.create({
      user: userId,
      type: 'subscription_activated',
      title: 'Subscription Activated',
      message: 'Your 24-hour subscription is now active!',
      data: {
        expiresAt: subscription.endDate,
        amount
      }
    });

    res.status(201).json({
      success: true,
      message: 'KES 10 payment processed successfully',
      payment,
      subscription
    });
  } catch (error) {
    return handleError(error, res);
  }
};

// 🔁 POST /api/payments/subscribe
const initiateMpesaSubscription = async (req, res) => {
  try {
    const { phoneNumber } = req.body;
    const amount = 10;
    const userId = req.user._id;

    const paymentResult = await processMpesaPayment(phoneNumber, amount);

    if (!paymentResult.success) {
      return res.status(400).json({
        success: false,
        message: 'M-Pesa payment initiation failed',
        details: paymentResult.error
      });
    }

    const pendingSubscription = await Subscription.create({
      user: userId,
      amount,
      paymentMethod: 'mpesa',
      transactionId: paymentResult.data.transactionId,
      status: 'pending'
    });

    return res.status(200).json({
      success: true,
      message: 'M-Pesa payment request sent to your phone',
      data: {
        checkoutRequestId: paymentResult.data.transactionId,
        subscription: pendingSubscription
      }
    });
  } catch (error) {
    return handleError(error, res);
  }
};

// 🔁 POST /api/payments/mpesa/callback
const handleMpesaCallback = async (req, res) => {
  try {
    const callbackData = req.body;

    if (!callbackData.Body?.stkCallback) {
      return res.status(400).json({
        success: false,
        message: 'Invalid callback format'
      });
    }

    const { ResultCode, ResultDesc, CallbackMetadata } = callbackData.Body.stkCallback;

    if (ResultCode === 0) {
      const metadata = {};
      (CallbackMetadata.Item || []).forEach(item => {
        metadata[item.Name] = item.Value;
      });

      const amount = metadata.Amount;
      const mpesaReceiptNumber = metadata.MpesaReceiptNumber;
      const checkoutRequestId = metadata.CheckoutRequestID;

      const subscription = await Subscription.findOneAndUpdate(
        { transactionId: checkoutRequestId, status: 'pending' },
        {
          $set: {
            transactionId: mpesaReceiptNumber,
            status: 'active',
            startDate: new Date(),
            endDate: new Date(Date.now() + 24 * 60 * 60 * 1000)
          }
        },
        { new: true }
      );

      if (!subscription) {
        return res.status(200).json({
          success: true,
          message: 'Callback processed but no pending subscription found'
        });
      }

      await User.findByIdAndUpdate(subscription.user, {
        $set: {
          'subscription.isActive': true,
          'subscription.expiresAt': subscription.endDate,
          'subscription.lastPayment': {
            amount,
            date: new Date(),
            transactionId: mpesaReceiptNumber,
            method: 'mpesa'
          },
          lastSubscribedAt: new Date()
        }
      });

      await Payment.create({
        amount,
        paymentMethod: 'mpesa',
        user: subscription.user,
        status: 'completed',
        transactionId: mpesaReceiptNumber,
        date: new Date()
      });

      await Notification.create({
        user: subscription.user,
        type: 'subscription_activated',
        title: 'Subscription Activated',
        message: 'Your 24-hour subscription is now active!',
        data: {
          expiresAt: subscription.endDate,
          amount
        }
      });

      console.log(`✅ Subscription activated for user ${subscription.user} via M-Pesa`);
    } else {
      const checkoutRequestId = callbackData.Body.stkCallback.CheckoutRequestID;

      await Subscription.updateOne(
        { transactionId: checkoutRequestId, status: 'pending' },
        { $set: { status: 'failed', failureReason: ResultDesc } }
      );

      console.warn(`⚠️ M-Pesa payment failed: ${ResultDesc} (Code: ${ResultCode})`);
    }

    return res.status(200).json({
      success: true,
      message: 'Callback processed successfully'
    });
  } catch (error) {
    return handleError(error, res);
  }
};

// 🔁 POST /api/payments/verify
const verifyPayment = async (req, res) => {
  try {
    const { checkoutRequestId } = req.body;
    const userId = req.user._id;

    const subscription = await Subscription.findOne({
      transactionId: checkoutRequestId,
      user: userId
    });

    if (!subscription) {
      return res.status(404).json({
        success: false,
        message: 'Payment record not found'
      });
    }

    return res.status(200).json({
      success: true,
      data: {
        status: subscription.status,
        isActive: subscription.status === 'active',
        subscription
      }
    });
  } catch (error) {
    return handleError(error, res);
  }
};

// 🔁 GET /api/payments/status
const getSubscriptionStatus = async (req, res) => {
  try {
    const user = await User.findById(req.user._id).select('subscription');

    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    const isActive = user.subscription?.isActive &&
      new Date(user.subscription.expiresAt) > new Date();

    return res.status(200).json({
      success: true,
      data: {
        isActive,
        expiresAt: user.subscription?.expiresAt,
        timeRemaining: isActive
          ? formatDistanceToNow(new Date(user.subscription.expiresAt))
          : null
      }
    });
  } catch (error) {
    return handleError(error, res);
  }
};

// 🔁 GET /api/payments/history
const getPaymentHistory = async (req, res) => {
  try {
    const payments = await Payment.find({ user: req.user._id }).sort({ date: -1 });

    return res.status(200).json({
      success: true,
      data: payments
    });
  } catch (error) {
    return handleError(error, res);
  }
};

// 🔁 POST /api/payments/mpesa/stk-push
const initiateStkPush = async (req, res) => {
  try {
    const { phoneNumber } = req.body;
    const amount = 10;

    const paymentResult = await processMpesaPayment(phoneNumber, amount);

    if (!paymentResult.success) {
      return res.status(400).json({
        success: false,
        message: 'STK Push failed',
        details: paymentResult.error
      });
    }

    return res.status(200).json({
      success: true,
      message: 'STK Push request sent successfully',
      data: paymentResult.data
    });
  } catch (error) {
    return handleError(error, res);
  }
};

// 🔁 MPESA Helper: STK Push
const processMpesaPayment = async (phoneNumber, amount) => {
  try {
    const sanitizedPhone = phoneNumber.replace(/^0/, '254').replace(/\D/g, '');

    if (!sanitizedPhone.match(/^254[17]\d{8}$/)) {
      throw new Error('Invalid Kenyan phone number. Format: 2547XXXXXXXX');
    }

    const accessToken = await getMpesaAccessToken();
    const timestamp = new Date().toISOString().replace(/[-:.TZ]/g, '').slice(0, 14);
    const password = Buffer.from(`${process.env.MPESA_PAYBILL}${process.env.MPESA_PASSKEY}${timestamp}`).toString('base64');

    const response = await axios.post(
      'https://api.safaricom.co.ke/mpesa/stkpush/v1/processrequest',
      {
        BusinessShortCode: process.env.MPESA_PAYBILL,
        Password: password,
        Timestamp: timestamp,
        TransactionType: 'CustomerPayBillOnline',
        Amount: amount,
        PartyA: sanitizedPhone,
        PartyB: process.env.MPESA_PAYBILL,
        PhoneNumber: sanitizedPhone,
        CallBackURL: `${process.env.API_BASE_URL}/api/payments/mpesa/callback`,
        AccountReference: 'DATING-APP-SUB',
        TransactionDesc: 'Dating App Subscription'
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
      data: {
        transactionId: response.data.CheckoutRequestID,
        reference: response.data.MerchantRequestID
      }
    };
  } catch (error) {
    console.error('M-Pesa payment error:', error.response?.data || error.message);
    return {
      success: false,
      error: error.response?.data || error.message
    };
  }
};

// 🔁 MPESA Helper: Access Token
const getMpesaAccessToken = async () => {
  try {
    const response = await axios.get(
      'https://api.safaricom.co.ke/oauth/v1/generate?grant_type=client_credentials',
      {
        auth: {
          username: process.env.MPESA_CONSUMER_KEY,
          password: process.env.MPESA_CONSUMER_SECRET
        },
        headers: { 'Content-Type': 'application/json' }
      }
    );
    return response.data.access_token;
  } catch (error) {
    console.error('Failed to get M-Pesa access token:', error.response?.data || error.message);
    throw new Error('Failed to authenticate with M-Pesa API');
  }
};

// ✅ Export all
module.exports = {
  processPayment,
  initiateMpesaSubscription,
  handleMpesaCallback,
  verifyPayment,
  getSubscriptionStatus,
  getPaymentHistory,
  initiateStkPush,
  processMpesaPayment,
  getMpesaAccessToken
};
