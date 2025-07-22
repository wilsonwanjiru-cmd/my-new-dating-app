// controllers/photoController.js
const fs = require('fs');
const path = require('path');
const User = require('../models/user');
const cloudinary = require('../config/cloudinary');

// Upload profile photo to Cloudinary
exports.uploadPhotoToCloudinary = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, message: 'No file uploaded' });
    }

    const user = await User.findById(req.user.id);

    if (!user.isSubscribed && user.profileImages.length >= 7) {
      return res.status(403).json({
        success: false,
        message: 'Free users can upload a maximum of 7 photos. Please subscribe to upload more.',
        code: 'UPLOAD_LIMIT_REACHED',
      });
    }

    const uploadDir = 'tmp/uploads/';
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }

    const ext = path.extname(req.file.originalname).toLowerCase();
    const filename = `profile-${Date.now()}${ext}`;
    const filepath = path.join(uploadDir, filename);

    fs.writeFileSync(filepath, req.file.buffer);

    const result = await cloudinary.uploader.upload(filepath, {
      folder: 'dating-app/profiles',
      transformation: [
        { width: 800, height: 800, crop: 'limit' },
        { quality: 'auto' },
      ],
    });

    fs.unlinkSync(filepath);

    const updatedUser = await User.findByIdAndUpdate(
      req.user.id,
      {
        $push: {
          profileImages: {
            url: result.secure_url,
            publicId: result.public_id,
            uploadedAt: new Date(),
          },
        },
      },
      { new: true }
    );

    res.status(201).json({
      success: true,
      message: 'Photo uploaded successfully',
      imageUrl: result.secure_url,
      profileImages: updatedUser.profileImages,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error uploading photo',
      error: process.env.NODE_ENV === 'production' ? undefined : error.message,
      code: 'UPLOAD_ERROR',
    });
  }
};

exports.uploadPhoto = exports.uploadPhotoToCloudinary;

// Track photo view by a user (limit for free users)
exports.trackPhotoView = async (req, res) => {
  try {
    const { photoId } = req.body;

    if (!photoId) {
      return res.status(400).json({ success: false, message: 'Photo ID is required' });
    }

    const user = await User.findById(req.user.id);
    const now = new Date();

    if (user.isSubscribed) {
      return res.status(200).json({
        success: true,
        canView: true,
        isSubscribed: true,
        viewsRemaining: null,
      });
    }

    const lastReset = user.lastViewReset || new Date(0);
    const needsReset =
      now.getDate() !== lastReset.getDate() ||
      now.getMonth() !== lastReset.getMonth() ||
      now.getFullYear() !== lastReset.getFullYear();

    let updatedUser;

    if (needsReset) {
      updatedUser = await User.findByIdAndUpdate(
        req.user.id,
        {
          freePhotosViewed: 1,
          lastViewReset: now,
          $addToSet: { viewedPhotos: photoId },
        },
        { new: true }
      );
    } else {
      if (user.freePhotosViewed >= user.freePhotosLimit) {
        return res.status(200).json({
          success: true,
          canView: false,
          viewsRemaining: 0,
          message: 'Daily view limit reached',
        });
      }

      updatedUser = await User.findByIdAndUpdate(
        req.user.id,
        {
          $inc: { freePhotosViewed: 1 },
          $addToSet: { viewedPhotos: photoId },
        },
        { new: true }
      );
    }

    res.status(200).json({
      success: true,
      canView: true,
      isSubscribed: updatedUser.isSubscribed,
      viewsRemaining: updatedUser.freePhotosLimit - updatedUser.freePhotosViewed,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error tracking photo view',
      error: process.env.NODE_ENV === 'production' ? undefined : error.message,
      code: 'TRACKING_ERROR',
    });
  }
};

// Get user's uploaded profile photos with metadata
exports.getUserPhotos = async (req, res) => {
  try {
    const user = await User.findById(req.user.id).select(
      'profileImages isSubscribed freePhotosViewed freePhotosLimit'
    );

    const response = {
      success: true,
      isSubscribed: user.isSubscribed,
      uploadLimit: user.isSubscribed ? null : 7,
      currentUploads: user.profileImages.length,
      freeViews: {
        used: user.freePhotosViewed,
        limit: user.freePhotosLimit,
        remaining: user.freePhotosLimit - user.freePhotosViewed,
      },
      photos: user.profileImages.map((img, idx) => ({
        id: img.publicId,
        url: img.url,
        uploadedAt: img.uploadedAt,
        isLocked: !user.isSubscribed && idx >= 3,
      })),
    };

    res.status(200).json(response);
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error fetching photos',
      error: process.env.NODE_ENV === 'production' ? undefined : error.message,
      code: 'FETCH_PHOTOS_ERROR',
    });
  }
};

// Delete a photo from Cloudinary and user profile
exports.deletePhoto = async (req, res) => {
  try {
    const { photoId } = req.params;
    const user = await User.findById(req.user.id);

    const photoToDelete = user.profileImages.find((img) => img.publicId === photoId);

    if (!photoToDelete) {
      return res.status(404).json({ success: false, message: 'Photo not found' });
    }

    await cloudinary.uploader.destroy(photoToDelete.publicId);

    const updatedUser = await User.findByIdAndUpdate(
      req.user.id,
      { $pull: { profileImages: { publicId: photoId } } },
      { new: true }
    );

    res.status(200).json({
      success: true,
      message: 'Photo deleted successfully',
      profileImages: updatedUser.profileImages,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error deleting photo',
      error: process.env.NODE_ENV === 'production' ? undefined : error.message,
      code: 'DELETE_PHOTO_ERROR',
    });
  }
};

// Fetch all premium photos (for subscribed users)
exports.getAllPhotos = async (req, res) => {
  try {
    const users = await User.find({ 'profileImages.0': { $exists: true } })
      .select('profileImages')
      .lean();

    const premiumPhotos = users.flatMap((u) =>
      u.profileImages.map((img) => ({
        url: img.url,
        uploadedAt: img.uploadedAt,
        userId: u._id,
      }))
    );

    res.status(200).json({ success: true, photos: premiumPhotos });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to fetch premium photos',
      error: process.env.NODE_ENV === 'production' ? undefined : error.message,
    });
  }
};

// Fetch limited free photos (for free users)
exports.getFreePhotos = async (req, res) => {
  try {
    const users = await User.find({ 'profileImages.0': { $exists: true } })
      .select('profileImages')
      .lean();

    const freePhotos = users.flatMap((u) =>
      u.profileImages.slice(0, 3).map((img) => ({
        url: img.url,
        uploadedAt: img.uploadedAt,
        userId: u._id,
      }))
    );

    res.status(200).json({ success: true, photos: freePhotos });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to fetch free photos',
      error: process.env.NODE_ENV === 'production' ? undefined : error.message,
    });
  }
};
