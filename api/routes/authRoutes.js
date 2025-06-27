const express = require('express');
const router = express.Router();
const authController = require('../controllers/authController');
const rateLimit = require('express-rate-limit');
const { body } = require('express-validator');

// ===== POSTMAN TESTING CONFIG ===== //
/*
  Postman Collection Setup:
  1. Create new collection "Dating App Auth"
  2. Add environment variables:
     - base_url: http://localhost:5000/api/auth
     - test_token: {{after successful login}}
  3. Save this collection as JSON for team sharing
*/

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  message: {
    success: false,
    code: 'RATE_LIMITED',
    message: 'Too many attempts. Wait 15 minutes.'
  },
  skip: (req) => process.env.NODE_ENV === 'test' // Disable for tests
});

// ==================== VALIDATION MIDDLEWARES ==================== //
const validateRegistration = [
  body('name')
    .trim()
    .isLength({ min: 2 })
    .withMessage('Name must be at least 2 characters'),
  body('email')
    .isEmail()
    .normalizeEmail()
    .withMessage('Invalid email address'),
  body('password')
    .isLength({ min: 8 })
    .withMessage('Password must be 8+ characters')
    .matches(/[!@#$%^&*]/)
    .withMessage('Password must contain a special character (!@#$%^&*)')
    .matches(/[A-Z]/)
    .withMessage('Password must contain at least one uppercase letter')
    .matches(/[0-9]/)
    .withMessage('Password must contain at least one number'),
  body('gender')
    .optional()
    .isIn(['male', 'female', 'other'])
    .withMessage('Gender must be male, female or other')
];

const validateLogin = [
  body('email')
    .isEmail()
    .withMessage('Valid email required'),
  body('password')
    .exists()
    .withMessage('Password is required')
];

// ==================== POSTMAN-READY ENDPOINTS ==================== //

/**
 * @route POST /register
 * @desc Register new user (no email verification)
 * @access Public
 * @body {name, email, password, [gender]}
 * 
 * Postman Test:
 * 1. Method: POST
 * 2. URL: {{base_url}}/register
 * 3. Body (raw JSON):
 * {
 *   "name": "Test User",
 *   "email": "test@example.com",
 *   "password": "ValidPass123!",
 *   "gender": "male"
 * }
 * 
 * Test Cases:
 * - Omit name → 400 error
 * - Invalid email → 400 error
 * - Weak password → 400 error
 */
router.post(
  '/register',
  authLimiter,
  validateRegistration,
  authController.registerUser
);

/**
 * @route POST /login
 * @desc Authenticate existing user
 * @access Public
 * @body {email, password}
 * 
 * Postman Test:
 * 1. Method: POST
 * 2. URL: {{base_url}}/login
 * 3. Body (raw JSON):
 * {
 *   "email": "test@example.com",
 *   "password": "ValidPass123!"
 * }
 * 4. Add this to Tests tab:
 * if (pm.response.code === 200) {
 *   pm.environment.set("test_token", pm.response.json().token);
 * }
 */
router.post(
  '/login',
  authLimiter,
  validateLogin,
  authController.loginUser
);

/**
 * @route GET /me
 * @desc Get current user profile
 * @access Private
 * @headers Authorization: Bearer <token>
 * 
 * Postman Test:
 * 1. Method: GET
 * 2. URL: {{base_url}}/me
 * 3. Headers:
 *    Key: Authorization
 *    Value: Bearer {{test_token}}
 * 
 * Test Cases:
 * - No token → 401 error
 * - Invalid token → 401 error
 */
router.get(
  '/me',
  authController.verifyToken,
  authController.getCurrentUser
);

module.exports = router;