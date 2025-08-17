const express = require('express');
const router = express.Router();
const rateLimit = require('express-rate-limit');
const { authenticate } = require('../middlewares/authMiddleware');
const { singlePhotoUpload } = require('../middlewares/multer');
const {
  getPhotoFeed,
  uploadPhoto,
  getUserPhotos,
  deletePhoto,
  initiateChat,
  getPhotoById
} = require('../controllers/photoController'); // Removed toggleLike
const { testConnection } = require('../config/cloudinary');

// ==================== DEBUG MIDDLEWARE ====================
const logUpload = (req, res, next) => {
  console.log('📥 Received upload request');
  next();
};

// ==================== RATE LIMITING ====================
const uploadLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  keyGenerator: (req) => req.user.id,
  handler: (req, res) => {
    res.status(429).json({
      success: false,
      code: 'UPLOAD_LIMIT_EXCEEDED',
      message: 'Too many photo uploads. Please try again later.'
    });
  }
});

const interactionLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 30,
  keyGenerator: (req) => req.user.id,
  handler: (req, res) => {
    res.status(429).json({
      success: false,
      code: 'INTERACTION_LIMIT',
      message: 'Too many actions. Please slow down.'
    });
  }
});

// ==================== TEST ROUTE ====================
router.get('/test-cloudinary', async (req, res) => {
  try {
    const result = await testConnection();
    res.status(result.success ? 200 : 500).json(result);
  } catch (error) {
    res.status(500).json({
      success: false,
      error: 'Cloudinary test failed unexpectedly'
    });
  }
});

// ==================== PHOTO FEED ROUTE ====================
router.get('/feed', 
  authenticate,
  interactionLimiter,
  getPhotoFeed
);

// ==================== PHOTO UPLOAD ROUTE ====================
router.post(
  '/',
  authenticate,
  uploadLimiter,
  logUpload,
  singlePhotoUpload,
  (req, res, next) => {
    if (req.file) {
      console.log('✅ Multer processed file:', req.file.originalname);
    }
    next();
  },
  uploadPhoto
);

// ==================== USER PHOTOS ROUTE ====================
router.get('/user', 
  authenticate,
  getUserPhotos
);

// ==================== PHOTO DETAIL ROUTE ====================
router.get('/:id', 
  authenticate,
  getPhotoById
);

// ==================== DELETE PHOTO ROUTE ====================
router.delete('/:id', 
  authenticate,
  interactionLimiter,
  deletePhoto
);

// ==================== CHAT INITIATION ROUTE ====================
router.post('/initiate-chat', 
  authenticate,
  interactionLimiter,
  initiateChat
);

// ==================== ERROR HANDLER ====================
router.use((err, req, res, next) => {
  if (err.name === 'MulterError') {
    let status = 400;
    if (err.code === 'LIMIT_FILE_SIZE') status = 413;
    
    return res.status(status).json({
      success: false,
      code: err.code,
      message: err.message
    });
  }

  if (err.message.includes('Cloudinary')) {
    return res.status(500).json({
      success: false,
      code: 'CLOUDINARY_ERROR',
      message: 'Image processing failed'
    });
  }

  console.error('🚨 Unhandled error:', err);
  res.status(500).json({
    success: false,
    code: 'SERVER_ERROR',
    message: 'Internal server error'
  });
});

module.exports = router;;