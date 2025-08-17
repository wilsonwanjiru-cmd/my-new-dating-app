const express = require('express');
const router = express.Router();
const { body, param } = require('express-validator');
const authMiddleware = require('../middlewares/authMiddleware');
const { validatePagination } = require('../middlewares/validatePagination');
const validateRequest = require('../middlewares/validateRequest').validateRequest;
const {
  ensureGenderSetup,
  checkGenderCompatibility,
  enforceGenderAccess
} = require('../middlewares/genderMiddleware');

// CORRECTED CONTROLLER IMPORTS - match controller exports
const { 
  likePhoto,
  likeProfile,  // Changed from handleProfileLike
  getLikedPhotos,
  checkLikeStatus,
  getLikeDetails
} = require('../controllers/likeController');

const { authenticate } = authMiddleware;

// ==================== ROUTE DEBUGGING MIDDLEWARE ====================
router.use((req, res, next) => {
  console.log(`\n[Like Router] ${req.method} ${req.originalUrl}`);
  console.log('Params:', req.params);
  next();
});

// Apply global gender middlewares
router.use(ensureGenderSetup);
router.use(enforceGenderAccess);

// ==================== VALIDATION RULES ====================
const photoLikeRules = [
  param('photoId').isMongoId().withMessage('Valid photo ID required'),
  body('isLike').isBoolean().withMessage('Like status must be boolean')
];

const profileLikeRules = [
  param('userId').isMongoId().withMessage('Valid user ID required'),
  body('isLike').isBoolean().withMessage('Like status must be boolean')
];

// ==================== ROUTES ====================

/**
 * @swagger
 * /api/likes/photos/{photoId}:
 *   post:
 *     summary: Like or unlike a photo
 *     description: Requires gender to be set and valid subscription for premium features
 *     parameters:
 *       - in: path
 *         name: photoId
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               isLike:
 *                 type: boolean
 */
router.post(
  '/photos/:photoId',
  authenticate,
  ...photoLikeRules,
  validateRequest,
  likePhoto
);

/**
 * @swagger
 * /api/likes/profiles/{userId}:
 *   post:
 *     summary: Like or unlike a user profile
 *     description: Requires gender compatibility check
 *     parameters:
 *       - in: path
 *         name: userId
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               isLike:
 *                 type: boolean
 */
router.post(
  '/profiles/:userId',
  authenticate,
  checkGenderCompatibility,
  ...profileLikeRules,
  validateRequest,
  likeProfile  // Changed to correct handler name
);

/**
 * @swagger
 * /api/likes/users/{userId}/photos:
 *   get:
 *     summary: Get paginated list of liked photos
 *     parameters:
 *       - in: path
 *         name: userId
 *         required: true
 *         schema:
 *           type: string
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           default: 1
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 10
 */
router.get(
  '/users/:userId/photos',
  authenticate,
  validatePagination,
  getLikedPhotos
);

/**
 * @swagger
 * /api/likes/photos/status:
 *   post:
 *     summary: Check like status for multiple photos
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               photoIds:
 *                 type: array
 *                 items:
 *                   type: string
 *                 minItems: 1
 *                 example: ["507f1f77bcf86cd799439011"]
 */
router.post(
  '/photos/status',
  authenticate,
  [
    body('photoIds')
      .isArray({ min: 1 })
      .withMessage('At least one photo ID required'),
    body('photoIds.*').isMongoId().withMessage('Valid photo ID required')
  ],
  validateRequest,
  checkLikeStatus
);

/**
 * @swagger
 * /api/likes/photos/{id}/details:
 *   get:
 *     summary: Get detailed like information for a photo
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           default: 1
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 10
 */
router.get(
  '/photos/:id/details',
  authenticate,
  param('id').isMongoId().withMessage('Valid photo ID required'),
  validatePagination,
  getLikeDetails
);

// Alias route with full documentation
/**
 * @swagger
 * /api/likes/photos/{id}/likers:
 *   get:
 *     summary: Get list of users who liked a photo
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           default: 1
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 10
 */
router.get(
  '/photos/:id/likers',
  authenticate,
  param('id').isMongoId().withMessage('Valid photo ID required'),
  validatePagination,
  getLikeDetails
);

// ==================== ERROR HANDLERS ====================
router.use((req, res) => {
  res.status(404).json({
    success: false,
    code: 'LIKE_ENDPOINT_NOT_FOUND',
    message: "Like endpoint not found",
    path: req.path,
    suggestion: "Check /debug/routes for available endpoints",
    availableEndpoints: [
      'POST   /api/likes/photos/:photoId',
      'POST   /api/likes/profiles/:userId',
      'GET    /api/likes/users/:userId/photos',
      'POST   /api/likes/photos/status',
      'GET    /api/likes/photos/:id/details',
      'GET    /api/likes/photos/:id/likers'
    ]
  });
});

router.use((err, req, res, next) => {
  console.error("[LikeRoutes Error]", err);
  
  // Handle validation errors specifically
  if (err.name === 'ValidationError') {
    return res.status(400).json({
      success: false,
      code: 'LIKE_VALIDATION_FAILED',
      message: "Validation failed for like request",
      errors: err.errors
    });
  }

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
    code: 'LIKE_SYSTEM_ERROR',
    message: "Internal server error in like system",
    error: process.env.NODE_ENV === 'development' ? {
      message: err.message,
      stack: err.stack
    } : undefined
  });
});

// ==================== ROUTE DEBUGGING ====================
console.log('\n🔍 Final Like Route Stack:');
router.stack.forEach((layer, index) => {
  if (layer.route) {
    const methods = Object.keys(layer.route.methods)
      .map(method => method.toUpperCase())
      .join(', ');
    console.log(`Route ${index.toString().padStart(2)}: ${methods.padEnd(8)} ${layer.route.path}`);
  }
});

// CORRECT EXPORT FORMAT - essential fix
module.exports = router;