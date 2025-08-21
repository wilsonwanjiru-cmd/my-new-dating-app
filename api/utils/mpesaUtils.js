const axios = require('axios');
const crypto = require('crypto');
const { v4: uuidv4 } = require('uuid');
const { logError } = require('./errorLogger');

// ======================
// CONFIGURATION
// ======================
const MPESA_ENV = process.env.MPESA_ENV || 'sandbox';
const BASE_URL = MPESA_ENV === 'production' 
  ? 'https://api.safaricom.co.ke' 
  : 'https://sandbox.safaricom.co.ke';

// ======================
// CORE MPESA FUNCTIONS
// ======================

/**
 * Fetch M-Pesa OAuth access token
 */
const fetchAccessToken = async () => {
  try {
    const { MPESA_CONSUMER_KEY, MPESA_CONSUMER_SECRET } = process.env;

    if (!MPESA_CONSUMER_KEY || !MPESA_CONSUMER_SECRET) {
      throw new Error("M-Pesa consumer credentials are missing");
    }

    const credentials = Buffer.from(`${MPESA_CONSUMER_KEY}:${MPESA_CONSUMER_SECRET}`).toString('base64');

    const response = await axios.get(
      `${BASE_URL}/oauth/v1/generate?grant_type=client_credentials`,
      {
        headers: {
          Authorization: `Basic ${credentials}`,
        },
      }
    );

    if (!response.data?.access_token) {
      throw new Error("Access token not found in response");
    }

    return response.data.access_token;
  } catch (error) {
    const errorMsg = error.response?.data?.errorMessage || error.message;
    logError('MPesa token fetch failed', error, {
      endpoint: 'oauth',
      status: error.response?.status
    });
    throw new Error(`MPesa auth failed: ${errorMsg}`);
  }
};

/**
 * Initiate STK Push payment (KES 10 for chat access)
 */
const initiateSTKPush = async (phoneNumber, amount = 10) => {
  try {
    const accessToken = await fetchAccessToken();
    const timestamp = new Date().toISOString().replace(/[-:.]/g, '').slice(0, -5);
    const password = generatePassword(timestamp);
    const transactionId = `RUDADATE${uuidv4().replace(/-/g, '').substring(0, 12)}`;

    const response = await axios.post(
      `${BASE_URL}/mpesa/stkpush/v1/processrequest`,
      {
        BusinessShortCode: process.env.MPESA_PAYBILL,
        Password: password,
        Timestamp: timestamp,
        TransactionType: 'CustomerPayBillOnline',
        Amount: amount,
        PartyA: phoneNumber,
        PartyB: process.env.MPESA_PAYBILL,
        PhoneNumber: phoneNumber,
        CallBackURL: `${process.env.API_BASE_URL}/api/payments/mpesa-callback`,
        AccountReference: 'RudaDatingApp',
        TransactionDesc: 'Chat subscription payment',
      },
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
      }
    );

    if (response.data.ResponseCode !== '0') {
      throw new Error(response.data.ResponseDescription || 'STK push failed');
    }

    return {
      success: true,
      checkoutRequestID: response.data.CheckoutRequestID,
      merchantRequestID: response.data.MerchantRequestID,
      transactionId,
      message: 'Payment request initiated successfully'
    };
  } catch (error) {
    logError('STK Push failed', error, {
      phoneNumber,
      amount,
      endpoint: 'stkpush'
    });
    throw new Error(error.response?.data?.errorMessage || 'Payment initiation failed');
  }
};

/**
 * Verify payment status
 */
const verifyPayment = async (checkoutRequestID) => {
  try {
    const accessToken = await fetchAccessToken();
    const timestamp = new Date().toISOString().replace(/[-:.]/g, '').slice(0, -5);
    const password = generatePassword(timestamp);

    const response = await axios.post(
      `${BASE_URL}/mpesa/stkpushquery/v1/query`,
      {
        BusinessShortCode: process.env.MPESA_PAYBILL,
        Password: password,
        Timestamp: timestamp,
        CheckoutRequestID: checkoutRequestID,
      },
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
      }
    );

    const result = response.data.ResultCode === '0'
      ? { success: true, status: 'completed' }
      : { success: false, status: 'failed' };

    return {
      ...result,
      responseCode: response.data.ResultCode,
      description: response.data.ResultDesc,
      metadata: response.data
    };
  } catch (error) {
    logError('Payment verification failed', error, {
      checkoutRequestID,
      endpoint: 'stkquery'
    });
    throw new Error('Failed to verify payment status');
  }
};

// ======================
// UTILITY FUNCTIONS
// ======================

/**
 * Generate M-Pesa API password
 */
const generatePassword = (timestamp) => {
  const passKey = process.env.MPESA_PASSKEY;
  const businessShortCode = process.env.MPESA_PAYBILL;
  const concatenated = `${businessShortCode}${passKey}${timestamp}`;
  return Buffer.from(concatenated).toString('base64');
};

/**
 * Validate M-Pesa callback (security check)
 */
const validateCallback = (callbackData) => {
  try {
    // Basic validation - expand based on your security requirements
    if (!callbackData.Body?.stkCallback) {
      throw new Error('Invalid callback structure');
    }

    const { ResultCode, CallbackMetadata } = callbackData.Body.stkCallback;
    
    return {
      isValid: ResultCode === '0',
      amount: findCallbackValue(CallbackMetadata, 'Amount'),
      mpesaReceiptNumber: findCallbackValue(CallbackMetadata, 'MpesaReceiptNumber'),
      phoneNumber: findCallbackValue(CallbackMetadata, 'PhoneNumber'),
      transactionDate: findCallbackValue(CallbackMetadata, 'TransactionDate'),
      resultCode: ResultCode
    };
  } catch (error) {
    logError('Callback validation failed', error, { callbackData });
    return { isValid: false };
  }
};

/**
 * Helper to extract values from callback metadata
 */
const findCallbackValue = (metadata, key) => {
  if (!metadata?.Item) return null;
  const item = metadata.Item.find(i => i.Name === key);
  return item?.Value || null;
};

// ======================
// EXPORTS
// ======================
module.exports = {
  fetchAccessToken,
  initiateSTKPush,
  verifyPayment,
  validateCallback
};