const express = require('express');
const router = express.Router();

const PaymentController = require('../controllers/paymentController');
const { authenticate } = require('../middlewares/authMiddleware');
const { checkSubscription } = require('../middlewares/subscriptionMiddleware');
const { formatDistanceToNow } = require('date-fns');

// Utility to verify a controller method exists
const verifyMethod = (controller, methodName) => {
  const fn = controller[methodName];
  if (typeof fn !== 'function') {
    throw new Error(`PaymentController method "${methodName}" is missing or not a function`);
  }
  return fn;
};

// Only skip auth for MPESA callback
router.use((req, res, next) => {
  if (req.path === '/mpesa/callback') return next();
  authenticate(req, res, next);
});

/**
 * @route   POST /api/payments/process
 * @desc    Process direct payment
 */
router.post(
  '/process',
  checkSubscription,
  verifyMethod(PaymentController, 'processPayment')
);

/**
 * @route   POST /api/payments/subscribe
 * @desc    Initiate subscription via MPESA
 */
router.post(
  '/subscribe',
  checkSubscription,
  (req, res, next) => {
    if (req.hasActiveSubscription) {
      return res.status(403).json({
        success: false,
        message: `You already have an active subscription (expires ${formatDistanceToNow(new Date(req.user.subscription.expiresAt))})`
      });
    }
    next();
  },
  verifyMethod(PaymentController, 'initiateMpesaSubscription')
);

/**
 * @route   POST /api/payments/mpesa/callback
 * @desc    Handle MPESA callback
 */
router.post(
  '/mpesa/callback',
  verifyMethod(PaymentController, 'handleMpesaCallback')
);

/**
 * @route   POST /api/payments/mpesa/stk-push
 * @desc    Initiate STK Push
 */
router.post(
  '/mpesa/stk-push',
  verifyMethod(PaymentController, 'initiateStkPush')
);

/**
 * @route   POST /api/payments/verify
 * @desc    Verify payment
 */
router.post(
  '/verify',
  verifyMethod(PaymentController, 'verifyPayment')
);

/**
 * @route   GET /api/payments/status
 * @desc    Get subscription status
 */
router.get(
  '/status',
  verifyMethod(PaymentController, 'getSubscriptionStatus')
);

/**
 * @route   GET /api/payments/history
 * @desc    Get payment history
 */
router.get(
  '/history',
  verifyMethod(PaymentController, 'getPaymentHistory')
);

// Catch-all for unknown routes
router.use('*', (req, res) => {
  res.status(404).json({
    success: false,
    message: 'Payment endpoint not found'
  });
});

module.exports = router;

