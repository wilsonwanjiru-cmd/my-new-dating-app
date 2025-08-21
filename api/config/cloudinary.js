const cloudinary = require('cloudinary').v2;
const stream = require('stream');
require('dotenv').config();

// ==================== CONFIGURATION VALIDATION ====================
const REQUIRED_ENV = [
  'CLOUDINARY_CLOUD_NAME',
  'CLOUDINARY_API_KEY',
  'CLOUDINARY_API_SECRET'
];

// Validate environment variables with detailed errors
REQUIRED_ENV.forEach(env => {
  if (!process.env[env]) {
    const error = new Error(`🚨 Missing required environment variable: ${env}`);
    console.error(error.message);
    throw error;
  }
});

// Enhanced Cloudinary configuration
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
  secure: true,
  cdn_subdomain: true,
  private_cdn: !!process.env.CLOUDINARY_CDN_DOMAIN,
  secure_distribution: process.env.CLOUDINARY_CDN_DOMAIN || 'res.cloudinary.com'
});

// ==================== DEBUG VALIDATION ====================
console.log('🔐 Cloudinary configuration verified:', {
  cloud_name: cloudinary.config().cloud_name,
  api_key: cloudinary.config().api_key,
  secure: cloudinary.config().secure
});

// Validate Cloudinary instance
const validateCloudinaryInstance = () => {
  const issues = [];
  
  if (!cloudinary) issues.push('Cloudinary instance not created');
  if (!cloudinary.uploader) issues.push('Uploader module missing');
  
  // Check if upload_stream exists and is a function
  if (typeof cloudinary.uploader?.upload_stream !== 'function') {
    issues.push('upload_stream method missing');
  }
  
  return issues;
};

const initializationIssues = validateCloudinaryInstance();
if (initializationIssues.length > 0) {
  console.error('🚨 Critical Cloudinary initialization issues:', initializationIssues);
  throw new Error('Cloudinary not properly initialized');
} else {
  console.log('✅ Cloudinary fully initialized with upload_stream support');
}

// ==================== UPLOAD STREAM ENHANCEMENTS ====================

/**
 * Wrapper for upload_stream with enhanced error handling
 * @param {object} options - Cloudinary upload options
 * @param {function} callback - Callback function
 * @returns {stream} Upload stream
 */
cloudinary.uploader.upload_stream_wrapper = (options, callback) => {
  console.log('⚡ Creating upload stream with options:', {
    public_id: options.public_id ? options.public_id.slice(0, 20) + '...' : 'auto',
    folder: options.folder || 'none'
  });
  
  return cloudinary.uploader.upload_stream(options, (error, result) => {
    if (error) {
      console.error('🚨 Cloudinary Upload Error:', {
        message: error.message,
        http_code: error.http_code,
        stack: error.stack
      });
    }
    callback(error, result);
  });
};

// ==================== BUFFER UPLOAD METHOD ====================

/**
 * Upload from buffer - more reliable for server-side uploads
 * @param {Buffer} buffer - File buffer
 * @param {object} options - Cloudinary upload options
 * @returns {Promise<Object>} Upload result
 */
const uploadFromBuffer = (buffer, options = {}) => {
  return new Promise((resolve, reject) => {
    console.log('📤 Uploading buffer with options:', {
      public_id: options.public_id ? options.public_id.slice(0, 20) + '...' : 'auto',
      folder: options.folder || 'none'
    });
    
    const uploadStream = cloudinary.uploader.upload_stream_wrapper(
      options,
      (error, result) => {
        if (error) {
          console.error('🚨 Buffer upload error:', error);
          return reject(error);
        }
        
        // Validate result
        if (!result.secure_url || !result.public_id) {
          const error = new Error('Cloudinary response incomplete');
          console.error('🚨 Incomplete Cloudinary response:', result);
          return reject(error);
        }
        
        console.log('✅ Buffer upload success:', {
          public_id: result.public_id,
          secure_url: result.secure_url,
          format: result.format,
          bytes: result.bytes
        });
        
        resolve({
          public_id: result.public_id,
          secure_url: result.secure_url,
          url: result.secure_url,
          bytes: result.bytes,
          format: result.format
        });
      }
    );
    
    const bufferStream = new stream.PassThrough();
    bufferStream.end(buffer);
    bufferStream.pipe(uploadStream);
  });
};

// ==================== OTHER CLOUDINARY METHODS ====================

/**
 * Delete photo from Cloudinary with error handling
 * @param {string} publicId - Cloudinary public ID
 * @returns {Promise<Object>} Deletion result
 */
const deletePhoto = async (publicId) => {
  try {
    console.log(`🗑️ Deleting Cloudinary asset: ${publicId}`);
    const result = await cloudinary.uploader.destroy(publicId, {
      invalidate: true,
      resource_type: 'image'
    });
    
    if (result.result !== 'ok') {
      throw new Error(`Deletion failed: ${result.result}`);
    }
    
    console.log('✅ Deletion successful:', publicId);
    return result;
  } catch (error) {
    console.error('🚨 [Cloudinary] Deletion error:', {
      publicId,
      error: error.message
    });
    
    // Handle specific Cloudinary errors
    if (error.message.includes('not found')) {
      error.code = 'RESOURCE_NOT_FOUND';
    }
    
    throw error;
  }
};

/**
 * Generate secure CDN URL with transformation
 * @param {string} publicId - Cloudinary public ID
 * @param {Object} options - Transformation options
 * @returns {string} Secure URL
 */
const generateSecureUrl = (publicId, options = {}) => {
  return cloudinary.url(publicId, {
    secure: true,
    sign_url: true,
    transformation: [
      { width: options.width || 500, height: options.height || 500, crop: 'fill' },
      { quality: 'auto' },
      ...(options.blur ? [{ effect: `blur:${options.blur}` }] : [])
    ]
  });
};

/**
 * Check moderation status of an image
 * @param {string} publicId - Cloudinary public ID
 * @returns {Promise<Object>} Moderation status
 */
const checkModeration = async (publicId) => {
  try {
    const resource = await cloudinary.api.resource(publicId, {
      moderation: true
    });
    
    return {
      approved: resource.moderation?.[0]?.status === 'approved',
      status: resource.moderation?.[0]?.status || 'pending',
      response: resource.moderation?.[0]?.response || {}
    };
  } catch (error) {
    console.error('🚨 [Cloudinary] Moderation check error:', error);
    throw new Error('Failed to check moderation status');
  }
};

// ==================== TEST METHODS ====================

/**
 * Test Cloudinary connection
 * @returns {Promise<Object>} Test result
 */
const testConnection = async () => {
  try {
    // Test direct API connection
    const ping = await cloudinary.api.ping();
    
    return {
      success: true,
      status: ping.status,
      config: {
        cloud_name: cloudinary.config().cloud_name,
        api_key: cloudinary.config().api_key,
        secure: cloudinary.config().secure
      },
      methods: {
        upload_stream: typeof cloudinary.uploader.upload_stream === 'function'
      }
    };
  } catch (error) {
    console.error('❌ Cloudinary connection test failed:', error);
    return {
      success: false,
      error: error.message,
      config: cloudinary.config()
    };
  }
};

/**
 * Test direct upload with sample image
 * @returns {Promise<Object>} Test result
 */
const testDirectUpload = async () => {
  try {
    console.log('🧪 Testing direct upload to Cloudinary');
    const result = await cloudinary.uploader.upload(
      'https://res.cloudinary.com/demo/image/upload/sample.jpg',
      { public_id: 'test_upload' }
    );
    
    console.log('✅ Direct upload test successful:', {
      public_id: result.public_id,
      secure_url: result.secure_url
    });
    
    return {
      success: true,
      public_id: result.public_id,
      url: result.secure_url
    };
  } catch (error) {
    console.error('❌ Direct upload test failed:', error);
    return {
      success: false,
      error: error.message
    };
  }
};

// Export with production enhancements
module.exports = {
  cloudinary,
  uploadFromBuffer, // Recommended for server-side uploads
  deletePhoto,
  generateSecureUrl,
  checkModeration,
  testConnection,
  testDirectUpload
};