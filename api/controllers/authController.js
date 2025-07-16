const crypto = require("crypto");
const jwt = require("jsonwebtoken");
const bcrypt = require("bcrypt");
const User = require("../models/user");
const { initiateSTKPush } = require("../utils/mpesaUtils");
const { logError } = require("../utils/errorLogger");

// Configuration with fallbacks
const JWT_SECRET = process.env.JWT_SECRET || crypto.randomBytes(64).toString("hex");
const JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET || crypto.randomBytes(64).toString("hex");
const SALT_ROUNDS = parseInt(process.env.SALT_ROUNDS) || 12;
const TOKEN_EXPIRY = process.env.TOKEN_EXPIRY || "1h";
const REFRESH_TOKEN_EXPIRY = process.env.REFRESH_TOKEN_EXPIRY || "7d";
const SUBSCRIPTION_AMOUNT = 10; // KES 10
const SUBSCRIPTION_DURATION = 24 * 60 * 60 * 1000; // 24 hours in ms

// Helper function to sanitize user data
const sanitizeUser = (user) => {
  if (!user) return null;
  
  const userObj = user.toObject ? user.toObject() : user;
  delete userObj.password;
  delete userObj.verificationTokens;
  delete userObj.__v;
  delete userObj.resetToken;
  delete userObj.resetTokenExpiry;
  return userObj;
};

// Enhanced error response handler
const errorResponse = (res, status, code, message, error = null) => {
  const response = {
    success: false,
    code,
    message
  };

  if (error && process.env.NODE_ENV === "development") {
    response.error = error.message;
    response.stack = error.stack;
  }

  logError(message, error, { code, status });
  return res.status(status).json(response);
};

// Enhanced Registration
exports.register = async (req, res) => {
  try {
    const { name, email, password, phoneNumber } = req.body;

    // Validation
    if (!name || !email || !password || !phoneNumber) {
      return errorResponse(res, 400, "MISSING_FIELDS", "All fields are required");
    }

    if (!/^\+?254[0-9]{9}$/.test(phoneNumber)) {
      return errorResponse(res, 400, "INVALID_PHONE", "Valid Kenyan phone number required (+254XXXXXXXXX)");
    }

    if (password.length < 8) {
      return errorResponse(res, 400, "WEAK_PASSWORD", "Password must be at least 8 characters");
    }

    // Check existing user
    const existingUser = await User.findOne({ $or: [{ email }, { phoneNumber }] });
    if (existingUser) {
      const field = existingUser.email === email ? "email" : "phoneNumber";
      return errorResponse(res, 409, `${field.toUpperCase()}_EXISTS`, `${field} already registered`);
    }

    // Create user
    const hashedPassword = await bcrypt.hash(password, SALT_ROUNDS);
    const user = await User.create({
      name,
      email,
      password: hashedPassword,
      phoneNumber,
      location: {
        type: "Point",
        coordinates: [36.8219, -1.2921] // Default Nairobi coordinates
      }
    });

    // Generate tokens
    const token = jwt.sign(
      { 
        userId: user._id,
        phoneNumber: user.phoneNumber,
        isSubscribed: false
      },
      JWT_SECRET,
      { expiresIn: TOKEN_EXPIRY }
    );

    const refreshToken = jwt.sign(
      { userId: user._id },
      JWT_REFRESH_SECRET,
      { expiresIn: REFRESH_TOKEN_EXPIRY }
    );

    // Store refresh token
    user.refreshToken = refreshToken;
    await user.save();

    res.status(201).json({
      success: true,
      message: "Registration successful",
      token,
      refreshToken,
      user: sanitizeUser(user)
    });

  } catch (error) {
    errorResponse(res, 500, "REGISTRATION_FAILED", "Registration failed", error);
  }
};

// Enhanced Login with security features
exports.login = async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return errorResponse(res, 400, "MISSING_CREDENTIALS", "Email and password required");
    }

    const user = await User.findOne({ email })
      .select("+password +loginCount +refreshToken +failedLoginAttempts +accountLocked");
    
    if (!user) {
      return errorResponse(res, 401, "INVALID_CREDENTIALS", "Invalid credentials");
    }

    // Check if account is locked
    if (user.accountLocked && user.lockUntil > new Date()) {
      return errorResponse(res, 403, "ACCOUNT_LOCKED", "Account temporarily locked due to multiple failed attempts");
    }

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      // Track failed attempts
      user.failedLoginAttempts += 1;
      
      // Lock account after 5 failed attempts for 15 minutes
      if (user.failedLoginAttempts >= 5) {
        user.accountLocked = true;
        user.lockUntil = new Date(Date.now() + 15 * 60 * 1000); // 15 minutes
      }
      
      await user.save();
      return errorResponse(res, 401, "INVALID_CREDENTIALS", "Invalid credentials");
    }

    // Reset security counters on successful login
    user.failedLoginAttempts = 0;
    user.accountLocked = false;
    user.loginCount += 1;
    user.lastLogin = new Date();

    // Generate new tokens
    const isSubscribed = user.subscription?.isActive && 
                         new Date(user.subscription.expiresAt) > new Date();

    const token = jwt.sign(
      {
        userId: user._id,
        isSubscribed,
        expiresAt: user.subscription?.expiresAt
      },
      JWT_SECRET,
      { expiresIn: TOKEN_EXPIRY }
    );

    const refreshToken = jwt.sign(
      { userId: user._id },
      JWT_REFRESH_SECRET,
      { expiresIn: REFRESH_TOKEN_EXPIRY }
    );

    // Store refresh token
    user.refreshToken = refreshToken;
    await user.save();

    res.status(200).json({
      success: true,
      message: "Login successful",
      token,
      refreshToken,
      user: sanitizeUser(user)
    });

  } catch (error) {
    errorResponse(res, 500, "LOGIN_FAILED", "Login failed", error);
  }
};

// Token Refresh Endpoint
exports.refreshToken = async (req, res) => {
  try {
    const { refreshToken } = req.body;

    if (!refreshToken) {
      return errorResponse(res, 400, "MISSING_TOKEN", "Refresh token required");
    }

    const decoded = jwt.verify(refreshToken, JWT_REFRESH_SECRET);
    const user = await User.findById(decoded.userId);

    if (!user || user.refreshToken !== refreshToken) {
      return errorResponse(res, 403, "INVALID_TOKEN", "Invalid refresh token");
    }

    // Generate new tokens
    const isSubscribed = user.subscription?.isActive && 
                         new Date(user.subscription.expiresAt) > new Date();

    const newToken = jwt.sign(
      {
        userId: user._id,
        isSubscribed,
        expiresAt: user.subscription?.expiresAt
      },
      JWT_SECRET,
      { expiresIn: TOKEN_EXPIRY }
    );

    const newRefreshToken = jwt.sign(
      { userId: user._id },
      JWT_REFRESH_SECRET,
      { expiresIn: REFRESH_TOKEN_EXPIRY }
    );

    // Update refresh token
    user.refreshToken = newRefreshToken;
    await user.save();

    res.status(200).json({
      success: true,
      token: newToken,
      refreshToken: newRefreshToken
    });

  } catch (error) {
    if (error.name === "TokenExpiredError") {
      return errorResponse(res, 401, "TOKEN_EXPIRED", "Refresh token expired");
    }
    errorResponse(res, 401, "INVALID_TOKEN", "Invalid refresh token", error);
  }
};

// Token Verification with enhanced checks
exports.verifyToken = async (req, res) => {
  try {
    const token = req.headers.authorization?.split(" ")[1];
    if (!token) {
      return errorResponse(res, 401, "NO_TOKEN", "Authorization token required");
    }

    const decoded = jwt.verify(token, JWT_SECRET);
    const user = await User.findById(decoded.userId);

    if (!user) {
      return errorResponse(res, 404, "USER_NOT_FOUND", "User not found");
    }

    const isSubscribed = user.subscription?.isActive && 
                         new Date(user.subscription.expiresAt) > new Date();

    res.status(200).json({
      success: true,
      valid: true,
      user: {
        id: user._id,
        isSubscribed,
        subscriptionExpiresAt: user.subscription?.expiresAt,
        freeUploadsUsed: user.freeUploadsUsed || 0
      }
    });

  } catch (error) {
    errorResponse(res, 401, "INVALID_TOKEN", "Invalid or expired token", error);
  }
};

// Enhanced Authentication Middleware
exports.authenticate = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith("Bearer ")) {
      return errorResponse(res, 401, "INVALID_AUTH_HEADER", "Bearer token required");
    }

    const token = authHeader.split(" ")[1];
    const decoded = jwt.verify(token, JWT_SECRET);
    
    const user = await User.findById(decoded.userId);
    if (!user) {
      return errorResponse(res, 401, "USER_NOT_FOUND", "User account not found");
    }

    // Check token expiration
    if (decoded.exp < Date.now() / 1000) {
      return errorResponse(res, 401, "TOKEN_EXPIRED", "Session expired");
    }

    // Attach user to request
    req.user = user;
    next();
  } catch (error) {
    if (error.name === "TokenExpiredError") {
      return errorResponse(res, 401, "TOKEN_EXPIRED", "Session expired", error);
    }
    if (error.name === "JsonWebTokenError") {
      return errorResponse(res, 401, "INVALID_TOKEN", "Invalid token", error);
    }
    errorResponse(res, 500, "AUTH_FAILED", "Authentication failed", error);
  }
};

// Logout endpoint
exports.logout = async (req, res) => {
  try {
    const user = await User.findById(req.user._id);
    if (user) {
      user.refreshToken = null;
      await user.save();
    }

    res.status(200).json({
      success: true,
      message: "Logged out successfully"
    });
  } catch (error) {
    errorResponse(res, 500, "LOGOUT_FAILED", "Logout failed", error);
  }
};

// M-Pesa Subscription with enhanced validation
exports.initiateSubscription = async (req, res) => {
  try {
    const user = await User.findById(req.user.id);
    if (!user) {
      return errorResponse(res, 404, "USER_NOT_FOUND", "User not found");
    }

    // Check existing subscription
    if (user.subscription?.isActive && new Date(user.subscription.expiresAt) > new Date()) {
      return errorResponse(res, 400, "ACTIVE_SUBSCRIPTION", "You already have an active subscription");
    }

    // Initiate payment
    const paymentData = {
      phoneNumber: user.phoneNumber,
      amount: SUBSCRIPTION_AMOUNT,
      accountReference: `DatingApp-${user._id}`,
      transactionDesc: "Premium Subscription"
    };

    const stkResponse = await initiateSTKPush(paymentData);

    res.status(200).json({
      success: true,
      message: "Payment initiated",
      data: stkResponse
    });

  } catch (error) {
    errorResponse(res, 500, "SUBSCRIPTION_FAILED", "Subscription initiation failed", error);
  }
};

// Enhanced M-Pesa Callback Handler
exports.handlePaymentCallback = async (req, res) => {
  try {
    const { Body: { stkCallback: callback } } = req.body;
    
    if (callback.ResultCode !== 0) {
      logError("Payment failed", null, { resultDesc: callback.ResultDesc });
      return errorResponse(res, 400, "PAYMENT_FAILED", callback.ResultDesc);
    }

    // Extract payment details
    const metadata = callback.CallbackMetadata?.Item || [];
    const getMetadataValue = (name) => metadata.find(item => item.Name === name)?.Value;

    const amount = getMetadataValue("Amount");
    const mpesaCode = getMetadataValue("MpesaReceiptNumber");
    const phoneNumber = getMetadataValue("PhoneNumber");
    const accountReference = getMetadataValue("AccountReference");

    if (!amount || !mpesaCode || !phoneNumber || !accountReference) {
      return errorResponse(res, 400, "INVALID_CALLBACK", "Invalid payment data");
    }

    // Validate payment amount
    if (parseInt(amount) !== SUBSCRIPTION_AMOUNT) {
      return errorResponse(res, 400, "INVALID_AMOUNT", `Payment amount must be KES ${SUBSCRIPTION_AMOUNT}`);
    }

    // Find and update user
    const userId = accountReference.replace("DatingApp-", "");
    const user = await User.findById(userId);
    if (!user) {
      return errorResponse(res, 404, "USER_NOT_FOUND", "User account not found");
    }

    // Update subscription
    const expiresAt = new Date(Date.now() + SUBSCRIPTION_DURATION);
    user.subscription = {
      isActive: true,
      expiresAt,
      lastPayment: {
        amount: SUBSCRIPTION_AMOUNT,
        date: new Date(),
        mpesaCode,
        phoneNumber
      },
      paymentHistory: [
        ...(user.subscription?.paymentHistory || []),
        {
          amount: SUBSCRIPTION_AMOUNT,
          date: new Date(),
          mpesaCode,
          phoneNumber
        }
      ]
    };

    await user.save();

    res.status(200).json({
      success: true,
      message: "Subscription activated"
    });

  } catch (error) {
    errorResponse(res, 500, "CALLBACK_ERROR", "Error processing payment", error);
  }
};

// Get Current User Profile
exports.getCurrentUser = async (req, res) => {
  try {
    const user = await User.findById(req.user.id);
    if (!user) {
      return errorResponse(res, 404, "USER_NOT_FOUND", "User not found");
    }

    res.status(200).json({
      success: true,
      user: sanitizeUser(user)
    });
  } catch (error) {
    errorResponse(res, 500, "SERVER_ERROR", "Failed to fetch user data", error);
  }
};