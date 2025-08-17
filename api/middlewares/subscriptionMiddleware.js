const User = require('../models/user');
const Subscription = require('../models/Subscription');
const mongoose = require('mongoose');
const { formatDistanceToNow } = require('date-fns');
const { sendPushNotification } = require('../utils/notifications');

// ==================== Constants ====================
const SUBSCRIPTION_PRICE = 10; // KES
const SUBSCRIPTION_DURATION = 24 * 60 * 60 * 1000; // 24 hours in ms
const GRACE_PERIOD = 30 * 60 * 1000; // 30 minutes grace period

// ==================== Utility Functions ====================
const isSubscriptionActive = (subscription) => {
  if (!subscription) return false;
  const now = new Date();
  const expiresAt = new Date(subscription.expiresAt);
  return subscription.isActive && expiresAt > now;
};

const formatTimeRemaining = (expiresAt) => {
  if (!expiresAt) return 'No active subscription';
  const remaining = new Date(expiresAt) - new Date();
  return remaining > 0 
    ? `${Math.ceil(remaining / (60 * 60 * 1000))} hours remaining` 
    : 'Expired';
};

// ==================== Core Middlewares ====================

/**
 * Validates and attaches subscription status to request
 */
const checkSubscriptionStatus = async (req, res, next) => {
  try {
    // 1. Validate user authentication
    if (!req.user?._id) {
      return res.status(401).json({
        success: false,
        code: 'AUTH_REQUIRED',
        message: 'Authentication required'
      });
    }

    // 2. Get current subscription
    const subscription = await Subscription.findOne({
      user: req.user._id,
      type: 'chat'
    }).sort({ expiresAt: -1 });

    // 3. Check if subscription is active (with grace period)
    const now = new Date();
    const isActive = subscription?.isActive && 
                    new Date(subscription.expiresAt).getTime() + GRACE_PERIOD > now.getTime();

    // 4. Attach to request
    req.subscription = {
      isActive,
      type: 'chat',
      price: SUBSCRIPTION_PRICE,
      expiresAt: subscription?.expiresAt,
      timeRemaining: isActive ? formatDistanceToNow(subscription.expiresAt) : null,
      canRenew: !isActive
    };

    next();
  } catch (error) {
    console.error('[SUBSCRIPTION] Status check error:', error);
    res.status(500).json({
      success: false,
      code: 'SUBSCRIPTION_CHECK_FAILED',
      message: 'Failed to check subscription status'
    });
  }
};

/**
 * Restricts access to premium features
 */
const requireSubscription = (feature = 'this feature') => async (req, res, next) => {
  try {
    // 1. Check if subscription status is already loaded
    if (!req.subscription) {
      await checkSubscriptionStatus(req, res, () => {});
      if (res.headersSent) return;
    }

    // 2. Validate subscription
    if (!req.subscription.isActive) {
      return res.status(403).json({
        success: false,
        code: 'SUBSCRIPTION_REQUIRED',
        message: `Subscribe for KES ${SUBSCRIPTION_PRICE} to access ${feature}`,
        data: {
          price: SUBSCRIPTION_PRICE,
          duration: '24 hours',
          paymentMethods: ['M-Pesa'],
          upgradeUrl: '/api/subscribe'
        }
      });
    }

    // 3. Check if subscription is about to expire (<1 hour remaining)
    const expiresAt = new Date(req.subscription.expiresAt);
    const timeLeft = expiresAt - new Date();
    if (timeLeft < 60 * 60 * 1000) { // <1 hour
      req.subscription.isExpiringSoon = true;
      req.subscription.timeLeftMs = timeLeft;
      
      // Notify user if this is their first request with expiring soon status
      if (!req.user.notifiedAboutExpiry) {
        await sendPushNotification(req.user._id, {
          title: 'Subscription Expiring Soon',
          body: `Your chat access expires in ${Math.ceil(timeLeft / (60 * 60 * 1000))} hours`
        });
        await User.updateOne(
          { _id: req.user._id }, 
          { $set: { notifiedAboutExpiry: true } }
        );
      }
    }

    next();
  } catch (error) {
    console.error('[SUBSCRIPTION] Access check error:', error);
    res.status(500).json({
      success: false,
      code: 'SUBSCRIPTION_CHECK_FAILED',
      message: 'Failed to verify subscription access'
    });
  }
};

/**
 * Validates new subscription requests
 */
const validateSubscriptionRequest = async (req, res, next) => {
  try {
    // 1. Validate user
    if (!req.user?._id) {
      return res.status(401).json({
        success: false,
        code: 'AUTH_REQUIRED',
        message: 'Authentication required'
      });
    }

    // 2. Check for existing active subscription
    const activeSub = await Subscription.findOne({
      user: req.user._id,
      isActive: true,
      expiresAt: { $gt: new Date() }
    });

    if (activeSub) {
      return res.status(400).json({
        success: false,
        code: 'ACTIVE_SUBSCRIPTION_EXISTS',
        message: 'You already have an active subscription',
        data: {
          expiresAt: activeSub.expiresAt,
          timeRemaining: formatDistanceToNow(activeSub.expiresAt)
        }
      });
    }

    // 3. Validate payment method
    if (!req.body.phone || !/^[0-9]{10,12}$/.test(req.body.phone)) {
      return res.status(400).json({
        success: false,
        code: 'INVALID_PHONE',
        message: 'Valid phone number required for M-Pesa payment'
      });
    }

    next();
  } catch (error) {
    console.error('[SUBSCRIPTION] Validation error:', error);
    res.status(500).json({
      success: false,
      code: 'SUBSCRIPTION_VALIDATION_FAILED',
      message: 'Failed to validate subscription request'
    });
  }
};

/**
 * Handles subscription renewal checks
 */
const checkRenewalEligibility = async (req, res, next) => {
  try {
    // 1. Get latest subscription even if expired
    const latestSub = await Subscription.findOne({
      user: req.user._id
    }).sort({ expiresAt: -1 });

    // 2. Check if user can renew (either no sub or expired)
    const canRenew = !latestSub || 
                    new Date(latestSub.expiresAt) < new Date();

    if (!canRenew && latestSub.isActive) {
      return res.status(400).json({
        success: false,
        code: 'ACTIVE_SUBSCRIPTION_EXISTS',
        message: 'You already have an active subscription',
        data: {
          expiresAt: latestSub.expiresAt,
          timeRemaining: formatDistanceToNow(latestSub.expiresAt)
        }
      });
    }

    req.canRenewSubscription = canRenew;
    req.latestSubscription = latestSub;
    next();
  } catch (error) {
    console.error('[SUBSCRIPTION] Renewal check error:', error);
    res.status(500).json({
      success: false,
      code: 'RENEWAL_CHECK_FAILED',
      message: 'Failed to check renewal eligibility'
    });
  }
};

// ==================== Specialized Middlewares ====================

/**
 * Validates both parties in a chat have active subscriptions
 */
const validateChatParticipants = async (req, res, next) => {
  try {
    const { senderId, recipientId } = req.body;

    // 1. Validate IDs
    if (!mongoose.Types.ObjectId.isValid(senderId) || 
        !mongoose.Types.ObjectId.isValid(recipientId)) {
      return res.status(400).json({
        success: false,
        code: 'INVALID_USER_ID',
        message: 'Invalid user ID format'
      });
    }

    // 2. Check subscriptions for both users
    const [sender, recipient] = await Promise.all([
      User.findById(senderId).select('subscription'),
      User.findById(recipientId).select('subscription')
    ]);

    // 3. Validate sender subscription
    if (!isSubscriptionActive(sender?.subscription)) {
      return res.status(403).json({
        success: false,
        code: 'SENDER_SUBSCRIPTION_INACTIVE',
        message: 'Your chat subscription has expired',
        data: {
          price: SUBSCRIPTION_PRICE,
          upgradeUrl: '/api/subscribe'
        }
      });
    }

    // 4. Validate recipient subscription (with different message)
    if (!isSubscriptionActive(recipient?.subscription)) {
      req.recipientHasInactiveSubscription = true;
    }

    next();
  } catch (error) {
    console.error('[SUBSCRIPTION] Chat validation error:', error);
    res.status(500).json({
      success: false,
      code: 'CHAT_VALIDATION_FAILED',
      message: 'Failed to validate chat participants'
    });
  }
};

/**
 * Tracks subscription usage and remaining time
 */
const trackSubscriptionUsage = async (req, res, next) => {
  if (!req.subscription?.isActive) return next();

  try {
    const now = new Date();
    const expiresAt = new Date(req.subscription.expiresAt);
    const timeLeft = expiresAt - now;

    // Add headers for client-side tracking
    res.set({
      'X-Subscription-Expires': expiresAt.toISOString(),
      'X-Subscription-Remaining': Math.floor(timeLeft / 1000) // seconds
    });

    // Log usage for analytics
    if (req.method !== 'GET') {
      await Subscription.updateOne(
        { user: req.user._id, expiresAt },
        { $inc: { usageCount: 1 }, $set: { lastUsedAt: now } }
      );
    }

    next();
  } catch (error) {
    console.error('[SUBSCRIPTION] Tracking error:', error);
    next(); // Don't block request for tracking failures
  }
};

// ==================== Exports ====================
module.exports = {
  checkSubscriptionStatus,
  requireSubscription,
  validateSubscriptionRequest,
  checkRenewalEligibility,
  validateChatParticipants,
  trackSubscriptionUsage,
  
  // Legacy/compatibility exports
  checkSubscription: checkSubscriptionStatus,
  restrictFreeUsers: requireSubscription
};