const express = require("express");
const { body, query } = require("express-validator");
const router = express.Router();

// Debug: Log the attempt to import controller
console.log("[DEBUG] Attempting to import emailController...");

// Import controller functions with error handling
let emailController;
try {
  emailController = require("../controllers/emailController");
  console.log("[DEBUG] Successfully imported emailController:", 
    Object.keys(emailController).filter(key => typeof emailController[key] === 'function'));
} catch (err) {
  console.error("[ERROR] Failed to import emailController:", err);
  process.exit(1);
}

// Verify required functions exist
const requiredFunctions = ['verifyEmail', 'resendVerificationEmail'];
requiredFunctions.forEach(func => {
  if (!emailController[func] || typeof emailController[func] !== 'function') {
    console.error(`[ERROR] Missing or invalid function in emailController: ${func}`);
    console.error(`[DEBUG] Available functions:`, Object.keys(emailController));
    process.exit(1);
  }
});

// Import validation middleware with error handling
let validateRequest;
try {
  validateRequest = require("../middlewares/validateRequest");
  if (typeof validateRequest !== 'function') {
    throw new Error('validateRequest is not a function');
  }
} catch (err) {
  console.error("[ERROR] Failed to import validateRequest middleware:", err);
  process.exit(1);
}

/**
 * @route GET /api/email/verify-email
 * @desc Verify user's email using token
 * @access Public
 * 
 * @param {string} token.query.required - Verification token (32+ chars)
 * @param {string} email.query.required - User's email
 * 
 * @returns {object} 200 - { success: true, message: string }
 * @returns {object} 400 - { success: false, error: string }
 * @returns {object} 500 - { success: false, error: string }
 */
router.get(
  "/verify-email",
  [
    query("token")
      .notEmpty().withMessage("Verification token is required")
      .isLength({ min: 32 }).withMessage("Token must be at least 32 characters")
      .trim().escape(),
    query("email")
      .notEmpty().withMessage("Email is required")
      .isEmail().withMessage("Must be a valid email address")
      .normalizeEmail(),
    validateRequest
  ],
  (req, res, next) => {
    console.log("[DEBUG] Handling verify-email request");
    emailController.verifyEmail(req, res, next).catch(next);
  }
);

/**
 * @route POST /api/email/resend-verification
 * @desc Resend verification email
 * @access Public
 * 
 * @param {string} email.body.required - User's email
 * 
 * @returns {object} 200 - { success: true, message: string }
 * @returns {object} 400 - { success: false, error: string }
 * @returns {object} 404 - { success: false, error: string }
 * @returns {object} 500 - { success: false, error: string }
 */
router.post(
  "/resend-verification",
  [
    body("email")
      .notEmpty().withMessage("Email is required")
      .isEmail().withMessage("Must be a valid email address")
      .normalizeEmail(),
    validateRequest
  ],
  (req, res, next) => {
    console.log("[DEBUG] Handling resend-verification request");
    emailController.resendVerificationEmail(req, res, next).catch(next);
  }
);

// Debug: Verify routes are properly set up
console.log("[DEBUG] Configured email routes:");
console.log("- GET /api/email/verify-email");
console.log("- POST /api/email/resend-verification");

module.exports = router;