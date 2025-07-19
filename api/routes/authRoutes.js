const express = require('express');
const router = express.Router();
const {
  register,
  login,
  refreshToken,
  logout,
  verifyToken,
  authenticate,
  initiateSubscription,
  handlePaymentCallback,
  getCurrentUser
} = require('../controllers/authController');

const rateLimit = require('express-rate-limit');
const { body } = require('express-validator');
const {
  validateRequest
} = require('../middlewares/validateRequest');

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
  keyGenerator: (req) => req.ip + (req.body.email || '')
});

const sensitiveLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 10,
  message: {
    success: false,
    code: 'RATE_LIMITED_SENSITIVE',
    message: 'Too many sensitive operations. Please try again later.'
  }
});

// Validation Middlewares
const validateRegistration = [
  body('name')
    .trim()
    .isLength({ min: 2, max: 50 })
    .withMessage('Name must be 2-50 characters'),

  body('email')
    .isEmail()
    .withMessage('Valid email required')
    .normalizeEmail(),

  body('phoneNumber')
    .matches(/^\+?254[0-9]{9}$/)
    .withMessage('Valid Kenyan phone number required (+254XXXXXXXXX)'),

  body('password')
    .isLength({ min: 8 })
    .withMessage('Password must be at least 8 characters')
    .matches(/[!@#$%^&*]/)
    .withMessage('Password must contain a special character')
    .matches(/[A-Z]/)
    .withMessage('Password must contain an uppercase letter')
    .matches(/[0-9]/)
    .withMessage('Password must contain a number')
];

const validateLogin = [
  body('email').isEmail().withMessage('Valid email required'),
  body('password').exists().withMessage('Password is required')
];

const validateRefreshToken = [
  body('refreshToken')
    .exists()
    .withMessage('Refresh token is required')
    .isJWT()
    .withMessage('Invalid refresh token format')
];

// Authentication Routes
router.post(
  '/register',
  authLimiter,
  validateRegistration,
  validateRequest,
  register
);

router.post(
  '/login',
  authLimiter,
  validateLogin,
  validateRequest,
  login
);

router.post(
  '/refresh-token',
  sensitiveLimiter,
  validateRefreshToken,
  validateRequest,
  refreshToken
);

router.post(
  '/logout',
  authenticate,
  logout
);

router.get(
  '/verify-token',
  verifyToken
);

router.post(
  '/subscribe',
  sensitiveLimiter,
  authenticate,
  initiateSubscription
);

router.post(
  '/mpesa-callback',
  handlePaymentCallback
);

router.get(
  '/me',
  authenticate,
  getCurrentUser
);

module.exports = router;
