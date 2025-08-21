const jwt = require("jsonwebtoken");
const mongoose = require("mongoose");
const User = require('../models/user');
const Subscription = require('../models/Subscription');
const { logError } = require('../utils/errorLogger');
const { formatDistanceToNow } = require('date-fns');

// Constants
const SUBSCRIPTION_PRICE = 10; // KES
const SUBSCRIPTION_DURATION_MS = 24 * 60 * 60 * 1000; // 24 hours
const GRACE_PERIOD_MS = 30 * 60 * 1000; // 30 minutes

/**
 * Main subscription validation middleware
 * Validates JWT and checks subscription status
 */
const validateSubscription = async (req, res, next) => {
  try {
    // 1. Authentication check
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) {
      return res.status(401).json({ 
        success: false,
        code: 'AUTH_REQUIRED',
        message: 'Authentication token required'
      });
    }

    // 2. Token verification
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    if (!decoded.userId) {
      return res.status(401).json({
        success: false,
        code: 'INVALID_TOKEN',
        message: 'Invalid authentication token'
      });
    }

    // 3. Get user with subscription details
    const user = await User.findById(decoded.userId)
      .select('subscription')
      .lean();

    if (!user) {
      return res.status(404).json({ 
        success: false,
        code: 'USER_NOT_FOUND',
        message: 'User account not found'
      });
    }

    // 4. Check subscription status with grace period
    const now = new Date();
    const expiresAt = user.subscription?.expiresAt ? new Date(user.subscription.expiresAt) : null;
    const isActive = user.subscription?.isActive && 
                    expiresAt && 
                    (expiresAt.getTime() + GRACE_PERIOD_MS) > now.getTime();

    // 5. Special handling for chat routes
    if (req.path.includes('/chat') || req.path.includes('/messages')) {
      if (!isActive) {
        const latestSub = await Subscription.findOne({ user: decoded.userId })
          .sort({ expiresAt: -1 })
          .lean();

        return res.status(403).json({
          success: false,
          code: 'SUBSCRIPTION_REQUIRED',
          message: `Subscribe for KES ${SUBSCRIPTION_PRICE} to access chat features`,
          data: {
            price: SUBSCRIPTION_PRICE,
            duration: '24 hours',
            paymentMethods: ['M-Pesa'],
            upgradeUrl: '/api/subscribe',
            lastSubscription: latestSub ? {
              expiredAt: latestSub.expiresAt,
              timeSinceExpiry: formatDistanceToNow(latestSub.expiresAt)
            } : null
          }
        });
      }

      // Add subscription headers
      if (isActive && expiresAt) {
        const timeLeft = expiresAt.getTime() - now.getTime();
        res.set({
          'X-Subscription-Expires': expiresAt.toISOString(),
          'X-Subscription-Remaining': Math.floor(timeLeft / 1000)
        });

        if (timeLeft < 60 * 60 * 1000) {
          req.subscriptionExpiringSoon = true;
        }
      }
    }

    // 6. Attach to request
    req.user = {
      _id: decoded.userId,
      hasActiveSubscription: isActive,
      subscription: {
        isActive,
        expiresAt: expiresAt?.toISOString(),
        timeRemaining: isActive ? formatDistanceToNow(expiresAt) : null
      }
    };

    next();
  } catch (error) {
    logError('Subscription validation failed', error, {
      endpoint: req.originalUrl,
      userId: req.user?._id
    });

    if (error.name === 'JsonWebTokenError') {
      return res.status(401).json({ 
        success: false,
        code: 'INVALID_TOKEN',
        message: 'Invalid authentication token'
      });
    }

    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({ 
        success: false,
        code: 'TOKEN_EXPIRED',
        message: 'Your session has expired'
      });
    }

    res.status(500).json({ 
      success: false,
      code: 'SUBSCRIPTION_CHECK_FAILED',
      message: 'Failed to verify subscription status'
    });
  }
};

/**
 * Feature-specific subscription requirement middleware
 */
const requireSubscription = (feature) => async (req, res, next) => {
  if (!req.user?.hasActiveSubscription) {
    return res.status(403).json({
      success: false,
      code: 'SUBSCRIPTION_REQUIRED',
      message: `Subscribe for KES ${SUBSCRIPTION_PRICE} to access ${feature}`,
      data: {
        feature,
        price: SUBSCRIPTION_PRICE,
        duration: '24 hours',
        upgradeUrl: '/api/subscribe'
      }
    });
  }
  next();
};

/**
 * Validates subscription creation request
 */
const validateSubscriptionRequest = [
  // Validate phone number format
  body('phone')
    .trim()
    .notEmpty().withMessage('Phone number is required')
    .matches(/^[0-9]{10,12}$/).withMessage('Invalid phone number format'),
  
  // Validate payment method
  body('paymentMethod')
    .optional()
    .isIn(['mpesa']).withMessage('Only M-Pesa payments are currently supported'),
  
  // Main validation handler
  (req, res, next) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        code: 'VALIDATION_FAILED',
        message: 'Validation failed',
        errors: errors.array()
      });
    }
    next();
  }
];

module.exports = {
  validateSubscription,
  requireSubscription,
  validateSubscriptionRequest
};