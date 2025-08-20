// ==================== IMPORTS ====================
const express = require('express');
const rateLimit = require('express-rate-limit');
const { body } = require('express-validator');

const {
  testController,
  testSimple,
  register,
  login,
  refreshToken,
  logout,
  initiateChatSubscription,
  confirmSubscription,
  updateOnlineStatus,
  getCurrentUser,
  selectGender,
  initiateChat
} = require('../controllers/authController');

const {
  authenticate,
  checkSubscription,
  checkOnlineStatus,
  checkGenderSet
} = require('../middlewares/authMiddleware');

const { validateRequest } = require('../middlewares/validateRequest');

// ==================== INIT ROUTER ====================
const router = express.Router();

// ==================== RATE LIMITERS ====================
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 20,
  message: {
    success: false,
    code: 'TOO_MANY_REQUESTS',
    message: 'Too many attempts. Please try again later.'
  },
  skip: req => process.env.NODE_ENV === 'test'
});

const paymentLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 5,
  message: {
    success: false,
    code: 'PAYMENT_LIMIT_EXCEEDED',
    message: 'Too many payment attempts. Please try again later.'
  }
});

// ==================== VALIDATION RULES ====================
const registerRules = [
  body('name').trim().isLength({ min: 2, max: 50 })
    .withMessage('Name must be 2-50 characters'),
  body('email').isEmail().withMessage('Valid email required').normalizeEmail(),
  body('password')
    .isLength({ min: 8 }).withMessage('Password must be at least 8 characters')
    .matches(/\d/).withMessage('Password must contain a number')
    .matches(/[a-z]/).withMessage('Password must contain a lowercase letter')
    .matches(/[A-Z]/).withMessage('Password must contain an uppercase letter'),
  body('phoneNumber')
    .matches(/^(\+?254|0)[17]\d{8}$/)
    .withMessage('Valid Kenyan phone number required (format: 07... or 2547...)'),
  body('gender')
    .isIn(['male', 'female', 'other'])
    .withMessage('Valid gender selection required'),
  body('birthDate')
    .notEmpty()
    .isISO8601()
    .withMessage('Valid birth date required (YYYY-MM-DD)')
];

const loginRules = [
  body('email').isEmail().withMessage('Valid email required'),
  body('password').exists().withMessage('Password is required')
];

const refreshTokenRules = [
  body('refreshToken').isJWT().withMessage('Valid refresh token required')
];

const subscriptionRules = [
  body('phoneNumber')
    .matches(/^(\+?254|0)[17]\d{8}$/)
    .withMessage('Valid Kenyan phone number required for payment')
];

const genderRules = [
  body('gender')
    .isIn(['male', 'female', 'other'])
    .withMessage('Valid gender selection required')
];

// ==================== DEBUG ROUTES ====================
router.post('/test', testController);
router.post('/test-simple', testSimple);

// ==================== AUTH ROUTES ====================
router.post(
  '/register',
  authLimiter,
  registerRules,
  validateRequest,
  (req, res, next) => {
    console.log('📥 Register request:', { ...req.body, password: '*****' });
    next();
  },
  register
);

router.post(
  '/login',
  authLimiter,
  loginRules,
  validateRequest,
  login
);

router.post(
  '/refresh-token',
  authLimiter,
  refreshTokenRules,
  validateRequest,
  refreshToken
);

router.post(
  '/logout',
  authenticate,
  logout
);

// ==================== USER PROFILE ====================
router.get(
  '/me',
  authenticate,
  getCurrentUser
);

// FIXED: Ensure select-gender route is properly defined
router.post(
  '/select-gender',
  authenticate,
  genderRules,
  validateRequest,
  selectGender
);

router.patch(
  '/me/gender',
  authenticate,
  genderRules,
  validateRequest,
  selectGender
);

// ==================== SUBSCRIPTION ====================
router.post(
  '/subscriptions/initiate',
  paymentLimiter,
  authenticate,
  checkGenderSet,
  subscriptionRules,
  validateRequest,
  initiateChatSubscription
);

router.post(
  '/subscriptions/confirm',
  paymentLimiter,
  authenticate,
  checkGenderSet,
  [
    body('mpesaCode').exists().withMessage('MPesa code is required'),
    body('amount').isInt({ min: 10 }).withMessage('Minimum amount is KES 10')
  ],
  validateRequest,
  confirmSubscription
);

// ==================== STATUS ====================
router.patch(
  '/status/online',
  authenticate,
  checkGenderSet,
  [
    body('isOnline').isBoolean().withMessage('Boolean status required'),
    body('socketId').optional().isString()
  ],
  validateRequest,
  updateOnlineStatus
);

// ==================== CHAT ====================
router.post(
  '/chats/initiate',
  authenticate,
  checkGenderSet,
  checkSubscription,
  [body('recipientId').isMongoId().withMessage('Valid user ID required')],
  validateRequest,
  initiateChat
);

// ==================== DEBUG ENDPOINT ====================
// Add a debug endpoint to list all registered routes
router.get('/debug/routes', (req, res) => {
  const routes = [];
  router.stack.forEach((layer) => {
    if (layer.route) {
      const methods = Object.keys(layer.route.methods).join(', ').toUpperCase();
      routes.push({
        path: layer.route.path,
        methods: methods
      });
    }
  });
  res.json({
    success: true,
    message: 'Registered auth routes',
    routes: routes
  });
});

// ==================== ROUTE DEBUG LOG ====================
console.log('\n🔍 Auth Router Registered Routes:');
router.stack.forEach((layer, i) => {
  if (layer.route) {
    const methods = Object.keys(layer.route.methods)
      .map(m => m.toUpperCase())
      .join(', ');
    console.log(`Route ${i + 1}: ${methods.padEnd(8)} ${layer.route.path}`);
  }
});

// ==================== REQUEST LOGGER ====================
router.use((req, res, next) => {
  console.log(`[AuthRouter] ${req.method} ${req.originalUrl}`);
  next();
});

// ==================== EXPORT ====================
module.exports = router;