const express = require('express');
const router = express.Router();
const { 
  validateSubscriptionRequest,
  checkSubscriptionStatus 
} = require('../middlewares/subscriptionMiddleware');
const { authenticate } = require('../middlewares/authMiddleware');
const paymentController = require('../controllers/paymentController');
const { logError } = require('../utils/errorLogger');
const { formatDistanceToNow } = require('date-fns');

// Constants
const SUBSCRIPTION_PRICE = 10; // KES
const SUBSCRIPTION_DURATION = '24 hours';

/**
 * @apiDefine PaymentSuccess
 * @apiSuccess {Boolean} success True if payment was successful
 * @apiSuccess {String} message Success message
 * @apiSuccess {Object} data Payment details
 */

/**
 * @apiDefine PaymentError
 * @apiError {Boolean} success False if error occurred
 * @apiError {String} code Error code
 * @apiError {String} message Error message
 */

// MPESA callback doesn't require authentication
router.use((req, res, next) => {
  if (req.path === '/mpesa/callback') return next();
  authenticate(req, res, next);
});

/**
 * @api {post} /payments/subscribe Initiate Subscription
 * @apiName InitiateSubscription
 * @apiGroup Payments
 * @apiDescription Initiate KES 10 daily subscription for chat access
 * 
 * @apiBody {String} phone M-Pesa phone number (format: 2547XXXXXXXX)
 * 
 * @apiUse PaymentSuccess
 * @apiUse PaymentError
 */
router.post(
  '/subscribe',
  validateSubscriptionRequest,
  async (req, res, next) => {
    try {
      // Check existing active subscription
      if (req.user.subscription?.isActive && new Date(req.user.subscription.expiresAt) > new Date()) {
        return res.status(400).json({
          success: false,
          code: 'ACTIVE_SUBSCRIPTION',
          message: `You already have an active subscription`,
          data: {
            expiresAt: req.user.subscription.expiresAt,
            timeRemaining: formatDistanceToNow(new Date(req.user.subscription.expiresAt))
          }
        });
      }

      // Attach pricing details to request
      req.paymentDetails = {
        amount: SUBSCRIPTION_PRICE,
        description: `Ruda Dating 24hr Chat Access - KES ${SUBSCRIPTION_PRICE}`,
        duration: SUBSCRIPTION_DURATION,
        metadata: {
          userId: req.user._id,
          subscriptionType: 'chat'
        }
      };

      next();
    } catch (error) {
      logError('Subscription pre-check failed', error, {
        userId: req.user?._id
      });
      res.status(500).json({
        success: false,
        code: 'SUBSCRIPTION_CHECK_FAILED',
        message: 'Failed to verify subscription status'
      });
    }
  },
  paymentController.initiateSubscription
);

/**
 * @api {post} /payments/mpesa/callback MPESA Callback
 * @apiName MpesaCallback
 * @apiGroup Payments
 * @apiDescription Handle MPESA payment callback
 */
router.post(
  '/mpesa/callback',
  paymentController.handleMpesaCallback
);

/**
 * @api {get} /payments/status Subscription Status
 * @apiName SubscriptionStatus
 * @apiGroup Payments
 * @apiDescription Check current subscription status
 * 
 * @apiUse PaymentSuccess
 * @apiSuccess {Object} data.subscription Current subscription details
 */
router.get(
  '/status',
  checkSubscriptionStatus,
  paymentController.getSubscriptionStatus
);

/**
 * @api {get} /payments/history Payment History
 * @apiName PaymentHistory
 * @apiGroup Payments
 * @apiDescription Get user's payment history
 * 
 * @apiQuery {Number} [page=1] Page number
 * @apiQuery {Number} [limit=10] Items per page
 * 
 * @apiUse PaymentSuccess
 * @apiSuccess {Object[]} data.history Array of payment records
 */
router.get(
  '/history',
  checkSubscriptionStatus,
  paymentController.getPaymentHistory
);

/**
 * @api {post} /payments/verify Verify Payment
 * @apiName VerifyPayment
 * @apiGroup Payments
 * @apiDescription Verify payment status
 * 
 * @apiBody {String} checkoutRequestID M-Pesa checkout request ID
 * 
 * @apiUse PaymentSuccess
 * @apiUse PaymentError
 */
router.post(
  '/verify',
  checkSubscriptionStatus,
  paymentController.verifyPayment
);

// Enhanced error handling
router.use((err, req, res, next) => {
  logError('Payment route error', err, {
    endpoint: req.originalUrl,
    userId: req.user?._id
  });

  if (err.name === 'ValidationError') {
    return res.status(400).json({
      success: false,
      code: 'VALIDATION_ERROR',
      message: err.message
    });
  }

  res.status(500).json({
    success: false,
    code: 'PAYMENT_PROCESSING_ERROR',
    message: 'An error occurred while processing payment'
  });
});

// 404 handler for payment routes
router.use('*', (req, res) => {
  res.status(404).json({
    success: false,
    code: 'ENDPOINT_NOT_FOUND',
    message: 'Payment endpoint not found'
  });
});

module.exports = router;