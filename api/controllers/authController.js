const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const mongoose = require('mongoose');
const User = require('../models/user');
const { initiateSTKPush } = require('../utils/mpesaUtils');
const { logError } = require('../utils/errorLogger');
const { sendNotification } = require('../utils/notifications');

// ==========================
// Configuration & Constants
// ==========================
const isDev = process.env.NODE_ENV === 'development';

const JWT_SECRET = process.env.JWT_SECRET || (isDev ? crypto.randomBytes(64).toString('hex') : '');
const JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET || (isDev ? crypto.randomBytes(64).toString('hex') : '');

if (!JWT_SECRET || !JWT_REFRESH_SECRET) {
  throw new Error('JWT secrets must be configured in production environment');
}

const TOKEN_EXPIRY = process.env.TOKEN_EXPIRY || '1h';
const REFRESH_TOKEN_EXPIRY = process.env.REFRESH_TOKEN_EXPIRY || '7d';
const CHAT_SUBSCRIPTION_AMOUNT = 10; // KES 10 for 24-hour chat access
const ACCOUNT_LOCK_DURATION = 15 * 60 * 1000; // 15 minutes
const MAX_FAILED_ATTEMPTS = 5;

// ==========================
// Utility Functions
// ==========================
const sanitizeUser = (user) => {
  if (!user) return null;

  const userObj = user.toObject ? user.toObject() : { ...user };
  [
    'password',
    '__v',
    'resetToken',
    'resetTokenExpires',
    'refreshToken',
    'failedLoginAttempts',
    'accountLocked',
    'lockUntil',
    'socketId',
    'activeSessions',
    'verificationToken',
    'verificationTokenExpires'
  ].forEach(field => delete userObj[field]);

  return userObj;
};

const validationError = (res, field, message) =>
  res.status(400).json({ success: false, error: { field, message } });

const errorResponse = (res, status, code, message, error = null) => {
  logError(`${code}: ${message}`, error, { status });
  return res.status(status).json({
    success: false,
    code,
    message,
    ...(isDev && error && { error: error.message, stack: error.stack })
  });
};

const generateTokens = (user) => {
  if (!user || !user._id) throw new Error('Invalid user for token generation');

  const isSubscribed = user.isSubscribed && 
    user.subscription?.isActive &&
    new Date(user.subscription.expiresAt) > new Date();

  const tokenPayload = {
    userId: user._id,
    isSubscribed,
    profileComplete: user.profileComplete,
    ...(isSubscribed && { expiresAt: user.subscription.expiresAt })
  };

  return {
    token: jwt.sign(tokenPayload, JWT_SECRET, { expiresIn: TOKEN_EXPIRY }),
    refreshToken: jwt.sign({ userId: user._id }, JWT_REFRESH_SECRET, {
      expiresIn: REFRESH_TOKEN_EXPIRY
    })
  };
};

const verifyAuthToken = async (req) => {
  const authHeader = req.headers.authorization || '';
  if (!authHeader.startsWith('Bearer ')) {
    throw { status: 401, code: 'NO_TOKEN', message: 'Authorization token missing' };
  }

  const token = authHeader.split(' ')[1];
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    const user = await User.findById(decoded.userId);
    if (!user) {
      throw { status: 401, code: 'INVALID_SESSION', message: 'This session is no longer active' };
    }
    return user;
  } catch (err) {
    if (err.name === 'TokenExpiredError') {
      throw { status: 401, code: 'TOKEN_EXPIRED', message: 'Session expired, please log in again' };
    }
    throw { status: 401, code: 'INVALID_TOKEN', message: 'Invalid authentication token' };
  }
};

// ==========================
// Controller Methods
// ==========================
const register = async (req, res) => {
  try {
    const { name, email, password, phoneNumber, gender, genderPreference, birthDate } = req.body;

    // Validation checks
    if (!name) return validationError(res, 'name', 'Name is required');
    if (!email) return validationError(res, 'email', 'Email is required');
    if (!password) return validationError(res, 'password', 'Password is required');
    if (!phoneNumber) return validationError(res, 'phoneNumber', 'Phone number is required');
    if (!gender) return validationError(res, 'gender', 'Gender is required');
    if (!birthDate) return validationError(res, 'birthDate', 'Birth date is required');
    if (!genderPreference || !Array.isArray(genderPreference) || genderPreference.length === 0) {
      return validationError(res, 'genderPreference', 'At least one gender preference is required');
    }

    // Phone number validation
    if (!/^(\+?254|0)[17]\d{8}$/.test(phoneNumber)) {
      return validationError(res, 'phoneNumber', 'Valid Kenyan phone number required (format: 07... or 2547...)');
    }

    // Check for existing user
    const existingUser = await User.findOne({ $or: [{ email }, { phoneNumber }] });
    if (existingUser) {
      if (existingUser.email === email) return validationError(res, 'email', 'Email already registered');
      if (existingUser.phoneNumber === phoneNumber) return validationError(res, 'phoneNumber', 'Phone number already registered');
    }

    // Create new user
    const user = await User.create({
      name,
      email,
      password,
      phoneNumber,
      gender,
      genderPreference,
      birthDate,
      profileComplete: true, // Set to true since we have gender and preferences
      location: {
        type: 'Point',
        coordinates: [36.8219, -1.2921], // Default Nairobi coordinates
        lastUpdated: new Date()
      }
    });

    // Generate tokens
    const { token, refreshToken } = generateTokens(user);
    user.refreshToken = refreshToken;
    await user.save();

    res.status(201).json({
      success: true,
      message: 'Registration successful',
      token,
      refreshToken,
      user: sanitizeUser(user)
    });
  } catch (error) {
    errorResponse(res, 500, 'REGISTRATION_FAILED', 'Registration failed', error);
  }
};

const login = async (req, res) => {
  try {
    const { email, password } = req.body;

    const user = await User.findOne({ email }).select(
      '+password +refreshToken +failedLoginAttempts +accountLocked +lockUntil +activeSessions'
    );

    if (!user) return errorResponse(res, 401, 'INVALID_CREDENTIALS', 'Invalid email or password');

    // Check if account is locked
    if (user.accountLocked && user.lockUntil > new Date()) {
      const timeLeft = Math.ceil((user.lockUntil - new Date()) / 60000);
      return errorResponse(res, 403, 'ACCOUNT_LOCKED', `Account locked. Try again in ${timeLeft} minute(s)`);
    }

    // Verify password
    const isMatch = await user.comparePassword(password);
    if (!isMatch) {
      user.failedLoginAttempts = (user.failedLoginAttempts || 0) + 1;
      if (user.failedLoginAttempts >= MAX_FAILED_ATTEMPTS) {
        user.accountLocked = true;
        user.lockUntil = new Date(Date.now() + ACCOUNT_LOCK_DURATION);
      }
      await user.save();
      return errorResponse(res, 401, 'INVALID_CREDENTIALS', 'Invalid email or password');
    }

    // Reset security fields on successful login
    user.failedLoginAttempts = 0;
    user.accountLocked = false;
    user.lockUntil = null;
    user.lastLogin = new Date();
    user.isOnline = true;

    // Generate new tokens
    const { token, refreshToken } = generateTokens(user);
    user.refreshToken = refreshToken;
    await user.save();

    res.status(200).json({
      success: true,
      message: 'Login successful',
      token,
      refreshToken,
      user: sanitizeUser(user)
    });
  } catch (error) {
    errorResponse(res, 500, 'LOGIN_FAILED', 'Login failed', error);
  }
};

const refreshToken = async (req, res) => {
  try {
    const { refreshToken: token } = req.body;
    if (!token) return errorResponse(res, 400, 'MISSING_TOKEN', 'Refresh token is required');

    let decoded;
    try {
      decoded = jwt.verify(token, JWT_REFRESH_SECRET);
    } catch (err) {
      return errorResponse(res, 403, 'INVALID_TOKEN', 'Refresh token is invalid or expired', err);
    }

    const user = await User.findById(decoded.userId);
    if (!user || user.refreshToken !== token) {
      return errorResponse(res, 403, 'TOKEN_MISMATCH', 'Token mismatch or user not found');
    }

    const { token: newToken, refreshToken: newRefreshToken } = generateTokens(user);
    
    // Update refresh token
    user.refreshToken = newRefreshToken;
    await user.save();

    res.status(200).json({
      success: true,
      message: 'Token refreshed successfully',
      token: newToken,
      refreshToken: newRefreshToken
    });
  } catch (error) {
    errorResponse(res, 500, 'REFRESH_FAILED', 'Token refresh failed', error);
  }
};

const logout = async (req, res) => {
  try {
    const user = await verifyAuthToken(req);
    
    // Update user status
    user.refreshToken = null;
    user.isOnline = false;
    await user.save();
    
    res.status(200).json({ success: true, message: 'Logged out successfully' });
  } catch (error) {
    errorResponse(res, error.status || 500, error.code || 'LOGOUT_FAILED', error.message || 'Logout failed', error);
  }
};

const initiateChatSubscription = async (req, res) => {
  try {
    const user = await verifyAuthToken(req);

    // Check for active subscription
    if (user.isSubscribed && 
        user.subscription?.isActive && 
        new Date(user.subscription.expiresAt) > new Date()) {
      return res.status(200).json({
        success: true,
        message: 'You already have an active subscription',
        expiresAt: user.subscription.expiresAt
      });
    }

    // Initiate payment
    const response = await initiateSTKPush(user.phoneNumber, CHAT_SUBSCRIPTION_AMOUNT);

    res.status(200).json({
      success: true,
      message: 'Payment initiated for 24-hour chat access',
      checkoutRequestID: response.CheckoutRequestID,
      amount: CHAT_SUBSCRIPTION_AMOUNT
    });
  } catch (error) {
    errorResponse(res, error.status || 500, error.code || 'SUBSCRIPTION_FAILED', error.message || 'Failed to initiate chat subscription', error);
  }
};

const confirmSubscription = async (req, res) => {
  try {
    const user = await verifyAuthToken(req);
    const { mpesaCode, amount } = req.body;

    // Validate payment amount
    if (amount < CHAT_SUBSCRIPTION_AMOUNT) {
      return errorResponse(res, 400, 'INVALID_AMOUNT', `Minimum subscription amount is KES ${CHAT_SUBSCRIPTION_AMOUNT}`);
    }

    // Calculate expiration time
    const now = new Date();
    const expiresAt = new Date(now.setHours(now.getHours() + 24));

    // Update subscription status
    user.isSubscribed = true;
    user.subscription = {
      isActive: true,
      expiresAt,
      lastPayment: { 
        amount, 
        date: new Date(), 
        mpesaCode 
      }
    };
    await user.save();

    // Regenerate tokens with updated subscription status
    const { token } = generateTokens(user);

    // Send notification
    await sendNotification(user._id, {
      title: 'Subscription Activated',
      body: `Your 24-hour chat access is now active until ${expiresAt.toLocaleString()}`
    });

    res.status(200).json({
      success: true,
      message: 'Chat subscription activated successfully',
      token,
      expiresAt,
      user: sanitizeUser(user)
    });
  } catch (error) {
    errorResponse(res, error.status || 500, error.code || 'SUBSCRIPTION_CONFIRMATION_FAILED', error.message || 'Failed to confirm subscription', error);
  }
};

const updateOnlineStatus = async (req, res) => {
  try {
    const user = await verifyAuthToken(req);
    const { isOnline } = req.body;

    // Update online status
    user.isOnline = isOnline;
    if (isOnline) {
      user.lastActive = new Date();
    }
    await user.save();

    res.status(200).json({
      success: true,
      isOnline: user.isOnline,
      lastActive: user.lastActive
    });
  } catch (error) {
    errorResponse(res, error.status || 500, error.code || 'STATUS_UPDATE_FAILED', error.message || 'Failed to update online status', error);
  }
};

const getCurrentUser = async (req, res) => {
  try {
    const user = await verifyAuthToken(req);
    
    // Update last active time
    user.lastActive = new Date();
    await user.save();
    
    res.status(200).json({ 
      success: true, 
      user: sanitizeUser(user) 
    });
  } catch (error) {
    errorResponse(res, error.status || 500, error.code || 'FETCH_USER_FAILED', error.message || 'Failed to fetch current user', error);
  }
};

const selectGender = async (req, res) => {
  try {
    const user = await verifyAuthToken(req);
    const { gender, genderPreference } = req.body;
    
    // Validate input
    if (!gender && !genderPreference) {
      return errorResponse(res, 400, 'MISSING_DATA', 'Either gender or genderPreference is required');
    }

    // Update user fields
    const updates = {};
    if (gender) updates.gender = gender;
    if (genderPreference) {
      // FIXED: Removed extra parenthesis ')'
      if (!Array.isArray(genderPreference)) {
        return errorResponse(res, 400, 'INVALID_PREFERENCE', 'genderPreference must be an array');
      }
      updates.genderPreference = genderPreference;
    }

    // Update profile complete status
    updates.profileComplete = !!(
      (gender || user.gender) && 
      (genderPreference || user.genderPreference)?.length > 0
    );

    // Apply updates
    Object.assign(user, updates);
    await user.save();

    // Regenerate tokens if profile complete status changed
    let token;
    if (updates.profileComplete && !user.profileComplete) {
      const tokenData = generateTokens(user);
      token = tokenData.token;
    }

    res.status(200).json({
      success: true,
      message: 'Gender preferences updated',
      gender: user.gender,
      genderPreference: user.genderPreference,
      profileComplete: user.profileComplete,
      ...(token && { token })
    });
  } catch (error) {
    errorResponse(res, error.status || 500, error.code || 'GENDER_UPDATE_FAILED', error.message || 'Failed to update gender selection', error);
  }
};

const initiateChat = async (req, res) => {
  try {
    const user = await verifyAuthToken(req);
    const { recipientId } = req.body;
    
    // Validate user subscription
    if (!user.isSubscribed) {
      return errorResponse(res, 403, 'SUBSCRIPTION_REQUIRED', 'You need an active subscription to initiate chats');
    }

    res.status(200).json({ 
      success: true, 
      message: 'Chat initiated successfully', 
      recipientId 
    });
  } catch (error) {
    errorResponse(res, error.status || 500, error.code || 'CHAT_INITIATION_FAILED', error.message || 'Failed to initiate chat', error);
  }
};

// ==========================
// Test Routes
// ==========================
const testController = (req, res) =>
  res.status(200).json({ success: true, message: 'Test controller working', timestamp: new Date().toISOString() });

const testSimple = (req, res) => {
  console.log('Test simple request body:', req.body);
  res.json({ success: true, message: 'Simple test route works', timestamp: new Date().toISOString() });
};

// ==========================
// Exports
// ==========================
module.exports = {
  testController,
  testSimple,
  register,
  login,
  refreshToken,
  logout,
  initiateChatSubscription,
  confirmSubscription,
  updateOnlineStatus,
  getCurrentUser,
  selectGender,
  initiateChat
};