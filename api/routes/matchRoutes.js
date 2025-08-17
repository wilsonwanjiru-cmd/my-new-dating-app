const express = require('express');
const router = express.Router();
const { query, param, body } = require('express-validator');

// ==================== MIDDLEWARES ====================
const authMiddleware = require('../middlewares/authMiddleware'); // Fixed import
const validateRequestModule = require('../middlewares/validateRequest'); // Fixed import
const validateRequest = validateRequestModule.validateRequest; // Extract the function

// ==================== CONTROLLER IMPORT ====================
const matchController = require('../controllers/matchController');

console.log('[matchRoutes] Loaded matchController keys:', Object.keys(matchController));

// ==================== VALIDATION RULES ====================
const paginationRules = [
  query('page').optional().isInt({ min: 1 }).toInt(),
  query('limit').optional().isInt({ min: 1, max: 100 }).toInt()
];

const matchIdRules = [
  param('matchId').isMongoId().withMessage('Valid match ID required')
];

const userIdRules = [
  param('userId').isMongoId().withMessage('Valid user ID required')
];

// ==================== ROUTES ====================

// Get all matches (with pagination)
router.get(
  '/',
  authMiddleware.authenticate, // Fixed reference
  authMiddleware.checkGenderSet, // Fixed reference
  ...paginationRules,
  validateRequest,
  matchController.getMatches
);

// Get potential matches (gender-filtered)
router.get(
  '/potential',
  authMiddleware.authenticate, // Fixed reference
  authMiddleware.checkGenderSet, // Fixed reference
  ...paginationRules,
  validateRequest,
  matchController.getPotentialMatches
);

// Create match from mutual like
router.post(
  '/like',
  authMiddleware.authenticate, // Fixed reference
  authMiddleware.checkGenderSet, // Fixed reference
  [
    body('targetUserId')
      .isMongoId()
      .withMessage('Valid target user ID required')
  ],
  validateRequest,
  matchController.createMatchIfMutual
);

// Get details of a specific match
router.get(
  '/:matchId',
  authMiddleware.authenticate, // Fixed reference
  authMiddleware.checkGenderSet, // Fixed reference
  ...matchIdRules,
  validateRequest,
  matchController.getMatchDetails
);

// Unmatch a user
router.delete(
  '/:userId',
  authMiddleware.authenticate, // Fixed reference
  authMiddleware.checkGenderSet, // Fixed reference
  ...userIdRules,
  validateRequest,
  matchController.unmatchUser
);

// ==================== FALLBACK HANDLERS ====================
router.use((req, res) => {
  res.status(404).json({
    success: false,
    code: 'MATCH_ENDPOINT_NOT_FOUND',
    message: 'Match endpoint not found',
    path: req.path,
    suggestion: 'Check /api/health for available endpoints',
    validEndpoints: [
      'GET    /api/matches',
      'GET    /api/matches/potential',
      'POST   /api/matches/like',
      'GET    /api/matches/:matchId',
      'DELETE /api/matches/:userId'
    ]
  });
});

// Error handler
router.use((err, req, res, next) => {
  console.error('[MatchRoutes Error]', err);

  if (err.name === 'ValidationError') {
    return res.status(400).json({
      success: false,
      code: 'MATCH_VALIDATION_FAILED',
      message: 'Validation failed for match request',
      errors: err.errors
    });
  }

  res.status(500).json({
    success: false,
    code: 'MATCH_SYSTEM_ERROR',
    message: 'Internal server error in match system',
    error:
      process.env.NODE_ENV === 'development'
        ? { message: err.message, stack: err.stack }
        : undefined
  });
});

module.exports = router;





