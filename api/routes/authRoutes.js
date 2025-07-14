const express = require('express');
const router = express.Router();
const authController = require('../controllers/authController');
const rateLimit = require('express-rate-limit');
const { body } = require('express-validator');

// Rate limiting configuration
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 20, // Limit each IP to 20 requests per windowMs
  message: {
    success: false,
    code: 'RATE_LIMITED',
    message: 'Too many attempts. Please try again in 15 minutes.'
  },
  skip: (req) => process.env.NODE_ENV === 'test'
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
  body('phoneNumber')
    .matches(/^\+?254[0-9]{9}$/)
    .withMessage('Valid Kenyan phone number required (+254XXXXXXXXX)'),
  body('password')
    .isLength({ min: 8 })
    .withMessage('Password must be 8+ characters')
    .matches(/[!@#$%^&*]/)
    .withMessage('Password must contain a special character')
    .matches(/[A-Z]/)
    .withMessage('Password must contain an uppercase letter')
    .matches(/[0-9]/)
    .withMessage('Password must contain a number'),
  body('gender')
    .optional()
    .isIn(['male', 'female', 'non-binary', 'prefer-not-to-say'])
    .withMessage('Invalid gender selection')
];

const validateLogin = [
  body('email')
    .isEmail()
    .withMessage('Valid email required'),
  body('password')
    .exists()
    .withMessage('Password is required')
];

// ==================== AUTH ROUTES ==================== //

/**
 * @route POST /register
 * @desc Register new user with M-Pesa compatible phone number
 * @access Public
 */
router.post(
  '/register',
  authLimiter,
  validateRegistration,
  authController.register
);

/**
 * @route POST /login
 * @desc Authenticate user and return JWT token
 * @access Public
 */
router.post(
  '/login',
  authLimiter,
  validateLogin,
  authController.login
);

/**
 * @route GET /verify-token
 * @desc Verify JWT token validity
 * @access Private
 */
router.get(
  '/verify-token',
  authController.verifyToken
);

/**
 * @route POST /subscribe
 * @desc Initiate M-Pesa payment for subscription
 * @access Private
 */
router.post(
  '/subscribe',
  authController.authenticate,
  authController.initiateSubscription
);

/**
 * @route POST /mpesa-callback
 * @desc Handle M-Pesa payment callback
 * @access Public (called by M-Pesa)
 */
router.post(
  '/mpesa-callback',
  authController.handlePaymentCallback
);

/**
 * @route GET /me
 * @desc Get current authenticated user profile
 * @access Private
 */
router.get(
  '/me',
  authController.authenticate,
  authController.getCurrentUser
);

module.exports = router;