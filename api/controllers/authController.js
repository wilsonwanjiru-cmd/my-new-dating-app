const crypto = require("crypto");
const jwt = require("jsonwebtoken");
const bcrypt = require("bcrypt");
const User = require("../models/user");
const { initiateSTKPush } = require("../utils/mpesaUtils");
const { logError } = require("../utils/errorLogger");

// Configuration
const isDev = process.env.NODE_ENV === "development";

const JWT_SECRET = process.env.JWT_SECRET || (isDev ? crypto.randomBytes(64).toString("hex") : "");
const JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET || (isDev ? crypto.randomBytes(64).toString("hex") : "");
const SALT_ROUNDS = parseInt(process.env.SALT_ROUNDS) || 12;
const TOKEN_EXPIRY = process.env.TOKEN_EXPIRY || "1h";
const REFRESH_TOKEN_EXPIRY = process.env.REFRESH_TOKEN_EXPIRY || "7d";
const SUBSCRIPTION_AMOUNT = 10;
const SUBSCRIPTION_DURATION = 24 * 60 * 60 * 1000;
const ACCOUNT_LOCK_DURATION = 15 * 60 * 1000;
const MAX_FAILED_ATTEMPTS = 5;

// Sanitize user
const sanitizeUser = (user) => {
  const u = user.toObject ? user.toObject() : user;
  delete u.password;
  delete u.verificationTokens;
  delete u.__v;
  delete u.resetToken;
  delete u.resetTokenExpiry;
  delete u.refreshToken;
  delete u.failedLoginAttempts;
  delete u.accountLocked;
  delete u.lockUntil;
  return u;
};

// Error handler
const errorResponse = (res, status, code, message, error = null) => {
  const response = { success: false, code, message };
  if (error && isDev) {
    response.error = error.message;
    response.stack = error.stack;
  }
  logError(message, error, { code, status });
  return res.status(status).json(response);
};

// Token generator
const generateTokens = (user) => {
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

  return { token, refreshToken };
};

// Register
exports.register = async (req, res) => {
  try {
    const { name, email, password, phoneNumber } = req.body;

    if (!name || !email || !password || !phoneNumber) {
      return errorResponse(res, 400, "MISSING_FIELDS", "All fields are required");
    }

    if (!/^\+?254[0-9]{9}$/.test(phoneNumber)) {
      return errorResponse(res, 400, "INVALID_PHONE", "Valid Kenyan phone number required (+254XXXXXXXXX)");
    }

    const existingUser = await User.findOne({ $or: [{ email }, { phoneNumber }] });
    if (existingUser) {
      const field = existingUser.email === email ? "email" : "phoneNumber";
      return errorResponse(res, 409, `${field.toUpperCase()}_EXISTS`, `${field} already registered`);
    }

    const hashedPassword = await bcrypt.hash(password, SALT_ROUNDS);
    const user = await User.create({
      name,
      email,
      password: hashedPassword,
      phoneNumber,
      location: {
        type: "Point",
        coordinates: [36.8219, -1.2921] // Default Nairobi
      }
    });

    const { token, refreshToken } = generateTokens(user);
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

// Login
exports.login = async (req, res) => {
  try {
    const { email, password } = req.body;

    const user = await User.findOne({ email })
      .select("+password +refreshToken +failedLoginAttempts +accountLocked +lockUntil");

    if (!user) {
      return errorResponse(res, 401, "INVALID_CREDENTIALS", "Invalid email or password");
    }

    if (user.accountLocked && user.lockUntil > new Date()) {
      const timeLeft = Math.ceil((user.lockUntil - new Date()) / 60000);
      return errorResponse(res, 403, "ACCOUNT_LOCKED", `Account locked. Try again in ${timeLeft} minutes`);
    }

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      user.failedLoginAttempts += 1;

      if (user.failedLoginAttempts >= MAX_FAILED_ATTEMPTS) {
        user.accountLocked = true;
        user.lockUntil = new Date(Date.now() + ACCOUNT_LOCK_DURATION);
      }

      await user.save();
      return errorResponse(res, 401, "INVALID_CREDENTIALS", "Invalid email or password");
    }

    user.failedLoginAttempts = 0;
    user.accountLocked = false;
    user.lockUntil = null;
    user.lastLogin = new Date();

    const { token, refreshToken } = generateTokens(user);
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

// ✅ Refresh Token
exports.refreshToken = async (req, res) => {
  try {
    const { refreshToken } = req.body;

    if (!refreshToken) {
      return errorResponse(res, 400, "MISSING_TOKEN", "Refresh token is required");
    }

    let decoded;
    try {
      decoded = jwt.verify(refreshToken, JWT_REFRESH_SECRET);
    } catch (err) {
      return errorResponse(res, 403, "INVALID_TOKEN", "Refresh token is invalid or expired", err);
    }

    const user = await User.findById(decoded.userId);
    if (!user || user.refreshToken !== refreshToken) {
      return errorResponse(res, 403, "TOKEN_MISMATCH", "Token mismatch or user not found");
    }

    const { token: newToken, refreshToken: newRefreshToken } = generateTokens(user);
    user.refreshToken = newRefreshToken;
    await user.save();

    return res.status(200).json({
      success: true,
      message: "Token refreshed successfully",
      token: newToken,
      refreshToken: newRefreshToken
    });

  } catch (error) {
    return errorResponse(res, 500, "REFRESH_FAILED", "Token refresh failed", error);
  }
};

// Verify Token
exports.verifyToken = async (req, res) => {
  try {
    const token = req.headers.authorization?.split(" ")[1];
    if (!token) return errorResponse(res, 401, "NO_TOKEN", "Token missing");

    const decoded = jwt.verify(token, JWT_SECRET);
    const user = await User.findById(decoded.userId);

    if (!user) return errorResponse(res, 404, "USER_NOT_FOUND", "User not found");

    res.status(200).json({
      success: true,
      valid: true,
      user: {
        id: user._id,
        isSubscribed: user.subscription?.isActive,
        subscriptionExpiresAt: user.subscription?.expiresAt,
        freeUploadsUsed: user.freeUploadsUsed || 0
      }
    });

  } catch (error) {
    return errorResponse(res, 401, "INVALID_TOKEN", "Token invalid or expired", error);
  }
};

// Authenticate middleware
exports.authenticate = async (req, res, next) => {
  try {
    const token = req.headers.authorization?.split(" ")[1];
    if (!token) return errorResponse(res, 401, "NO_TOKEN", "Authorization required");

    const decoded = jwt.verify(token, JWT_SECRET);
    const user = await User.findById(decoded.userId);

    if (!user) return errorResponse(res, 401, "USER_NOT_FOUND", "User not found");

    req.user = user;
    next();
  } catch (error) {
    return errorResponse(res, 401, "AUTH_ERROR", "Authentication failed", error);
  }
};

// Logout
exports.logout = async (req, res) => {
  try {
    const user = await User.findById(req.user._id);
    if (user) {
      user.refreshToken = null;
      await user.save();
    }

    res.status(200).json({ success: true, message: "Logged out successfully" });
  } catch (error) {
    errorResponse(res, 500, "LOGOUT_FAILED", "Logout failed", error);
  }
};

// Subscription and M-Pesa handlers (unchanged)
exports.initiateSubscription = async (req, res) => { /* ... */ };
exports.handlePaymentCallback = async (req, res) => { /* ... */ };
exports.getCurrentUser = async (req, res) => { /* ... */ };
