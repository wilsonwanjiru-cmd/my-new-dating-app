const express = require('express');
const router = express.Router();
const { body, param, query } = require('express-validator');

// Middleware imports
const { authenticate } = require('../middlewares/authMiddleware');
const { validateRequest } = require('../middlewares/validateRequest');
const { validatePagination } = require('../middlewares/validatePagination');
const {
  ensureGenderSetup,
  checkGenderCompatibility,
  enforceGenderAccess
} = require('../middlewares/genderMiddleware');
const { checkSubscription } = require('../middlewares/subscriptionMiddleware');

// Controller imports
const userController = require('../controllers/userController');

// ==================== ROUTE DEBUGGING MIDDLEWARE ====================
router.use((req, res, next) => {
  console.log(`\n[User Router] ${req.method} ${req.originalUrl}`);
  console.log('User:', req.user?._id);
  console.log('Params:', req.params);
  next();
});

// Apply global gender middlewares
router.use(ensureGenderSetup);
router.use(enforceGenderAccess);

// ==================== VALIDATION RULES ====================
const userIdParamRule = param('userId')
  .isMongoId()
  .withMessage('Valid user ID required');

const profileUpdateRules = [
  body('name').optional().isString().trim().isLength({ min: 2, max: 50 }),
  body('bio').optional().isString().trim().isLength({ max: 500 }),
  body('age').optional().isInt({ min: 18, max: 100 }),
  body('gender').optional().isIn(['male', 'female', 'other']),
  body('preferences').optional().isObject()
];

const profileImageRules = [
  body('url')
    .isURL()
    .withMessage('Valid image URL required'),
  body('publicId')
    .isString()
    .withMessage('Public ID required')
];

const subscriptionRules = [
  body('plan')
    .isIn(['monthly', 'yearly', 'premium'])
    .withMessage('Valid subscription plan required')
];

// ==================== USER ROUTES ====================

/**
 * Get user profile
 */
router.get(
  '/:userId',
  authenticate,
  userIdParamRule,
  validateRequest,
  userController.getUserProfile
);

/**
 * Update user profile
 */
router.put(
  '/:userId/profile',
  authenticate,
  userIdParamRule,
  profileUpdateRules,
  validateRequest,
  userController.updateProfile  // Updated to correct function name
);

/**
 * Upload profile image
 */
router.post(
  '/:userId/profile-images',
  authenticate,
  profileImageRules,
  validateRequest,
  userController.uploadProfileImage
);

/**
 * Delete profile image
 */
router.delete(
  '/:userId/profile-images/:photoId',
  authenticate,
  validateRequest,
  userController.deleteProfileImage  // Added missing route
);

/**
 * Subscribe to premium features
 */
router.post(
  '/:userId/subscribe',
  authenticate,
  subscriptionRules,
  validateRequest,
  userController.subscribe
);

/**
 * Get subscription status
 */
router.get(
  '/:userId/subscription-status',
  authenticate,
  userIdParamRule,
  validateRequest,
  userController.getSubscriptionStatus
);

/**
 * Get user notifications
 */
router.get(
  '/:userId/notifications',
  authenticate,
  validatePagination,
  userController.getNotifications
);

/**
 * Like/unlike a user
 */
router.post(
  '/:userId/like',
  authenticate,
  checkGenderCompatibility,
  checkSubscription,
  validateRequest,
  userController.likeUser
);

/**
 * Update user preferences
 */
router.put(
  '/:userId/preferences',
  authenticate,
  [
    body('genderPreference')
      .optional()
      .isIn(['male', 'female', 'both'])
      .withMessage('Valid gender preference required'),
    body('ageRange.min')
      .optional()
      .isInt({ min: 18, max: 100 })
      .withMessage('Min age must be 18-100'),
    body('ageRange.max')
      .optional()
      .isInt({ min: 18, max: 100 })
      .withMessage('Max age must be 18-100'),
    body('distance')
      .optional()
      .isInt({ min: 1, max: 100 })
      .withMessage('Distance must be 1-100 km')
  ],
  validateRequest,
  userController.updatePreferences
);

/**
 * Get photo feed
 */
router.get(
  '/photos/feed',
  authenticate,
  validatePagination,
  userController.getAllUserPhotos  // Corrected function name
);

/**
 * Start chat from photo
 */
router.post(
  '/chats/from-photo',
  authenticate,
  checkSubscription,
  [
    body('photoId').isMongoId().withMessage('Valid photo ID required'),
    body('targetUserId').isMongoId().withMessage('Valid user ID required')
  ],
  validateRequest,
  userController.startChatFromPhoto  // Added missing route
);

/**
 * Delete user account
 */
router.delete(
  '/:userId',
  authenticate,
  userIdParamRule,
  validateRequest,
  userController.deleteAccount  // Added missing route
);

// ==================== ERROR HANDLERS ====================
router.use((req, res) => {
  res.status(404).json({
    success: false,
    code: 'USER_ENDPOINT_NOT_FOUND',
    message: "User endpoint not found",
    path: req.path,
    validEndpoints: [
      'GET    /:userId - Get profile',
      'PUT    /:userId/profile - Update profile',
      'POST   /:userId/profile-images - Upload photo',
      'DELETE /:userId/profile-images/:photoId - Delete photo',
      'POST   /:userId/subscribe - Subscribe',
      'GET    /:userId/subscription-status - Get status',
      'GET    /:userId/notifications - Get notifications',
      'POST   /:userId/like - Like user',
      'PUT    /:userId/preferences - Update preferences',
      'GET    /photos/feed - Get photo feed',
      'POST   /chats/from-photo - Start chat from photo',
      'DELETE /:userId - Delete account'
    ]
  });
});

router.use((err, req, res, next) => {
  console.error("[UserRoutes Error]", err);
  
  // Handle gender compatibility errors
  if (err.code === 'GENDER_PREFERENCE_MISMATCH') {
    return res.status(403).json({
      success: false,
      code: err.code,
      message: err.message
    });
  }
  
  res.status(500).json({
    success: false,
    code: 'USER_SYSTEM_ERROR',
    message: "Internal server error in user system",
    error: process.env.NODE_ENV === 'development' ? {
      message: err.message,
      stack: err.stack
    } : undefined
  });
});

// ==================== ROUTE DEBUGGING ====================
console.log('\n🔍 Final User Route Stack:');
router.stack.forEach((layer, index) => {
  if (layer.route) {
    const methods = Object.keys(layer.route.methods)
      .map(method => method.toUpperCase())
      .join(', ');
    console.log(`Route ${index.toString().padStart(2)}: ${methods.padEnd(8)} ${layer.route.path}`);
  }
});

module.exports = router;