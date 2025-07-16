const express = require('express');
const router = express.Router();
const authController = require('../controllers/authController');
const rateLimit = require('express-rate-limit');
const { body } = require('express-validator');
const validateRequest = require('../middlewares/validateRequest');

// Rate limiting configuration
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 20, // Limit each IP to 20 requests per windowMs
  message: {
    success: false,
    code: 'RATE_LIMITED',
    message: 'Too many attempts. Please try again in 15 minutes.'
  },
  skip: (req) => process.env.NODE_ENV === 'test',
  keyGenerator: (req) => {
    // Use IP + email for login/register limiting
    return req.ip + (req.body.email || '');
  }
});

// Enhanced rate limiter for sensitive endpoints
const sensitiveLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 10,
  message: {
    success: false,
    code: 'RATE_LIMITED_SENSITIVE',
    message: 'Too many sensitive operations. Please try again later.'
  }
});

// ==================== VALIDATION MIDDLEWARES ==================== //
const validateRegistration = [
  body('name')
    .trim()
    .isLength({ min: 2, max: 50 })
    .withMessage('Name must be 2-50 characters')
    .matches(/^[a-zA-Z\s'-]+$/)
    .withMessage('Name contains invalid characters'),
  
  body('email')
    .isEmail()
    .normalizeEmail()
    .withMessage('Invalid email address')
    .isLength({ max: 100 })
    .withMessage('Email too long'),
  
  body('phoneNumber')
    .matches(/^\+?254[0-9]{9}$/)
    .withMessage('Valid Kenyan phone number required (+254XXXXXXXXX)'),
  
  body('password')
    .isLength({ min: 8, max: 100 })
    .withMessage('Password must be 8-100 characters')
    .matches(/[!@#$%^&*]/)
    .withMessage('Password must contain a special character')
    .matches(/[A-Z]/)
    .withMessage('Password must contain an uppercase letter')
    .matches(/[0-9]/)
    .withMessage('Password must contain a number')
    .not()
    .matches(/\s/)
    .withMessage('Password cannot contain spaces'),
  
  body('gender')
    .optional()
    .isIn(['male', 'female', 'non-binary', 'prefer-not-to-say'])
    .withMessage('Invalid gender selection'),
  
  body('birthDate')
    .optional()
    .isISO8601()
    .withMessage('Invalid birth date format (YYYY-MM-DD)')
    .custom((value) => {
      const birthDate = new Date(value);
      const minDate = new Date();
      minDate.setFullYear(minDate.getFullYear() - 100);
      const maxDate = new Date();
      maxDate.setFullYear(maxDate.getFullYear() - 18);
      
      return birthDate >= minDate && birthDate <= maxDate;
    })
    .withMessage('You must be at least 18 years old')
];

const validateLogin = [
  body('email')
    .isEmail()
    .withMessage('Valid email required')
    .normalizeEmail(),
  
  body('password')
    .exists()
    .withMessage('Password is required')
];

const validateRefreshToken = [
  body('refreshToken')
    .exists()
    .withMessage('Refresh token is required')
    .isJWT()
    .withMessage('Invalid refresh token format')
];

// ==================== AUTH ROUTES ==================== //

/**
 * @swagger
 * /auth/register:
 *   post:
 *     summary: Register a new user
 *     tags: [Authentication]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/UserRegistration'
 *     responses:
 *       201:
 *         description: User registered successfully
 *       400:
 *         description: Validation error
 *       409:
 *         description: Email or phone already exists
 *       500:
 *         description: Server error
 */
router.post(
  '/register',
  authLimiter,
  validateRegistration,
  validateRequest,
  authController.register
);

/**
 * @swagger
 * /auth/login:
 *   post:
 *     summary: Authenticate user
 *     tags: [Authentication]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/UserLogin'
 *     responses:
 *       200:
 *         description: Login successful
 *       400:
 *         description: Validation error
 *       401:
 *         description: Invalid credentials
 *       403:
 *         description: Account locked
 *       500:
 *         description: Server error
 */
router.post(
  '/login',
  authLimiter,
  validateLogin,
  validateRequest,
  authController.login
);

/**
 * @swagger
 * /auth/refresh-token:
 *   post:
 *     summary: Refresh access token
 *     tags: [Authentication]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               refreshToken:
 *                 type: string
 *     responses:
 *       200:
 *         description: Tokens refreshed
 *       400:
 *         description: Missing refresh token
 *       401:
 *         description: Invalid/expired refresh token
 *       500:
 *         description: Server error
 */
router.post(
  '/refresh-token',
  sensitiveLimiter,
  validateRefreshToken,
  validateRequest,
  authController.refreshToken
);

/**
 * @swagger
 * /auth/logout:
 *   post:
 *     summary: Logout user (invalidate refresh token)
 *     tags: [Authentication]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Logout successful
 *       401:
 *         description: Unauthorized
 *       500:
 *         description: Server error
 */
router.post(
  '/logout',
  authController.authenticate,
  authController.logout
);

/**
 * @swagger
 * /auth/verify-token:
 *   get:
 *     summary: Verify token validity
 *     tags: [Authentication]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Token is valid
 *       401:
 *         description: Invalid/expired token
 *       500:
 *         description: Server error
 */
router.get(
  '/verify-token',
  authController.verifyToken
);

/**
 * @swagger
 * /auth/subscribe:
 *   post:
 *     summary: Initiate premium subscription payment
 *     tags: [Subscription]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Payment initiated
 *       400:
 *         description: Already subscribed
 *       401:
 *         description: Unauthorized
 *       500:
 *         description: Server error
 */
router.post(
  '/subscribe',
  sensitiveLimiter,
  authController.authenticate,
  authController.initiateSubscription
);

/**
 * @swagger
 * /auth/mpesa-callback:
 *   post:
 *     summary: M-Pesa payment callback (internal)
 *     tags: [Subscription]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/MpesaCallback'
 *     responses:
 *       200:
 *         description: Callback processed
 *       400:
 *         description: Payment failed
 *       500:
 *         description: Server error
 */
router.post(
  '/mpesa-callback',
  authController.handlePaymentCallback
);

/**
 * @swagger
 * /auth/me:
 *   get:
 *     summary: Get current user profile
 *     tags: [Users]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: User profile
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: User not found
 *       500:
 *         description: Server error
 */
router.get(
  '/me',
  authController.authenticate,
  authController.getCurrentUser
);

module.exports = router;