// utils/subscriptionExpiry.js
const User = require('../models/user');
const Notification = require('../models/notification');
const { logError } = require('./errorLogger');
const { formatDistanceToNow } = require('date-fns');

// ======================
// CONFIGURATION
// ======================
const CHECK_INTERVAL = 30 * 60 * 1000; // 30 minutes
const GRACE_PERIOD = 2 * 60 * 60 * 1000; // 2 hours grace period

// ======================
// CORE FUNCTIONS
// ======================

/**
 * Check and deactivate expired subscriptions
 */
const checkExpiredSubscriptions = async () => {
  try {
    const now = new Date();
    const expiryThreshold = new Date(now.getTime() - GRACE_PERIOD);

    // Find users with expired subscriptions
    const expiredUsers = await User.find({
      'subscription.isActive': true,
      'subscription.expiresAt': { $lt: expiryThreshold }
    }).select('_id name subscription');

    if (expiredUsers.length === 0) {
      return { checked: true, expiredCount: 0 };
    }

    // Deactivate subscriptions
    const updateResult = await User.updateMany(
      {
        _id: { $in: expiredUsers.map(u => u._id) }
      },
      {
        $set: { 'subscription.isActive': false }
      }
    );

    // Create expiry notifications
    await createExpiryNotifications(expiredUsers);

    return {
      checked: true,
      expiredCount: updateResult.modifiedCount,
      users: expiredUsers.map(u => u._id)
    };
  } catch (error) {
    logError('Subscription expiry check failed', error);
    return { checked: false, error: error.message };
  }
};

/**
 * Create notifications for expired subscriptions
 */
const createExpiryNotifications = async (users) => {
  try {
    const notifications = users.map(user => ({
      user: user._id,
      type: 'subscription_expired',
      title: 'Subscription Expired',
      message: 'Your 24-hour chat access has ended. Subscribe again to continue chatting.',
      data: {
        expiredAt: user.subscription.expiresAt,
        duration: formatDistanceToNow(user.subscription.expiresAt)
      }
    }));

    await Notification.insertMany(notifications);

    // Real-time updates if using sockets
    if (global.io) {
      users.forEach(user => {
        global.io.to(`user-${user._id}`).emit('subscription-expired', {
          userId: user._id,
          expiredAt: user.subscription.expiresAt
        });
      });
    }
  } catch (error) {
    logError('Failed to create expiry notifications', error);
  }
};

/**
 * Start periodic subscription checks
 */
const startSubscriptionChecker = () => {
  setInterval(async () => {
    const result = await checkExpiredSubscriptions();
    if (process.env.NODE_ENV === 'development') {
      console.log(`[Subscription Check] Expired: ${result.expiredCount || 0}`);
    }
  }, CHECK_INTERVAL);

  // Initial check
  checkExpiredSubscriptions().then(result => {
    console.log(`Initial subscription check completed. Expired: ${result.expiredCount || 0}`);
  });
};

// ======================
// UTILITY FUNCTIONS
// ======================

/**
 * Check if a user's subscription is active
 */
const isSubscriptionActive = async (userId) => {
  try {
    const user = await User.findById(userId)
      .select('subscription')
      .lean();

    if (!user || !user.subscription) return false;
    
    return user.subscription.isActive && 
           new Date(user.subscription.expiresAt) > new Date();
  } catch (error) {
    logError('Subscription check failed', error, { userId });
    return false;
  }
};

/**
 * Get time remaining for a user's subscription
 */
const getTimeRemaining = async (userId) => {
  try {
    const user = await User.findById(userId)
      .select('subscription')
      .lean();

    if (!user?.subscription?.expiresAt) return null;

    const expiresAt = new Date(user.subscription.expiresAt);
    const now = new Date();

    return {
      isActive: user.subscription.isActive && expiresAt > now,
      expiresAt,
      timeRemaining: expiresAt > now ? formatDistanceToNow(expiresAt) : 'expired'
    };
  } catch (error) {
    logError('Time remaining check failed', error, { userId });
    return null;
  }
};

// ======================
// EXPORTS
// ======================
module.exports = {
  checkExpiredSubscriptions,
  startSubscriptionChecker,
  isSubscriptionActive,
  getTimeRemaining
};