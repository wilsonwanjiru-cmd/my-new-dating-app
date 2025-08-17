const { logError } = require('../utils/errorLogger');

// Default and maximum values for dating app feeds
const DATING_APP_PAGINATION = {
  DEFAULT_PAGE: 1,
  DEFAULT_LIMIT: 20,
  MAX_LIMIT: 50, // Optimized for mobile performance
  MIN_LIMIT: 5,
  MAX_PAGE: 1000 // Prevent deep pagination performance issues
};

/**
 * Formats consistent error responses for pagination
 */
const formatPaginationError = (type, details = {}) => {
  const errorTemplates = {
    INVALID_PAGE: {
      code: 'INVALID_PAGE',
      message: `Page must be between ${DATING_APP_PAGINATION.DEFAULT_PAGE} and ${DATING_APP_PAGINATION.MAX_PAGE}`
    },
    INVALID_LIMIT: {
      code: 'INVALID_LIMIT',
      message: `Limit must be between ${DATING_APP_PAGINATION.MIN_LIMIT} and ${DATING_APP_PAGINATION.MAX_LIMIT}`
    },
    PAGINATION_ERROR: {
      code: 'PAGINATION_ERROR',
      message: 'Failed to process pagination parameters'
    }
  };

  return {
    success: false,
    error: {
      ...errorTemplates[type],
      ...details,
      timestamp: new Date().toISOString()
    }
  };
};

/**
 * Validates and normalizes pagination parameters for dating feeds
 */
const validateDatingPagination = (config = {}) => {
  // Allow route-specific overrides
  const defaults = {
    ...DATING_APP_PAGINATION,
    ...config
  };

  return (req, res, next) => {
    try {
      // 1. Extract and parse parameters
      let { page = defaults.DEFAULT_PAGE, limit = defaults.DEFAULT_LIMIT } = req.query;
      const { cursor, lastSeenId } = req.query;

      // 2. Convert to integers with fallbacks
      page = parseInt(page, 10) || defaults.DEFAULT_PAGE;
      limit = parseInt(limit, 10) || defaults.DEFAULT_LIMIT;

      // 3. Validate page parameters
      if (page < 1 || page > defaults.MAX_PAGE) {
        return res.status(400).json(formatPaginationError('INVALID_PAGE', {
          details: {
            received: req.query.page,
            allowedRange: `1-${defaults.MAX_PAGE}`,
            recommended: defaults.DEFAULT_PAGE
          }
        }));
      }

      // 4. Validate limit parameters
      if (limit < defaults.MIN_LIMIT || limit > defaults.MAX_LIMIT) {
        return res.status(400).json(formatPaginationError('INVALID_LIMIT', {
          details: {
            received: req.query.limit,
            allowedRange: `${defaults.MIN_LIMIT}-${defaults.MAX_LIMIT}`,
            recommended: defaults.DEFAULT_LIMIT
          }
        }));
      }

      // 5. Prepare pagination object
      req.pagination = {
        page,
        limit,
        skip: (page - 1) * limit,
        ...(cursor && { cursor }), // For cursor-based pagination
        ...(lastSeenId && { lastSeenId }) // For infinite scroll
      };

      // 6. Add dating-specific metadata
      req.paginationMeta = {
        type: 'dating_feed',
        recommendedLimit: defaults.DEFAULT_LIMIT,
        maxItems: defaults.MAX_LIMIT * defaults.MAX_PAGE,
        supportsCursor: true
      };

      next();
    } catch (error) {
      logError('Pagination Validation Error', error, req);
      res.status(500).json(formatPaginationError('PAGINATION_ERROR', {
        details: process.env.NODE_ENV === 'development' ? {
          error: error.message,
          stack: error.stack
        } : undefined
      }));
    }
  };
};

/**
 * Specialized pagination for photo feeds
 */
const validatePhotoFeedPagination = validateDatingPagination({
  DEFAULT_LIMIT: 15, // Optimal for photo grids
  MAX_LIMIT: 30,
  MIN_LIMIT: 3
});

/**
 * Specialized pagination for chat messages
 */
const validateChatPagination = validateDatingPagination({
  DEFAULT_LIMIT: 25,
  MAX_LIMIT: 50,
  MIN_LIMIT: 10
});

/**
 * Specialized pagination for user search
 */
const validateUserSearchPagination = validateDatingPagination({
  DEFAULT_LIMIT: 12, // Fits common grid layouts
  MAX_LIMIT: 24
});

module.exports = {
  validateDatingPagination,
  validatePhotoFeedPagination,
  validateChatPagination,
  validateUserSearchPagination,
  // Legacy export
  validatePagination: validateDatingPagination
};