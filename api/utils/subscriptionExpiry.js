// utils/subscriptionExpiry.js
const User = require('../models/user');

async function checkExpiredSubscriptions() {
  try {
    const result = await User.updateMany(
      {
        'subscription.isActive': true,
        'subscription.expiresAt': { $lt: new Date() }
      },
      {
        $set: { 'subscription.isActive': false }
      }
    );
    console.log(`Deactivated ${result.nModified} expired subscriptions`);
  } catch (error) {
    console.error('Subscription expiry check failed:', error);
  }
}

module.exports = checkExpiredSubscriptions;