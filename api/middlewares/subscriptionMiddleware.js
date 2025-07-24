const User = require('../models/user');
const { formatDistanceToNow } = require('date-fns');
const mongoose = require('mongoose');

// Utility function for safe property access
const safeAccess = (obj, path, fallback = null) => {
  return path.split('.').reduce((acc, key) => 
    (acc && typeof acc === 'object' && key in acc) ? acc[key] : fallback, 
    obj
  );
};

/**
 * Main subscription check middleware with enhanced safety
 */
const checkSubscription = async (req, res, next) => {
  try {
    // 1. Validate authentication
    if (!req.user || !req.user._id) {
      return res.status(401).json({
        success: false,
        message: "Authentication required",
        systemCode: "AUTH_REQUIRED",
        docs: "https://your-api-docs.com/errors/AUTH_REQUIRED"
      });
    }

    // 2. Validate user ID format
    const userId = String(req.user._id);
    if (!mongoose.Types.ObjectId.isValid(userId)) {
      return res.status(400).json({
        success: false,
        message: "Invalid user ID format",
        systemCode: "INVALID_USER_ID"
      });
    }

    // 3. Safe database query
    const user = await User.findById(new mongoose.Types.ObjectId(userId))
      .select('subscription')
      .lean();

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found",
        systemCode: "USER_NOT_FOUND"
      });
    }

    // 4. Process subscription status
    const subscription = user.subscription || {};
    const expiresAt = subscription.expiresAt instanceof Date 
      ? subscription.expiresAt 
      : null;
    const isActive = Boolean(subscription.isActive) && 
      expiresAt && 
      expiresAt > new Date();

    // 5. Attach to request
    req.subscription = {
      isActive,
      expiresAt: expiresAt?.toISOString(),
      timeRemaining: isActive ? formatDistanceToNow(expiresAt) : null,
      type: String(subscription.type || 'none'),
      paymentMethod: String(subscription.paymentMethod || 'unknown')
    };

    next();
  } catch (error) {
    console.error('[SUBSCRIPTION MIDDLEWARE ERROR]', error);

    // Handle specific error types
    if (error instanceof mongoose.Error.CastError) {
      return res.status(400).json({
        success: false,
        message: "Invalid data format",
        systemCode: "DATA_FORMAT_INVALID"
      });
    }

    res.status(500).json({
      success: false,
      message: "Subscription check failed",
      systemCode: "SUBSCRIPTION_CHECK_FAILED",
      debugInfo: process.env.NODE_ENV === 'development' 
        ? { error: error.message } 
        : undefined
    });
  }
};

/**
 * Feature restriction middleware with dynamic messaging
 */
const restrictFreeUsers = (feature, options = {}) => {
  return async (req, res, next) => {
    try {
      // 1. Check if subscription check was run
      if (!req.subscription) {
        await checkSubscription(req, res, () => {});
        if (res.headersSent) return;
      }

      // 2. Check subscription status
      if (!req.subscription.isActive) {
        const defaultMessage = `Subscribe to unlock ${feature} features.`;
        const timeMessage = req.subscription.expiresAt 
          ? ` Your subscription expired ${formatDistanceToNow(new Date(req.subscription.expiresAt))} ago.`
          : '';
        
        return res.status(403).json({
          success: false,
          message: options.customMessage || (defaultMessage + timeMessage),
          systemCode: "SUBSCRIPTION_REQUIRED",
          metadata: {
            feature,
            required: true,
            upgradeUrl: "/api/payments/subscribe",
            currentStatus: {
              isActive: false,
              expiresAt: req.subscription.expiresAt,
              type: req.subscription.type
            }
          }
        });
      }

      // 3. Additional feature-specific checks
      if (feature === 'messaging') {
        const recipientId = req.params.recipientId || req.body.recipientId;
        if (recipientId) {
          const recipient = await User.findById(recipientId)
            .select('subscription')
            .lean();
          
          if (!recipient?.subscription?.isActive) {
            req.recipientSubscriptionStatus = {
              needsSubscription: true,
              recipientId: String(recipientId)
            };
          }
        }
      }

      next();
    } catch (error) {
      console.error('[FEATURE RESTRICTION ERROR]', error);
      res.status(500).json({
        success: false,
        message: "Feature access check failed",
        systemCode: "FEATURE_CHECK_FAILED"
      });
    }
  };
};

/**
 * Specialized messaging permission checker
 */
const checkMessagePermissions = async (req, res, next) => {
  try {
    // 1. Validate required fields
    const { senderId, receiverId } = req.body;
    if (!senderId || !receiverId) {
      return res.status(400).json({
        success: false,
        message: "Both senderId and receiverId are required",
        systemCode: "MESSAGE_IDS_REQUIRED"
      });
    }

    // 2. Validate ID formats
    if (!mongoose.Types.ObjectId.isValid(senderId) || 
        !mongoose.Types.ObjectId.isValid(receiverId)) {
      return res.status(400).json({
        success: false,
        message: "Invalid user ID format",
        systemCode: "INVALID_USER_ID"
      });
    }

    // 3. Check subscriptions
    const [sender, receiver] = await Promise.all([
      User.findById(new mongoose.Types.ObjectId(senderId))
        .select('subscription')
        .lean(),
      User.findById(new mongoose.Types.ObjectId(receiverId))
        .select('subscription')
        .lean()
    ]);

    // 4. Validate sender subscription
    const senderSubscription = sender?.subscription || {};
    const senderIsActive = Boolean(senderSubscription.isActive) && 
      new Date(senderSubscription.expiresAt) > new Date();

    if (!senderIsActive) {
      return res.status(403).json({
        success: false,
        message: "You need an active subscription to send messages",
        systemCode: "SENDER_SUBSCRIPTION_REQUIRED",
        upgradeUrl: "/api/payments/subscribe"
      });
    }

    // 5. Check receiver subscription
    const receiverSubscription = receiver?.subscription || {};
    const receiverIsActive = Boolean(receiverSubscription.isActive) && 
      new Date(receiverSubscription.expiresAt) > new Date();

    if (!receiverIsActive) {
      req.recipientSubscriptionStatus = {
        needsSubscription: true,
        receiverId: String(receiverId),
        expiresAt: receiverSubscription.expiresAt instanceof Date
          ? receiverSubscription.expiresAt.toISOString()
          : null
      };
    }

    next();
  } catch (error) {
    console.error('[MESSAGE PERMISSION ERROR]', error);
    res.status(500).json({
      success: false,
      message: "Message permission check failed",
      systemCode: "MESSAGE_CHECK_FAILED"
    });
  }
};

/**
 * Subscription status enricher
 */
const enrichSubscriptionStatus = async (req, res, next) => {
  try {
    if (req.user && !req.subscription) {
      await checkSubscription(req, res, () => {});
      if (res.headersSent) return;
    }
    next();
  } catch (error) {
    console.error('[SUBSCRIPTION ENRICH ERROR]', error);
    next(error);
  }
};

module.exports = {
  checkSubscription,
  restrictFreeUsers,
  checkMessagePermissions,
  enrichSubscriptionStatus,
  verifySubscription: checkSubscription // Legacy alias
};