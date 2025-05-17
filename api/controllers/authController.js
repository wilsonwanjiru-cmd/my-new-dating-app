const crypto = require("crypto");
const jwt = require("jsonwebtoken");
const bcrypt = require("bcrypt");
const User = require("../models/user");
const { sendVerificationEmail } = require("./emailController");

const secretKey = process.env.JWT_SECRET || crypto.randomBytes(32).toString("hex");
const SALT_ROUNDS = process.env.SALT_ROUNDS || 10;

// Register User
exports.registerUser = async (req, res) => {
  try {
    const { name, email, password } = req.body;

    // Validate input
    if (!name || !email || !password) {
      return res.status(400).json({ 
        success: false,
        message: "All fields are required",
        code: "MISSING_FIELDS"
      });
    }

    // Validate email format
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return res.status(400).json({
        success: false,
        message: "Invalid email format",
        code: "INVALID_EMAIL"
      });
    }

    // Check if user already exists
    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(409).json({ 
        success: false,
        message: "User already exists",
        code: "USER_EXISTS",
        verified: existingUser.verified 
      });
    }

    // Generate verification token and hash password
    const verificationToken = crypto.randomBytes(20).toString("hex");
    const hashedPassword = await bcrypt.hash(password, SALT_ROUNDS);

    // Create new user
    const newUser = new User({
      name,
      email,
      password: hashedPassword,
      verificationToken,
      verified: false
    });

    // Save user to database
    await newUser.save();

    // Send verification email
    try {
      await sendVerificationEmail(email, verificationToken);
    } catch (emailError) {
      console.error("Email sending error:", emailError);
      return res.status(202).json({ 
        success: true,
        message: "Registration successful but verification email failed to send",
        userId: newUser._id,
        action: "resend"
      });
    }

    res.status(201).json({ 
      success: true,
      message: "Registration successful. Please check your email to verify your account.",
      userId: newUser._id
    });

  } catch (error) {
    console.error("Registration error:", error);
    res.status(500).json({ 
      success: false,
      message: "Registration failed",
      code: "SERVER_ERROR",
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

// Login User
exports.loginUser = async (req, res) => {
  try {
    const { email, password } = req.body;

    // Validate input
    if (!email || !password) {
      return res.status(400).json({ 
        success: false,
        message: "Email and password are required",
        code: "MISSING_CREDENTIALS"
      });
    }

    // Find user by email
    const user = await User.findOne({ email }).select("+password");
    if (!user) {
      return res.status(401).json({ 
        success: false,
        message: "Invalid credentials",
        code: "INVALID_CREDENTIALS"
      });
    }

    // Verify password
    const isPasswordValid = await bcrypt.compare(password, user.password);
    if (!isPasswordValid) {
      return res.status(401).json({ 
        success: false,
        message: "Invalid credentials",
        code: "INVALID_CREDENTIALS"
      });
    }

    // Check if the user is verified
    if (!user.verified) {
      return res.status(403).json({ 
        success: false,
        message: "Email not verified",
        code: "UNVERIFIED_EMAIL",
        action: "resend",
        userId: user._id
      });
    }

    // Generate JWT token
    const token = jwt.sign(
      { 
        userId: user._id, 
        email: user.email,
        role: user.role || 'user'
      },
      secretKey,
      { expiresIn: "24h" }
    );

    // Omit sensitive data from response
    const userResponse = {
      id: user._id,
      name: user.name,
      email: user.email,
      verified: user.verified,
      createdAt: user.createdAt
    };

    res.status(200).json({ 
      success: true,
      token,
      user: userResponse
    });

  } catch (error) {
    console.error("Login error:", error);
    res.status(500).json({ 
      success: false,
      message: "Login failed",
      code: "SERVER_ERROR",
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

// Resend Verification Email
exports.resendVerificationEmail = async (req, res) => {
  try {
    const { email, userId } = req.body;

    if (!email && !userId) {
      return res.status(400).json({ 
        success: false,
        message: "Email or user ID is required",
        code: "MISSING_IDENTIFIER"
      });
    }

    // Find user by email or ID
    const user = await User.findOne(
      userId ? { _id: userId } : { email }
    ).select("+verificationToken");

    if (!user) {
      return res.status(404).json({ 
        success: false,
        message: "User not found",
        code: "USER_NOT_FOUND"
      });
    }

    if (user.verified) {
      return res.status(400).json({ 
        success: false,
        message: "Email is already verified",
        code: "ALREADY_VERIFIED",
        verifiedAt: user.verifiedAt
      });
    }

    // Generate new token if none exists
    if (!user.verificationToken) {
      user.verificationToken = crypto.randomBytes(20).toString("hex");
      await user.save();
    }

    // Send verification email
    try {
      await sendVerificationEmail(user.email, user.verificationToken);
    } catch (emailError) {
      console.error("Email sending error:", emailError);
      return res.status(500).json({
        success: false,
        message: "Failed to send verification email",
        code: "EMAIL_FAILURE"
      });
    }

    res.status(200).json({ 
      success: true,
      message: "Verification email resent",
      email: user.email,
      userId: user._id
    });

  } catch (error) {
    console.error("Resend verification error:", error);
    res.status(500).json({ 
      success: false,
      message: "Failed to resend verification email",
      code: "SERVER_ERROR",
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

// Token Verification Middleware
exports.verifyToken = async (req, res, next) => {
  const token = req.header('Authorization')?.replace('Bearer ', '');
  
  if (!token) {
    return res.status(401).json({ 
      success: false,
      message: "Access denied. No token provided.",
      code: "NO_TOKEN"
    });
  }

  try {
    const decoded = jwt.verify(token, secretKey);
    req.user = decoded;
    next();
  } catch (error) {
    res.status(401).json({ 
      success: false,
      message: "Invalid or expired token",
      code: "INVALID_TOKEN"
    });
  }
};