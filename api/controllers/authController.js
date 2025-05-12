const crypto = require("crypto");
const jwt = require("jsonwebtoken");
const User = require("../models/user");
const { sendVerificationEmail } = require("./emailController");

const secretKey = process.env.JWT_SECRET || crypto.randomBytes(32).toString("hex");

// Register User
exports.registerUser = async (req, res) => {
  try {
    const { name, email, password } = req.body;

    // Validate input
    if (!name || !email || !password) {
      return res.status(400).json({ message: "All fields are required" });
    }

    // Check if user already exists
    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(409).json({ 
        message: "User already exists",
        verified: existingUser.verified 
      });
    }

    // Generate a verification token
    const verificationToken = crypto.randomBytes(20).toString("hex");

    // Create new user (consider hashing the password)
    const newUser = new User({
      name,
      email,
      password, // In production, you should hash this password
      verificationToken,
      verified: false
    });

    // Save user to database
    await newUser.save();

    // Send verification email (won't block registration if it fails)
    try {
      await sendVerificationEmail(email, verificationToken);
    } catch (emailError) {
      console.error("Email sending error:", emailError);
      // Continue with registration even if email fails
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
      return res.status(400).json({ message: "Email and password are required" });
    }

    // Find user by email
    const user = await User.findOne({ email });
    if (!user) {
      return res.status(401).json({ message: "Invalid credentials" }); // Generic message for security
    }

    // In production, use bcrypt to compare hashed passwords
    if (user.password !== password) {
      return res.status(401).json({ message: "Invalid credentials" });
    }

    // Check if the user is verified
    if (!user.verified) {
      return res.status(403).json({ 
        message: "Email not verified",
        action: "resend",
        userId: user._id
      });
    }

    // Generate JWT token
    const token = jwt.sign(
      { userId: user._id, email: user.email },
      secretKey,
      { expiresIn: "24h" }
    );

    res.status(200).json({ 
      success: true,
      token,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        verified: user.verified
      }
    });

  } catch (error) {
    console.error("Login error:", error);
    res.status(500).json({ 
      success: false,
      message: "Login failed",
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

// Resend Verification Email
exports.resendVerificationEmail = async (req, res) => {
  try {
    const { email, userId } = req.body;

    if (!email && !userId) {
      return res.status(400).json({ message: "Email or user ID is required" });
    }

    // Find user by email or ID
    const user = await User.findOne(
      userId ? { _id: userId } : { email }
    );

    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    if (user.verified) {
      return res.status(400).json({ message: "Email is already verified" });
    }

    // Generate new token if none exists
    if (!user.verificationToken) {
      user.verificationToken = crypto.randomBytes(20).toString("hex");
      await user.save();
    }

    // Send verification email
    await sendVerificationEmail(user.email, user.verificationToken);

    res.status(200).json({ 
      success: true,
      message: "Verification email resent",
      email: user.email
    });

  } catch (error) {
    console.error("Resend verification error:", error);
    res.status(500).json({ 
      success: false,
      message: "Failed to resend verification email",
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};