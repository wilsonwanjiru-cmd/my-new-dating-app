const jwt = require('jsonwebtoken');
const User = require('../models/user');
const { logError } = require('../utils/errorLogger');

const JWT_SECRET = process.env.JWT_SECRET;
const SUBSCRIPTION_REQUIRED_ENDPOINTS = [
  // All chat-related write operations
  '/api/chats/send',
  '/api/chats/initiate',
  '/api/chats/initiate-from-photo',
  '/api/chats/update',
  '/api/messages/send'
];

// Critical routes that require complete profile
const GENDER_REQUIRED_ENDPOINTS = [
  '/api/likes',
  '/api/users',
  '/api/photos/feed',
  '/api/chats'
];

/**
 * ==================== UTILITY FUNCTIONS ====================
 */
// Check if subscription is currently active
const isSubscriptionActive = (subscription) => {
  if (!subscription) return false;
  return subscription.expiresAt > new Date();
};

/**
 * ==================== AUTHENTICATION ====================
 */
const authenticate = async (req, res, next) => {
  try {
    // Skip authentication for test endpoints
    if (['/test', '/test-simple'].includes(req.path)) {
      return next();
    }

    // 1️⃣ Get token from Authorization header
    let token = req.headers.authorization;
    if (token?.startsWith('Bearer ')) {
      token = token.split(' ')[1];
    }

    if (!token) {
      return res.status(401).json({
        success: false,
        code: 'MISSING_TOKEN',
        message: 'Authorization token required'
      });
    }

    // 2️⃣ Verify token
    let decoded;
    try {
      decoded = jwt.verify(token, JWT_SECRET);
    } catch (error) {
      if (error.name === 'TokenExpiredError') {
        return res.status(401).json({
          success: false,
          code: 'TOKEN_EXPIRED',
          message: 'Session expired. Please login again',
          action: 'refresh'
        });
      }
      return res.status(401).json({
        success: false,
        code: 'INVALID_TOKEN',
        message: 'Invalid or malformed token'
      });
    }

    // 3️⃣ Find user with profileComplete status
    const user = await User.findById(decoded.userId)
      .select('+activeSessions +accountLocked +lockUntil +loginAttempts +gender +genderPreference +subscription');

    if (!user) {
      return res.status(401).json({
        success: false,
        code: 'USER_NOT_FOUND',
        message: 'User account not found'
      });
    }

    // 4️⃣ Check account lock
    if (user.accountLocked && new Date(user.lockUntil) > new Date()) {
      const timeLeft = Math.ceil((new Date(user.lockUntil) - Date.now()) / 60000);
      return res.status(403).json({
        success: false,
        code: 'ACCOUNT_LOCKED',
        message: `Account temporarily locked. Try again in ${timeLeft} minutes`,
        unlockTime: user.lockUntil
      });
    }

    // 5️⃣ Critical routes require gender settings
    const requiresGender = GENDER_REQUIRED_ENDPOINTS.some(path =>
      req.path.startsWith(path)
    );
    
    if (requiresGender && (!user.gender || !user.genderPreference || user.genderPreference.length === 0)) {
      return res.status(403).json({
        success: false,
        code: 'GENDER_REQUIRED',
        message: 'Please complete your gender selection to continue',
        redirectTo: '/api/auth/select-gender',
        requiredFields: {
          gender: !user.gender,
          genderPreference: !user.genderPreference || user.genderPreference.length === 0
        }
      });
    }

    // 6️⃣ Calculate current subscription status
    const isSubscribed = isSubscriptionActive(user.subscription);
    
    // 7️⃣ Subscription check for premium features
    const requiresSubscription = SUBSCRIPTION_REQUIRED_ENDPOINTS.some(path =>
      req.path.startsWith(path)
    );
    
    if (requiresSubscription && !isSubscribed) {
      return res.status(403).json({
        success: false,
        code: 'SUBSCRIPTION_REQUIRED',
        message: 'Subscribe to access chat features (KES 10/24hr)',
        upgradeUrl: '/api/subscribe'
      });
    }

    // 8️⃣ Update last active timestamp
    if (req.path !== '/logout') {
      user.lastActive = new Date();
      await user.save();
    }

    // 9️⃣ Attach user to request
    req.user = {
      _id: user._id,
      name: user.name,
      email: user.email,
      phoneNumber: user.phoneNumber,
      gender: user.gender,
      genderPreference: user.genderPreference,
      isOnline: user.isOnline,
      lastActive: user.lastActive,
      subscription: user.subscription,
      profileImages: user.profileImages,
      isSubscribed // Add real-time subscription status
    };
    req.token = token;

    next();
  } catch (error) {
    logError('Authentication Error', error, {
      endpoint: req.originalUrl,
      method: req.method,
      body: req.body
    });
    res.status(500).json({
      success: false,
      code: 'AUTH_FAILURE',
      message: 'Authentication system error',
      ...(process.env.NODE_ENV === 'development' && { error: error.message })
    });
  }
};

/**
 * ==================== SUBSCRIPTION CHECK ====================
 */
const checkSubscription = async (req, res, next) => {
  try {
    // Check if already verified in authentication
    if (req.user.isSubscribed) return next();
    
    // Fetch fresh subscription data
    const user = await User.findById(req.user._id).select('subscription');
    
    // Re-validate subscription status
    const isSubscribed = isSubscriptionActive(user.subscription);
    
    if (!isSubscribed) {
      return res.status(403).json({
        success: false,
        code: 'SUBSCRIPTION_REQUIRED',
        message: 'Subscribe to access premium features (KES 10/24hr)',
        upgradeUrl: '/api/subscribe'
      });
    }
    
    // Update request user object
    req.user.isSubscribed = true;
    req.user.subscription = user.subscription;
    next();
  } catch (error) {
    logError('Subscription Check Error', error);
    res.status(500).json({
      success: false,
      code: 'SUBSCRIPTION_VERIFICATION_FAILED',
      message: 'Failed to verify subscription status'
    });
  }
};

/**
 * ==================== ONLINE STATUS CHECK ====================
 */
const checkOnlineStatus = async (req, res, next) => {
  try {
    const user = await User.findById(req.user._id).select('isOnline lastActive');
    
    if (!user.isOnline) {
      return res.status(403).json({
        success: false,
        code: 'OFFLINE_USER',
        message: 'This user is currently offline'
      });
    }
    
    // Update activity timestamp
    user.lastActive = new Date();
    await user.save();
    req.user.lastActive = user.lastActive;
    
    next();
  } catch (error) {
    logError('Online Status Error', error);
    res.status(500).json({
      success: false,
      code: 'STATUS_CHECK_FAILED',
      message: 'Failed to verify online status'
    });
  }
};

/**
 * ==================== GENDER SET CHECK ====================
 */
const checkGenderSet = async (req, res, next) => {
  try {
    // Skip gender check for gender selection endpoints
    if (req.path.includes('/select-gender') || req.path.includes('/me/gender')) {
      return next();
    }
    
    const user = await User.findById(req.user._id).select('gender genderPreference');
    
    if (!user.gender || !user.genderPreference || user.genderPreference.length === 0) {
      return res.status(403).json({
        success: false,
        code: 'GENDER_REQUIRED',
        message: 'Please complete your gender selection to continue',
        redirectTo: '/api/auth/select-gender',
        requiredFields: {
          gender: !user.gender,
          genderPreference: !user.genderPreference || user.genderPreference.length === 0
        }
      });
    }
    
    // Update request user object
    req.user.gender = user.gender;
    req.user.genderPreference = user.genderPreference;
    
    next();
  } catch (error) {
    logError('Gender Verification Error', error);
    res.status(500).json({
      success: false,
      code: 'GENDER_CHECK_FAILED',
      message: 'Failed to verify gender settings'
    });
  }
};

module.exports = {
  authenticate,
  checkSubscription,
  checkOnlineStatus,
  checkGenderSet
};