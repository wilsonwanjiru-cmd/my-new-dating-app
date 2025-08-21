const multer = require('multer');
const { uploadFromBuffer } = require('../config/cloudinary');
const mongoose = require('mongoose');
const stream = require('stream');

// Debug: Verify Cloudinary configuration
console.log('ℹ️ Multer using Cloudinary config');

// ==================== Constants ====================
const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB
const UPLOAD_TIMEOUT = 30000; // 30 seconds
const ALLOWED_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
const ALLOWED_EXTENSIONS = ['jpg', 'jpeg', 'png', 'webp'];

// ==================== File Filter ====================
const datingFileFilter = (req, file, cb) => {
  console.log(`📥 Upload attempt: ${file.fieldname} - ${file.originalname} - ${file.mimetype}`);

  // Check mimetype
  if (!ALLOWED_MIME_TYPES.includes(file.mimetype)) {
    console.warn(`❌ Rejected file: invalid mimetype (${file.mimetype})`);
    return cb(new Error('INVALID_FILE_TYPE'));
  }

  // Check file extension
  const ext = file.originalname.split('.').pop().toLowerCase();
  if (!ALLOWED_EXTENSIONS.includes(ext)) {
    console.warn(`❌ Rejected file: invalid extension (${ext})`);
    return cb(new Error('INVALID_FILE_EXTENSION'));
  }

  cb(null, true);
};

// ==================== Memory Storage ====================
const memoryStorage = multer.memoryStorage();

// ==================== Multer Instance ====================
const upload = multer({
  storage: memoryStorage,
  limits: {
    fileSize: MAX_FILE_SIZE,
    files: 1
  },
  fileFilter: datingFileFilter
});

// ==================== Enhanced Error Handling ====================
const handleUploadError = (err) => {
  const errors = {
    LIMIT_FILE_SIZE: {
      code: 'FILE_TOO_LARGE',
      message: `File exceeds ${MAX_FILE_SIZE/1024/1024}MB limit`
    },
    INVALID_FILE_TYPE: {
      code: 'INVALID_FILE_TYPE',
      message: 'Only JPG, PNG, and WEBP allowed'
    },
    INVALID_FILE_EXTENSION: {
      code: 'INVALID_FILE_EXTENSION',
      message: 'Invalid file extension. Only JPG, PNG, and WEBP allowed'
    },
    UPLOAD_TIMEOUT: {
      code: 'UPLOAD_TIMEOUT',
      message: 'Upload timed out. Please try again'
    },
    CLOUDINARY_UPLOAD_FAILED: {
      code: 'CLOUDINARY_ERROR',
      message: 'Image processing failed'
    },
    CLOUDINARY_RESPONSE_INCOMPLETE: {
      code: 'CLOUDINARY_ERROR',
      message: 'Cloudinary response incomplete'
    }
  };
  
  return errors[err.message] || {
    code: 'UPLOAD_ERROR',
    message: err.message
  };
};

// ==================== Cloudinary Upload Handler ====================
const uploadToCloudinary = async (buffer, originalname, user) => {
  try {
    // Prepare Cloudinary options
    const userId = user?._id ? new mongoose.Types.ObjectId(user._id) : 'guest';
    const genderPrefix = user?.gender ? `${user.gender}/` : '';
    const ext = originalname.split('.').pop().toLowerCase();
    const publicId = `ruda-dating/${genderPrefix}${userId}/${Date.now()}.${ext}`;

    const options = {
      public_id: publicId,
      folder: 'ruda-dating',
      transformation: [
        { width: 500, height: 500, crop: 'thumb', gravity: 'face' },
        { quality: 'auto:good' },
        { fetch_format: 'auto' },
        { flags: 'strip_profile' } // Remove EXIF metadata
      ],
      context: {
        userId: userId.toString(),
        source: 'ruda_app',
        gender: user?.gender || 'unknown'
      }
    };

    console.log('⚡ Uploading to Cloudinary with options:', {
      public_id: options.public_id,
      folder: options.folder
    });
    
    // Upload to Cloudinary
    const result = await uploadFromBuffer(buffer, options);
    
    return {
      originalname: originalname,
      secure_url: result.url,
      url: result.url,
      public_id: result.public_id,
      publicId: result.public_id,
      size: result.bytes,
      mimetype: ALLOWED_MIME_TYPES.find(type => type.includes(ext)) || 'image/jpeg'
    };
  } catch (error) {
    console.error('🚨 Cloudinary upload failed:', error);
    throw error;
  }
};

// ==================== Exports ====================
const singlePhotoUpload = (req, res, next) => {
  upload.single('photo')(req, res, async (err) => {
    // Handle Multer errors first
    if (err) {
      const mappedError = handleUploadError(err);
      console.error(`❌ Upload error [${mappedError.code}]: ${mappedError.message}`);
      return res.status(400).json({
        success: false,
        code: mappedError.code,
        message: mappedError.message
      });
    }
    
    // Check if file exists
    if (!req.file) {
      return res.status(400).json({
        success: false,
        code: 'NO_FILE',
        message: 'No file uploaded'
      });
    }
    
    // Set timeout for Cloudinary upload
    const uploadTimeout = setTimeout(() => {
      console.error('🚨 Cloudinary upload timed out');
      return res.status(500).json({
        success: false,
        code: 'UPLOAD_TIMEOUT',
        message: 'Image upload timed out'
      });
    }, UPLOAD_TIMEOUT);

    try {
      // Upload to Cloudinary
      const cloudinaryResult = await uploadToCloudinary(
        req.file.buffer,
        req.file.originalname,
        req.user
      );
      
      // Clear timeout on success
      clearTimeout(uploadTimeout);
      
      // Attach Cloudinary result to request
      req.file = {
        ...req.file,
        ...cloudinaryResult,
        gender: req.user?.gender || 'unknown'
      };

      console.log('✅ Cloudinary upload successful:', {
        original: req.file.originalname,
        public_id: req.file.public_id,
        secure_url: req.file.secure_url,
        size: req.file.size,
        gender: req.file.gender
      });

      next();
    } catch (error) {
      clearTimeout(uploadTimeout);
      console.error('🚨 Final upload error:', error);
      
      const mappedError = handleUploadError(error);
      return res.status(500).json({
        success: false,
        code: mappedError.code,
        message: mappedError.message,
        details: process.env.NODE_ENV === 'development' ? error.message : undefined
      });
    }
  });
};

module.exports = {
  singlePhotoUpload
};