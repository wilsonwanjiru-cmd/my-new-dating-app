const crypto = require("crypto");
const jwt = require("jsonwebtoken");
const User = require("../models/user");
const { sendVerificationEmail } = require("./emailController");

const secretKey = crypto.randomBytes(32).toString("hex"); // Secret key for JWT

// Register User
exports.registerUser = async (req, res) => {
  try {
    const { name, email, password } = req.body;

    // Check if user already exists
    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(400).json({ message: "User already exists" });
    }

    // Generate a verification token
    const verificationToken = crypto.randomBytes(20).toString("hex");

    // Create new user
    const newUser = new User({
      name,
      email,
      password,
      verificationToken, // Save the verification token
    });

    // Save user to database
    await newUser.save();

    // Send verification email
    await sendVerificationEmail(email, verificationToken);

    res.status(200).json({ message: "User registered. Verify your email." });
  } catch (error) {
    console.error("Registration error:", error);
    res.status(500).json({ message: "Registration failed" });
  }
};

// Login User
exports.loginUser = async (req, res) => {
  try {
    const { email, password } = req.body;

    // Find user by email
    const user = await User.findOne({ email });
    if (!user || user.password !== password) {
      return res.status(401).json({ message: "Invalid email or password" });
    }

    // Check if the user is verified
    if (!user.verified) {
      return res.status(403).json({ message: "Email not verified. Please check your email." });
    }

    // Generate JWT token
    const token = jwt.sign({ userId: user._id }, secretKey, { expiresIn: "1h" }); // Added expiration for the token

    res.status(200).json({ token });
  } catch (error) {
    console.error("Login error:", error);
    res.status(500).json({ message: "Login failed" });
  }
};