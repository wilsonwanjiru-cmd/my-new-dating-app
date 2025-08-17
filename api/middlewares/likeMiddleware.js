// middlewares/likeMiddleware.js
const mongoose = require('mongoose');
const { formatDistanceToNow } = require('date-fns');
const { validatePagination } = require('./validatePagination');
const { logError } = require('../utils/errorLogger');

// ==================== Constants ====================
const LIKE_COOLDOWN_HOURS = 6;
const MAX_PHOTOS_PER_REQUEST = 50;

// ==================== Middleware Functions ====================

/**
 * Validates photo ID and checks photo existence
 */
const validatePhoto = async (req, res, next) => {
  try {
    const { photoId } = req.params;

    if (!mongoose.Types.ObjectId.isValid(photoId)) {
      return res.status(400).json({ 
        success: false, 
        error: 'INVALID_PHOTO_ID',
        message: 'Invalid photo ID format'
      });
    }

    const photo = await mongoose.model('Photo').findById(photoId)
      .populate('userId', 'name profileImages isOnline lastActive')
      .lean();

    if (!photo) {
      return res.status(404).json({ 
        success: false, 
        error: 'PHOTO_NOT_FOUND',
        message: 'Photo not found'
      });
    }

    // Prevent self-liking
    if (photo.userId._id.equals(req.user._id)) {
      return res.status(400).json({ 
        success: false, 
        error: 'SELF_LIKE',
        message: 'Cannot like your own photo'
      });
    }

    req.photo = photo;
    next();
  } catch (error) {
    logError('Photo validation error', error, req);
    return res.status(500).json({ 
      success: false, 
      error: 'PHOTO_VALIDATION_ERROR',
      message: 'Error validating photo'
    });
  }
};

/**
 * Checks like cooldown period
 */
const checkLikeCooldown = async (req, res, next) => {
  try {
    const recentLike = await mongoose.model('Like').findOne({
      photoId: req.params.photoId,
      userId: req.user._id,
      createdAt: { $gt: new Date(Date.now() - LIKE_COOLDOWN_HOURS * 60 * 60 * 1000) }
    });

    if (recentLike) {
      return res.status(429).json({
        success: false,
        error: 'LIKE_COOLDOWN',
        message: `You can like this photo again in ${formatDistanceToNow(recentLike.createdAt)}`,
        cooldownEnd: recentLike.createdAt
      });
    }

    next();
  } catch (error) {
    logError('Like cooldown check error', error, req);
    next(); // Fail open - allow the like to proceed
  }
};

/**
 * Validates batch photo IDs for like status checks
 */
const validateBatchPhotoIds = (req, res, next) => {
  const { photoIds } = req.body;

  if (!photoIds || !Array.isArray(photoIds)) {
    return res.status(400).json({ 
      success: false, 
      error: 'MISSING_PHOTO_IDS',
      message: 'Array of photo IDs is required'
    });
  }

  if (photoIds.length > MAX_PHOTOS_PER_REQUEST) {
    return res.status(400).json({ 
      success: false, 
      error: 'TOO_MANY_PHOTOS',
      message: `Maximum ${MAX_PHOTOS_PER_REQUEST} photos per request`
    });
  }

  const invalidIds = photoIds.filter(id => !mongoose.Types.ObjectId.isValid(id));
  if (invalidIds.length > 0) {
    return res.status(400).json({ 
      success: false, 
      error: 'INVALID_PHOTO_IDS',
      message: 'Contains invalid photo IDs',
      invalidIds
    });
  }

  req.photoIds = photoIds;
  next();
};

/**
 * Checks for mutual likes (potential matches)
 */
const checkForMutualLike = async (req, res, next) => {
  try {
    const mutualLike = await mongoose.model('Like').findOne({
      photoId: { $in: req.user.likedPhotos },
      userId: req.photo.userId._id
    });

    req.isMutualLike = !!mutualLike;
    next();
  } catch (error) {
    logError('Mutual like check error', error, req);
    req.isMutualLike = false;
    next();
  }
};

// ==================== Middleware Chains ====================

const likePhotoValidation = [
  validatePhoto,
  checkLikeCooldown,
  checkForMutualLike
];

const getLikedPhotosValidation = [
  validatePagination
];

const checkLikeStatusValidation = [
  validateBatchPhotoIds
];

module.exports = {
  validatePhoto,
  checkLikeCooldown,
  validateBatchPhotoIds,
  checkForMutualLike,
  likePhotoValidation,
  getLikedPhotosValidation,
  checkLikeStatusValidation
};