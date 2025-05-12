const express = require("express");
const { 
  registerUser, 
  loginUser,
  resendVerificationEmail 
} = require("../controllers/authController");

const router = express.Router();

// Route to register a new user
router.post("/register", registerUser);

// Route to login an existing user
router.post("/login", loginUser);

// Route to resend verification email
router.post("/resend-verification", resendVerificationEmail);

module.exports = router;