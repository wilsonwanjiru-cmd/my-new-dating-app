const User = require('../models/user');
const { formatDistanceToNow } = require('date-fns');

// Main subscription check middleware
const checkSubscription = async (req, res, next) => {
  try {
    const userId = req.user._id;
    const user = await User.findById(userId).select('subscription');
    
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    const isActive = user.subscription?.isActive && 
                    new Date(user.subscription.expiresAt) > new Date();
    
    // Attach subscription info to request
    req.subscription = {
      isActive,
      expiresAt: user.subscription?.expiresAt,
      timeRemaining: isActive 
        ? formatDistanceToNow(new Date(user.subscription.expiresAt))
        : null
    };

    next();
  } catch (error) {
    console.error('Subscription check error:', error);
    res.status(500).json({
      success: false,
      message: 'Error checking subscription status'
    });
  }
};

// Feature restriction middleware
const restrictFreeUsers = (feature, options = {}) => {
  return async (req, res, next) => {
    try {
      if (!req.subscription?.isActive) {
        const message = options.customMessage || 
          `Subscribe for KES 10 to unlock ${feature}. ${req.subscription?.timeRemaining ? 
            `Your subscription expired ${req.subscription.timeRemaining} ago` : ''}`;

        return res.status(403).json({
          success: false,
          message: message.trim(),
          upgradeUrl: '/api/payments/subscribe',
          code: 'SUBSCRIPTION_REQUIRED',
          metadata: {
            feature,
            subscriptionActive: false,
            ...(req.subscription?.expiresAt && {
              expiredAt: req.subscription.expiresAt
            })
          }
        });
      }

      // Additional checks for specific features
      if (feature === 'messaging') {
        const recipientId = req.params.recipientId || req.body.recipientId;
        if (recipientId) {
          const recipient = await User.findById(recipientId).select('subscription');
          if (!recipient?.subscription?.isActive) {
            req.recipientNeedsSubscription = true;
          }
        }
      }

      next();
    } catch (error) {
      console.error('Feature restriction error:', error);
      next(error);
    }
  };
};

// Specialized middleware for messaging
const checkMessagePermissions = async (req, res, next) => {
  try {
    const { senderId, receiverId } = req.body;
    
    const [sender, receiver] = await Promise.all([
      User.findById(senderId).select('subscription'),
      User.findById(receiverId).select('subscription')
    ]);

    if (!sender?.subscription?.isActive) {
      return res.status(403).json({
        success: false,
        message: 'You need an active subscription to send messages',
        upgradeUrl: '/api/payments/subscribe'
      });
    }

    if (!receiver?.subscription?.isActive) {
      req.recipientNeedsSubscription = true;
    }

    next();
  } catch (error) {
    console.error('Message permission check error:', error);
    res.status(500).json({
      success: false,
      message: 'Error checking message permissions'
    });
  }
};

// Subscription status enrichment
const enrichSubscriptionStatus = (req, res, next) => {
  if (req.user && !req.subscription) {
    return checkSubscription(req, res, next);
  }
  next();
};

module.exports = {
  checkSubscription,
  restrictFreeUsers,
  checkMessagePermissions,
  enrichSubscriptionStatus,
  // Legacy export for backward compatibility
  verifySubscription: checkSubscription
};
