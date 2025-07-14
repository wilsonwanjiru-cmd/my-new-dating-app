const crypto = require("crypto");
const jwt = require("jsonwebtoken");
const bcrypt = require("bcrypt"); // Changed from bcryptjs to bcrypt
const User = require("../models/user");
const { initiateSTKPush } = require("../utils/mpesaUtils");


// Configuration
const JWT_SECRET = process.env.JWT_SECRET || crypto.randomBytes(64).toString("hex");
const SALT_ROUNDS = parseInt(process.env.SALT_ROUNDS) || 12;
const SUBSCRIPTION_AMOUNT = 10; // KES 10
const SUBSCRIPTION_DURATION = 24 * 60 * 60 * 1000; // 24 hours in ms

// Helper function to sanitize user data
const sanitizeUser = (user) => {
  const userObj = user.toObject();
  delete userObj.password;
  delete userObj.verificationTokens;
  delete userObj.__v;
  return userObj;
};

// Enhanced Registration with additional security
exports.register = async (req, res) => {
  try {
    const { name, email, password, phoneNumber } = req.body;

    // Validation
    if (!name || !email || !password || !phoneNumber) {
      return res.status(400).json({
        success: false,
        code: "MISSING_FIELDS",
        message: "All fields are required"
      });
    }

    if (!/^\+?254[0-9]{9}$/.test(phoneNumber)) {
      return res.status(400).json({
        success: false,
        code: "INVALID_PHONE",
        message: "Valid Kenyan phone number required (+254XXXXXXXXX)"
      });
    }

    // Check existing user
    const existingUser = await User.findOne({ $or: [{ email }, { phoneNumber }] });
    if (existingUser) {
      const field = existingUser.email === email ? "email" : "phoneNumber";
      return res.status(409).json({
        success: false,
        code: `${field.toUpperCase()}_EXISTS`,
        message: `${field} already registered`
      });
    }

    // Create user
    const user = await User.create({
      name,
      email,
      password: await bcrypt.hash(password, SALT_ROUNDS),
      phoneNumber,
      location: {
        type: "Point",
        coordinates: [36.8219, -1.2921] // Default Nairobi coordinates
      }
    });

    // Generate token
    const token = jwt.sign(
      { 
        userId: user._id,
        phoneNumber: user.phoneNumber,
        isSubscribed: false
      },
      JWT_SECRET,
      { expiresIn: "24h" }
    );

    res.status(201).json({
      success: true,
      message: "Registration successful",
      token,
      user: sanitizeUser(user)
    });

  } catch (error) {
    console.error("Registration error:", error);
    res.status(500).json({
      success: false,
      code: "REGISTRATION_FAILED",
      message: "Registration failed",
      error: process.env.NODE_ENV === "development" ? error.message : undefined
    });
  }
};

// Enhanced Login with security logging
exports.login = async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({
        success: false,
        code: "MISSING_CREDENTIALS",
        message: "Email and password required"
      });
    }

    const user = await User.findOne({ email }).select("+password +loginCount");
    if (!user) {
      return res.status(401).json({
        success: false,
        code: "INVALID_CREDENTIALS",
        message: "Invalid credentials"
      });
    }

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(401).json({
        success: false,
        code: "INVALID_CREDENTIALS",
        message: "Invalid credentials"
      });
    }

    // Update login stats
    user.loginCount += 1;
    user.lastLogin = new Date();
    await user.save();

    // Generate token with subscription status
    const isSubscribed = user.subscription?.isActive && 
                         new Date(user.subscription.expiresAt) > new Date();

    const token = jwt.sign(
      {
        userId: user._id,
        isSubscribed,
        expiresAt: user.subscription?.expiresAt
      },
      JWT_SECRET,
      { expiresIn: "24h" }
    );

    res.status(200).json({
      success: true,
      message: "Login successful",
      token,
      user: sanitizeUser(user)
    });

  } catch (error) {
    console.error("Login error:", error);
    res.status(500).json({
      success: false,
      code: "LOGIN_FAILED",
      message: "Login failed",
      error: process.env.NODE_ENV === "development" ? error.message : undefined
    });
  }
};

// Token Verification with enhanced checks
exports.verifyToken = async (req, res) => {
  try {
    const token = req.headers.authorization?.split(" ")[1];
    if (!token) {
      return res.status(401).json({
        success: false,
        code: "NO_TOKEN",
        message: "Authorization token required"
      });
    }

    const decoded = jwt.verify(token, JWT_SECRET);
    const user = await User.findById(decoded.userId);

    if (!user) {
      return res.status(404).json({
        success: false,
        code: "USER_NOT_FOUND",
        message: "User not found"
      });
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
    res.status(401).json({
      success: false,
      code: "INVALID_TOKEN",
      message: "Invalid or expired token",
      valid: false
    });
  }
};

// M-Pesa Subscription with enhanced validation
exports.initiateSubscription = async (req, res) => {
  try {
    const user = await User.findById(req.user.id);
    if (!user) {
      return res.status(404).json({
        success: false,
        code: "USER_NOT_FOUND",
        message: "User not found"
      });
    }

    // Check existing subscription
    if (user.subscription?.isActive && new Date(user.subscription.expiresAt) > new Date()) {
      return res.status(400).json({
        success: false,
        code: "ACTIVE_SUBSCRIPTION",
        message: "You already have an active subscription"
      });
    }

    // Initiate payment
    const paymentData = {
      phoneNumber: user.phoneNumber,
      amount: SUBSCRIPTION_AMOUNT,
      accountReference: `Ruda-${user._id}`,
      transactionDesc: "Ruda Dating Premium Subscription"
    };

    const stkResponse = await initiateSTKPush(paymentData);

    res.status(200).json({
      success: true,
      message: "Payment initiated",
      data: stkResponse
    });

  } catch (error) {
    console.error("Subscription error:", error);
    res.status(500).json({
      success: false,
      code: "SUBSCRIPTION_FAILED",
      message: "Subscription initiation failed",
      error: process.env.NODE_ENV === "development" ? error.message : undefined
    });
  }
};

// Enhanced M-Pesa Callback Handler
exports.handlePaymentCallback = async (req, res) => {
  try {
    const { Body: { stkCallback: callback } } = req.body;
    
    if (callback.ResultCode !== 0) {
      console.error("Payment failed:", callback.ResultDesc);
      return res.status(400).json({
        success: false,
        code: "PAYMENT_FAILED",
        message: callback.ResultDesc
      });
    }

    // Extract payment details
    const metadata = callback.CallbackMetadata?.Item || [];
    const getMetadataValue = (name) => metadata.find(item => item.Name === name)?.Value;

    const amount = getMetadataValue("Amount");
    const mpesaCode = getMetadataValue("MpesaReceiptNumber");
    const phoneNumber = getMetadataValue("PhoneNumber");
    const accountReference = getMetadataValue("AccountReference");

    if (!amount || !mpesaCode || !phoneNumber || !accountReference) {
      return res.status(400).json({
        success: false,
        code: "INVALID_CALLBACK",
        message: "Invalid payment data"
      });
    }

    // Validate payment amount
    if (parseInt(amount) !== SUBSCRIPTION_AMOUNT) {
      return res.status(400).json({
        success: false,
        code: "INVALID_AMOUNT",
        message: `Payment amount must be KES ${SUBSCRIPTION_AMOUNT}`
      });
    }

    // Find and update user
    const userId = accountReference.replace("Ruda-", "");
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({
        success: false,
        code: "USER_NOT_FOUND",
        message: "User account not found"
      });
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
    console.error("Callback error:", error);
    res.status(500).json({
      success: false,
      code: "CALLBACK_ERROR",
      message: "Error processing payment"
    });
  }
};

// Authentication Middleware with enhanced security
exports.authenticate = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith("Bearer ")) {
      return res.status(401).json({
        success: false,
        code: "INVALID_AUTH_HEADER",
        message: "Bearer token required"
      });
    }

    const token = authHeader.split(" ")[1];
    const decoded = jwt.verify(token, JWT_SECRET);
    
    const user = await User.findById(decoded.userId);
    if (!user) {
      return res.status(401).json({
        success: false,
        code: "USER_NOT_FOUND",
        message: "User account not found"
      });
    }

    // Check token expiration
    if (decoded.exp < Date.now() / 1000) {
      return res.status(401).json({
        success: false,
        code: "TOKEN_EXPIRED",
        message: "Session expired"
      });
    }

    req.user = user;
    next();
  } catch (error) {
    res.status(401).json({
      success: false,
      code: "AUTH_FAILED",
      message: "Authentication failed"
    });
  }
};

// Get Current User Profile
exports.getCurrentUser = async (req, res) => {
  try {
    const user = await User.findById(req.user.id);
    if (!user) {
      return res.status(404).json({
        success: false,
        code: "USER_NOT_FOUND",
        message: "User not found"
      });
    }

    res.status(200).json({
      success: true,
      user: sanitizeUser(user)
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      code: "SERVER_ERROR",
      message: "Failed to fetch user data"
    });
  }
};