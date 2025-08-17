const mongoose = require('mongoose');
const User = require('../models/user');
const Photo = require('../models/photo');
const Chat = require('../models/Chat');
const Notification = require('../models/notification');
const { deletePhoto: cloudinaryDelete } = require('../config/cloudinary');
const { formatDistanceToNow } = require('date-fns');

// ======================
// ENHANCED ERROR HANDLER
// ======================
const handleError = (res, error, customMessage = 'Internal server error', code = 'SERVER_ERROR') => {
  console.error(`[PhotoController] ${customMessage}:`, error);

  if (error instanceof mongoose.Error.ValidationError) {
    return res.status(400).json({
      success: false,
      code: 'VALIDATION_ERROR',
      message: error.message,
      errors: error.errors
    });
  }

  if (error instanceof mongoose.Error.CastError) {
    return res.status(400).json({
      success: false,
      code: 'INVALID_ID',
      message: 'Invalid ID format'
    });
  }

  // Handle Cloudinary-specific errors
  if (error.message.includes('Cloudinary') || error.message.includes('upload')) {
    return res.status(500).json({
      success: false,
      code: 'CLOUDINARY_ERROR',
      message: 'Image processing failed'
    });
  }

  return res.status(500).json({
    success: false,
    code,
    message: customMessage,
    error: process.env.NODE_ENV === 'development' ? error.message : undefined
  });
};

// ======================
// UPDATED PHOTO FEED WITH GENDER PREFERENCE FILTERING & ONLINE STATUS
// ======================
const getPhotoFeed = async (req, res) => {
  try {
    const { page = 1, limit = 20 } = req.query;
    const skip = (parseInt(page) - 1) * parseInt(limit);
    const currentUserId = req.user._id;

    // Get current user with gender preferences
    const currentUser = await User.findById(currentUserId)
      .select('gender genderPreference subscription isSubscribed');
    
    if (!currentUser) {
      return res.status(404).json({
        success: false,
        code: 'USER_NOT_FOUND',
        message: 'User not found'
      });
    }

    // Get opposite gender based on blueprint logic
    const oppositeGender = currentUser.gender === 'male' ? 'female' : 'male';
    const genderFilter = currentUser.genderPreference.includes(oppositeGender) 
      ? [oppositeGender] 
      : currentUser.genderPreference;

    // Get photos filtered by the user's gender preferences
    const photos = await Photo.aggregate([
      {
        $match: {
          status: 'approved',
          uploader: { $ne: new mongoose.Types.ObjectId(currentUserId) },
          gender: { $in: genderFilter }
        }
      },
      { $sort: { createdAt: -1 } },
      { $skip: skip },
      { $limit: parseInt(limit) },
      {
        $lookup: {
          from: 'users',
          localField: 'uploader',
          foreignField: '_id',
          as: 'owner',
          pipeline: [
            {
              $project: {
                name: 1,
                age: 1,
                gender: 1,
                profileImages: 1,
                isOnline: 1,
                lastActive: 1,
                isSubscribed: 1
              }
            }
          ]
        }
      },
      { $unwind: '$owner' },
      {
        $addFields: {
          isLiked: { $in: [new mongoose.Types.ObjectId(currentUserId), '$likedBy'] },
          likeCount: { $size: '$likedBy' },
          // Allow chat if user has active subscription
          canChat: currentUser.isSubscribed
        }
      },
      {
        $project: {
          _id: 1,
          imageUrl: 1,
          createdAt: 1,
          isLiked: 1,
          likeCount: 1,
          canChat: 1,
          owner: {
            _id: '$owner._id',
            name: '$owner.name',
            age: '$owner.age',
            gender: '$owner.gender',
            isSubscribed: '$owner.isSubscribed',
            isOnline: '$owner.isOnline',
            lastActive: '$owner.lastActive',
            status: {
              $cond: [
                { $eq: ['$owner.isOnline', true] },
                'online',
                {
                  $concat: [
                    'last seen ', 
                    {
                      $toString: {
                        $dateToString: {
                          format: "%Y-%m-%d",
                          date: '$owner.lastActive'
                        }
                      }
                    }
                  ]
                }
              ]
            },
            avatar: { $arrayElemAt: ['$owner.profileImages.url', 0] }
          }
        }
      }
    ]);

    const total = await Photo.countDocuments({
      status: 'approved',
      uploader: { $ne: currentUserId },
      gender: { $in: genderFilter }
    });

    res.status(200).json({
      success: true,
      data: {
        photos,
        pagination: {
          currentPage: parseInt(page),
          totalPages: Math.ceil(total / limit),
          totalItems: total,
          itemsPerPage: parseInt(limit)
        }
      }
    });
  } catch (error) {
    return handleError(res, error, 'Error fetching photo feed');
  }
};

// ======================
// UPDATED PHOTO UPLOAD WITH MODERATION WORKFLOW
// ======================
const uploadPhoto = async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    // Validate file exists
    if (!req.file) {
      await session.abortTransaction();
      return res.status(400).json({
        success: false,
        code: 'NO_FILE',
        message: 'No file uploaded'
      });
    }

    // Use Cloudinary's secure_url and public_id directly
    const cloudinaryUrl = req.file.secure_url;
    const cloudinaryPublicId = req.file.public_id;

    console.log('📝 Creating photo document from Cloudinary result:', {
      url: cloudinaryUrl,
      publicId: cloudinaryPublicId,
      size: req.file.size
    });

    // Create photo document using Cloudinary's result
    const newPhoto = new Photo({
      user: req.user._id,
      uploader: req.user._id,
      gender: req.user.gender,
      url: cloudinaryUrl,
      imageUrl: cloudinaryUrl,
      publicId: cloudinaryPublicId,
      status: 'pending', // Initial status
      likedBy: [],
      likes: 0
    });
    
    await newPhoto.save({ session });

    // Update user's profile images
    const updatedUser = await User.findByIdAndUpdate(
      req.user._id,
      {
        $push: {
          profileImages: {
            url: cloudinaryUrl,
            publicId: cloudinaryPublicId,
            uploadedAt: new Date(),
          },
        },
      },
      { new: true, session }
    );

    // Basic content safety check (pseudo-implementation)
    const isSafe = await basicContentSafetyCheck(req.file);
    if (!isSafe) {
      newPhoto.status = 'rejected';
      await newPhoto.save({ session });
      await cloudinaryDelete(cloudinaryPublicId);
      
      await session.commitTransaction();
      
      return res.status(400).json({
        success: false,
        code: 'CONTENT_VIOLATION',
        message: 'Photo violates content guidelines'
      });
    }

    // For now, automatically approve all photos
    newPhoto.status = 'approved';
    await newPhoto.save({ session });

    await session.commitTransaction();

    console.log('✅ Photo document saved:', newPhoto._id);

    // Emit new photo event for real-time updates
    if (global.io) {
      global.io.emit('new-photo', {
        userId: req.user._id,
        photoId: newPhoto._id,
        gender: req.user.gender
      });
    }

    res.status(201).json({
      success: true,
      data: {
        photo: {
          _id: newPhoto._id,
          imageUrl: newPhoto.imageUrl,
          url: newPhoto.url,
          createdAt: newPhoto.createdAt,
          likes: newPhoto.likes,
          status: newPhoto.status,
          uploader: {
            _id: req.user._id,
            name: req.user.name,
            age: req.user.age,
            gender: req.user.gender
          }
        },
        profileImages: updatedUser.profileImages.map(img => ({
          url: img.url,
          publicId: img.publicId,
          uploadedAt: img.uploadedAt
        }))
      }
    });
  } catch (error) {
    await session.abortTransaction();
    console.error('❌ Controller error:', {
      message: error.message,
      stack: error.stack
    });
    return handleError(res, error, 'Error saving photo');
  } finally {
    session.endSession();
  }
};

// ======================
// BASIC CONTENT SAFETY CHECK
// ======================
const basicContentSafetyCheck = async (file) => {
  try {
    // Implement basic checks for inappropriate content
    // This is a placeholder - you should expand this with actual checks
    const suspiciousTerms = ['nude', 'explicit', 'xxx'];
    const filename = file.originalname.toLowerCase();
    
    // Check filename for suspicious terms
    if (suspiciousTerms.some(term => filename.includes(term))) {
      console.warn('🚨 Content violation detected in filename:', filename);
      return false;
    }
    
    // Add more checks here (file size ratios, etc.)
    return true; // Default to safe
  } catch (error) {
    console.error('Content safety check failed:', error);
    return true; // Fail safe
  }
};

// ======================
// PHOTO MANAGEMENT
// ======================
const getUserPhotos = async (req, res) => {
  try {
    const photos = await Photo.find({ 
      uploader: req.user._id,
      status: 'approved' // Only show approved photos
    }).populate('uploader', 'name age gender isOnline');

    res.status(200).json({
      success: true,
      data: {
        photos: photos.map(photo => ({
          _id: photo._id,
          imageUrl: photo.imageUrl,
          url: photo.url,
          createdAt: photo.createdAt,
          likes: photo.likes,
          uploader: photo.uploader
        }))
      }
    });
  } catch (error) {
    return handleError(res, error, 'Error fetching photos');
  }
};

const deletePhoto = async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const { photoId } = req.params;
    const userId = req.user._id;

    console.log(`Attempting to delete photo: ${photoId} for user: ${userId}`);

    // Find photo to delete
    const photo = await Photo.findOne({ 
      _id: photoId, 
      uploader: userId 
    }).session(session);
    
    if (!photo) {
      await session.abortTransaction();
      console.log(`❌ Photo not found: ${photoId} or user not authorized`);
      return res.status(404).json({
        success: false,
        code: 'PHOTO_NOT_FOUND',
        message: 'Photo not found or no permission'
      });
    }

    // Delete from Cloudinary if publicId exists
    if (photo.publicId) {
      console.log(`Deleting Cloudinary asset: ${photo.publicId}`);
      await cloudinaryDelete(photo.publicId);
    }
    
    // Delete photo document
    await Photo.deleteOne({ _id: photoId }).session(session);

    // Remove from user's profile images
    await User.findByIdAndUpdate(
      userId,
      { $pull: { profileImages: { publicId: photo.publicId } } },
      { session }
    );

    await session.commitTransaction();
    console.log(`✅ Photo deleted: ${photoId}`);

    res.status(200).json({
      success: true,
      message: 'Photo deleted successfully'
    });
  } catch (error) {
    await session.abortTransaction();
    return handleError(res, error, 'Error deleting photo');
  } finally {
    session.endSession();
  }
};

// ======================
// CHAT INITIATION (FROM PHOTO)
// ======================
const initiateChat = async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const { photoId } = req.body;
    const currentUserId = req.user._id;

    console.log(`Initiating chat for photo: ${photoId} by user: ${currentUserId}`);

    const photo = await Photo.findById(photoId)
      .populate('uploader')
      .session(session);

    if (!photo) {
      await session.abortTransaction();
      console.log(`❌ Photo not found: ${photoId}`);
      return res.status(404).json({
        success: false,
        code: 'PHOTO_NOT_FOUND',
        message: 'Photo not found'
      });
    }

    // Ensure photo is approved
    if (photo.status !== 'approved') {
      await session.abortTransaction();
      return res.status(400).json({
        success: false,
        code: 'PHOTO_NOT_APPROVED',
        message: 'Photo is not approved for chat initiation'
      });
    }

    if (photo.uploader._id.equals(currentUserId)) {
      await session.abortTransaction();
      return res.status(400).json({
        success: false,
        code: 'SELF_CHAT',
        message: "You can't start a chat with yourself"
      });
    }

    // Check subscription status
    if (!req.user.isSubscribed) {
      await session.abortTransaction();
      return res.status(403).json({
        success: false,
        code: "SUBSCRIPTION_REQUIRED",
        message: "Subscribe to initiate chats"
      });
    }

    let chat = await Chat.findOne({
      participants: { $all: [currentUserId, photo.uploader._id] },
      photo: photoId
    }).session(session);

    if (!chat) {
      chat = await Chat.create([{
        participants: [currentUserId, photo.uploader._id],
        photo: photoId,
        initiatedBy: currentUserId,
        messages: [{
          sender: currentUserId,
          content: `I saw your photo and wanted to chat!`,
          isRead: false,
          sentAt: new Date()
        }],
        createdAt: new Date()
      }], { session });

      await Notification.create([{
        user: photo.uploader._id,
        from: currentUserId,
        type: 'chat_initiated',
        message: `${req.user.name} started a chat about your photo`,
        chat: chat[0]._id,
        photo: photoId,
        data: {
          photoUrl: photo.imageUrl,
          senderName: req.user.name,
          senderPhoto: req.user.profileImages[0]?.url || null
        }
      }], { session });

      if (global.io) {
        global.io.to(`user-${photo.uploader._id}`).emit('new-chat', {
          chatId: chat[0]._id,
          fromUserId: currentUserId,
          fromUserName: req.user.name,
          photoId,
          previewMessage: 'I saw your photo and wanted to chat!'
        });
      }
    }

    await session.commitTransaction();
    console.log(`✅ Chat initiated for photo: ${photoId}`);

    res.status(200).json({
      success: true,
      data: {
        chatId: chat._id || chat[0]._id,
        requiresSubscription: !req.user.isSubscribed,
        recipient: {
          id: photo.uploader._id,
          name: photo.uploader.name,
          avatar: photo.uploader.profileImages[0]?.url || null,
          isOnline: photo.uploader.isOnline,
          status: photo.uploader.isOnline
            ? 'online'
            : `last seen ${formatDistanceToNow(photo.uploader.lastActive)} ago`
        }
      }
    });
  } catch (error) {
    await session.abortTransaction();
    return handleError(res, error, 'Error initiating chat');
  } finally {
    session.endSession();
  }
};

// ======================
// GET PHOTO BY ID (WITH STATUS CHECK)
// ======================
const getPhotoById = async (req, res) => {
  try {
    const photoId = req.params.id;
    console.log(`Fetching photo with ID: ${photoId}`);

    const photo = await Photo.findOne({
      _id: photoId,
      status: 'approved' // Only return approved photos
    }).populate('uploader', 'name age gender isOnline');

    if (!photo) {
      console.log(`❌ Photo not found or not approved: ${photoId}`);
      return res.status(404).json({
        success: false,
        code: 'PHOTO_NOT_FOUND',
        message: 'Photo not found or not approved'
      });
    }

    res.status(200).json({
      success: true,
      data: {
        _id: photo._id,
        imageUrl: photo.imageUrl,
        url: photo.url,
        createdAt: photo.createdAt,
        likes: photo.likes,
        uploader: photo.uploader
      }
    });
  } catch (error) {
    console.error(`Error fetching photo ${req.params.id}:`, error);
    handleError(res, error, 'Error getting photo by ID');
  }
};

module.exports = {
  getPhotoFeed,
  uploadPhoto,
  getUserPhotos,
  deletePhoto,
  initiateChat,
  getPhotoById
};