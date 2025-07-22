// routes/photoRoutes.js
// routes/photoRoutes.js
const express = require('express');
const multer = require('multer');
const path = require('path');
const validateSubscription = require('../middlewares/validateSubscription');
const photoController = require('../controllers/photoController');

const router = express.Router();

// Configure multer with memory storage
const storage = multer.memoryStorage();
const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 }, // Limit file size to 5MB
  fileFilter: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    if (!['.jpg', '.jpeg', '.png'].includes(ext)) {
      return cb(new Error('Only JPG, JPEG, and PNG files are allowed.'));
    }
    cb(null, true);
  }
});

// Upload photo to Cloudinary (protected)
router.post(
  '/upload',
  validateSubscription,
  upload.single('photo'),
  async (req, res, next) => {
    try {
      if (!req.file) {
        return res.status(400).json({ success: false, message: 'No file uploaded.' });
      }
      await photoController.uploadPhotoToCloudinary(req, res);
    } catch (error) {
      next(error);
    }
  }
);

// Get all photos (protected)
router.get('/all', validateSubscription, photoController.getAllPhotos);

// Get free photos (public)
router.get('/free', photoController.getFreePhotos);

module.exports = router;
