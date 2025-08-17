const express = require('express');
const router = express.Router();
const { body, param, query } = require('express-validator');
const rateLimit = require('express-rate-limit');

// Middleware imports
const { authenticate } = require('../middlewares/authMiddleware');
const { checkSubscription } = require('../middlewares/subscriptionMiddleware');
const { 
  ensureGenderSetup,
  checkGenderCompatibility,
  enforceGenderAccess
} = require('../middlewares/genderMiddleware');
const { validateRequest } = require('../middlewares/validateRequest');
const rateLimiter = require('../middlewares/rateLimiter');

// Controller imports
const chatController = require('../controllers/chatController');

// ==================== ROUTE DEBUGGING MIDDLEWARE ====================
router.use((req, res, next) => {
  console.log(`\n[Chat Router] ${req.method} ${req.originalUrl}`);
  console.log('User:', req.user?._id);
  console.log('Params:', req.params);
  next();
});

// Apply global gender middlewares
router.use(ensureGenderSetup);
router.use(enforceGenderAccess);

// ==================== VALIDATION RULES ====================
const messageRules = [
  body('content')
    .trim()
    .isLength({ min: 1, max: 2000 })
    .withMessage('Message must be 1-2000 characters')
];

const initiateFromPhotoRules = [
  body('initialMessage')
    .optional()
    .trim()
    .isLength({ max: 500 })
    .withMessage('Initial message cannot exceed 500 characters')
];

const paginationRules = [
  query('limit')
    .optional()
    .isInt({ min: 1, max: 100 })
    .withMessage('Limit must be between 1-100'),
  query('before')
    .optional()
    .isISO8601()
    .withMessage('Invalid timestamp format')
];

// ==================== RATE LIMITER ====================
const messageRateLimiter = rateLimiter('15 requests per 5 minutes', 15, 5 * 60 * 1000);

// ==================== CHAT ROUTES ====================

/**
 * Get conversations
 */
router.get(
  '/',
  authenticate,
  [
    query('recipientId')
      .optional()
      .isMongoId()
      .withMessage('Valid recipient ID required'),
    ...paginationRules
  ],
  validateRequest,
  chatController.getMessages
);

/**
 * Send new message
 * - Requires subscription
 * - Rate limited
 */
router.post(
  '/',
  authenticate,
  checkSubscription,
  checkGenderCompatibility,
  messageRateLimiter,
  [
    body('recipientId')
      .isMongoId()
      .withMessage('Valid recipient ID required'),
    ...messageRules
  ],
  validateRequest,
  chatController.sendMessage
);

/**
 * Start chat from photo
 * - Requires gender compatibility
 * - Requires subscription
 */
router.post(
  '/initiate-from-photo/:photoId',
  authenticate,
  checkGenderCompatibility,
  checkSubscription,
  [
    param('photoId')
      .isMongoId()
      .withMessage('Valid photo ID required'),
    ...initiateFromPhotoRules
  ],
  validateRequest,
  chatController.initiateFromPhoto
);

/**
 * Get unread messages count
 */
router.get(
  '/unread',
  authenticate,
  chatController.getUnreadMessages
);

/**
 * Mark message as read
 */
router.patch(
  '/:messageId/read',
  authenticate,
  [
    param('messageId')
      .isMongoId()
      .withMessage('Valid message ID required')
  ],
  validateRequest,
  chatController.markMessageAsRead
);

/**
 * Update message (within edit window)
 */
router.put(
  '/:messageId',
  authenticate,
  checkSubscription,
  [
    param('messageId')
      .isMongoId()
      .withMessage('Valid message ID required'),
    ...messageRules
  ],
  validateRequest,
  chatController.updateMessage
);

/**
 * Delete message (soft delete)
 */
router.delete(
  '/:messageId',
  authenticate,
  [
    param('messageId')
      .isMongoId()
      .withMessage('Valid message ID required')
  ],
  validateRequest,
  chatController.deleteMessage
);

/**
 * Delete entire conversation
 */
router.delete(
  '/conversation/:recipientId',
  authenticate,
  checkGenderCompatibility,
  [
    param('recipientId')
      .isMongoId()
      .withMessage('Valid user ID required')
  ],
  validateRequest,
  chatController.deleteChatHistory
);

// ==================== ERROR HANDLERS ====================
router.use((req, res) => {
  res.status(404).json({
    success: false,
    code: 'CHAT_ENDPOINT_NOT_FOUND',
    message: "Chat endpoint not found",
    path: req.path,
    validEndpoints: [
      'GET    / - Get conversations',
      'POST   / - Send message',
      'POST   /initiate-from-photo/:photoId - Start chat from photo',
      'GET    /unread - Get unread count',
      'PATCH  /:messageId/read - Mark as read',
      'PUT    /:messageId - Update message',
      'DELETE /:messageId - Delete message',
      'DELETE /conversation/:recipientId - Delete conversation'
    ]
  });
});

router.use((err, req, res, next) => {
  console.error("[ChatRoutes Error]", err);
  
  // Handle rate limit errors
  if (err.type === 'rate-limit-exceeded') {
    return res.status(429).json({
      success: false,
      code: 'CHAT_RATE_LIMIT_EXCEEDED',
      message: "Too many chat requests. Please wait before trying again."
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
    code: 'CHAT_SYSTEM_ERROR',
    message: "Internal server error in chat system",
    error: process.env.NODE_ENV === 'development' ? {
      message: err.message,
      stack: err.stack
    } : undefined
  });
});

// ==================== ROUTE DEBUGGING ====================
console.log('\n🔍 Final Chat Route Stack:');
router.stack.forEach((layer, index) => {
  if (layer.route) {
    const methods = Object.keys(layer.route.methods)
      .map(method => method.toUpperCase())
      .join(', ');
    console.log(`Route ${index.toString().padStart(2)}: ${methods.padEnd(8)} ${layer.route.path}`);
  }
});

module.exports = router;