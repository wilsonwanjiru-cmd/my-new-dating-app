const mongoose = require('mongoose');
const { formatDistanceToNow } = require('date-fns');
const Photo = require('../models/photo');
const User = require('../models/user');
const Notification = require('../models/notification');
const { error: errorLogger } = require('../utils/errorLogger');

// Constants
const LIKE_COOLDOWN_HOURS = 6;
const MAX_LIKES_PER_DAY = 50;
const PROFILE_LIKE_COOLDOWN = 24 * 60 * 60 * 1000;

// ==================== Helper Functions ====================

const handleError = (res, error, context = 'like operation') => {
  // Log error with proper logger
  errorLogger(`Error during ${context}`, error, { context });
  
  if (error instanceof mongoose.Error.CastError) {
    return res.status(400).json({
      success: false,
      code: 'INVALID_ID',
      message: 'Invalid ID format'
    });
  }

  if (error.code === 11000) {
    return res.status(409).json({
      success: false,
      code: 'DUPLICATE_ACTION',
      message: 'Duplicate action detected'
    });
  }

  return res.status(500).json({
    success: false,
    code: 'SERVER_ERROR',
    message: 'An error occurred',
    error: process.env.NODE_ENV === 'development' ? error.message : undefined
  });
};

const checkLikeLimit = async (userId) => {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  
  const likesToday = await Photo.countDocuments({
    likedBy: userId,
    likedAt: { $gte: today }
  });

  if (likesToday >= MAX_LIKES_PER_DAY) {
    throw new Error('Daily like limit reached');
  }
};

// ==================== Controller Methods ====================

/**
 * Like/Unlike a photo
 */
const likePhoto = async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const photoId = req.params.photoId;
    const { _id: userId, name: userName } = req.user;

    // Validate photo ID
    if (!mongoose.Types.ObjectId.isValid(photoId)) {
      await session.abortTransaction();
      return res.status(400).json({
        success: false,
        code: 'INVALID_PHOTO_ID',
        message: 'Invalid photo ID format'
      });
    }

    // Check daily like limit
    await checkLikeLimit(userId);

    // Get photo with owner details
    const photo = await Photo.findById(photoId)
      .populate('user', 'name gender profileImages isOnline lastActive')
      .session(session);

    if (!photo) {
      await session.abortTransaction();
      return res.status(404).json({
        success: false,
        code: 'PHOTO_NOT_FOUND',
        message: 'Photo not found'
      });
    }

    // Check existing like status
    const alreadyLiked = photo.likedBy.some(id => id.equals(userId));

    if (alreadyLiked) {
      await session.abortTransaction();
      return res.status(400).json({
        success: false,
        code: 'ALREADY_LIKED',
        message: 'You have already liked this photo'
      });
    }

    // Add the like
    photo.likedBy.push(userId);
    photo.likes = photo.likedBy.length;

    // Create notification if not self-like
    if (!photo.user._id.equals(userId)) {
      const recentNotification = await Notification.findOne({
        recipient: photo.user._id,  // Fixed: changed from 'user' to 'recipient'
        from: userId,
        type: 'photo_like',
        createdAt: { $gt: new Date(Date.now() - LIKE_COOLDOWN_HOURS * 60 * 60 * 1000) }
      }).session(session);

      if (!recentNotification) {
        await Notification.create([{
          recipient: photo.user._id,  // Fixed: changed from 'user' to 'recipient'
          type: 'photo_like',
          title: 'New Like',
          message: `${userName} liked your photo`,
          from: userId,
          data: {
            photoId: photo._id,
            photoUrl: photo.url,
            likerName: userName
          }
        }], { session });
      }
    }

    // Save changes
    await photo.save({ session });
    await session.commitTransaction();

    res.status(200).json({
      success: true,
      data: {
        photoId: photo._id,
        likes: photo.likes,
        isLiked: true
      }
    });

  } catch (error) {
    await session.abortTransaction();
    if (error.message === 'Daily like limit reached') {
      return res.status(429).json({
        success: false,
        code: 'LIKE_LIMIT_REACHED',
        message: 'Daily like limit reached'
      });
    }
    return handleError(res, error, 'likePhoto');
  } finally {
    session.endSession();
  }
};

/**
 * Like/Unlike a user profile
 */
const likeProfile = async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const targetUserId = req.params.userId;
    const currentUserId = req.user._id;
    const currentUserName = req.user.name;
    
    // Use target user from gender middleware
    const targetUser = req.targetUser;

    // Prevent self-liking
    if (targetUserId === currentUserId.toString()) {
      await session.abortTransaction();
      return res.status(400).json({
        success: false,
        code: 'SELF_LIKE',
        message: 'Cannot like your own profile'
      });
    }

    // Get both users
    const [currentUser] = await Promise.all([
      User.findById(currentUserId).session(session)
    ]);

    // Check if already liked
    const alreadyLiked = currentUser.likedUsers.includes(targetUserId);
    let isMatch = false;

    // Toggle like status
    if (alreadyLiked) {
      // Unlike
      currentUser.likedUsers.pull(targetUserId);
      targetUser.likesReceived.pull(currentUserId);
    } else {
      // Like
      currentUser.likedUsers.addToSet(targetUserId);
      targetUser.likesReceived.addToSet(currentUserId);

      // Check for mutual likes (match)
      isMatch = targetUser.likedUsers.includes(currentUserId);

      // Create notification
      await Notification.create([{
        recipient: targetUserId,  // Fixed: changed from 'user' to 'recipient'
        type: 'profile_like',
        title: 'New Profile Like',
        message: `${currentUserName} liked your profile`,
        from: currentUserId,
        data: {
          likerId: currentUserId,
          likerName: currentUserName
        }
      }], { session });

      // Create match notifications if mutual like
      if (isMatch) {
        await Notification.create([
          {
            recipient: targetUserId,  // Fixed: changed from 'user' to 'recipient'
            type: 'match',
            title: 'New Match!',
            message: `You matched with ${currentUserName}`,
            from: currentUserId,
            data: {
              matchId: currentUserId,
              matchName: currentUserName
            }
          },
          {
            recipient: currentUserId,  // Fixed: changed from 'user' to 'recipient'
            type: 'match',
            title: 'New Match!',
            message: `You matched with ${targetUser.name}`,
            from: targetUserId,
            data: {
              matchId: targetUserId,
              matchName: targetUser.name
            }
          }
        ], { session });
      }
    }

    // Save changes
    await currentUser.save({ session });
    await targetUser.save({ session });
    await session.commitTransaction();

    res.status(200).json({
      success: true,
      data: {
        userId: targetUserId,
        isLiked: !alreadyLiked,
        isMatch,
        matchDetails: isMatch ? {
          userId: targetUserId,
          name: targetUser.name,
          photo: targetUser.profileImages[0]?.url || null,
          status: targetUser.isOnline ? 'online' : 
                 `last seen ${formatDistanceToNow(targetUser.lastActive)} ago`
        } : null
      }
    });

  } catch (error) {
    await session.abortTransaction();
    if (error.message === 'Daily like limit reached') {
      return res.status(429).json({
        success: false,
        code: 'LIKE_LIMIT_REACHED',
        message: 'Daily like limit reached'
      });
    }
    return handleError(res, error, 'likeProfile');
  } finally {
    session.endSession();
  }
};

/**
 * Get paginated liked photos
 */
const getLikedPhotos = async (req, res) => {
  try {
    const { userId } = req.params;
    const currentUserId = req.user._id;
    const { page = 1, limit = 20 } = req.query;

    // Validate user ID
    if (!mongoose.Types.ObjectId.isValid(userId)) {
      return res.status(400).json({
        success: false,
        code: 'INVALID_USER_ID',
        message: 'Invalid user ID format'
      });
    }

    // Get user's liked photos with pagination
    const user = await User.findById(userId)
      .select('likedPhotos')
      .populate({
        path: 'likedPhotos',
        select: 'url likes createdAt user',
        options: {
          skip: (page - 1) * limit,
          limit: parseInt(limit),
          sort: { createdAt: -1 }
        },
        populate: {
          path: 'user',
          select: 'name profileImages isOnline lastActive'
        }
      });

    if (!user) {
      return res.status(404).json({
        success: false,
        code: 'USER_NOT_FOUND',
        message: 'User not found'
      });
    }

    // Format response
    const photos = user.likedPhotos.map(photo => ({
      id: photo._id,
      url: photo.url,
      likes: photo.likes,
      createdAt: photo.createdAt,
      owner: {
        id: photo.user._id,
        name: photo.user.name,
        photo: photo.user.profileImages[0]?.url || null,
        status: photo.user.isOnline ? 'online' : 
               `last seen ${formatDistanceToNow(photo.user.lastActive)} ago`
      },
      isLikedByCurrentUser: photo.likedBy.some(id => id.equals(currentUserId))
    }));

    const totalPhotos = await Photo.countDocuments({ _id: { $in: user.likedPhotos } });

    res.status(200).json({
      success: true,
      data: {
        photos,
        pagination: {
          currentPage: parseInt(page),
          totalPages: Math.ceil(totalPhotos / limit),
          totalItems: totalPhotos,
          limit: parseInt(limit)
        }
      }
    });

  } catch (error) {
    return handleError(res, error, 'getLikedPhotos');
  }
};

/**
 * Batch check like status for multiple photos
 */
const checkLikeStatus = async (req, res) => {
  try {
    const { photoIds } = req.body;
    const userId = req.user._id;

    // Validate input
    if (!photoIds || !Array.isArray(photoIds)) {
      return res.status(400).json({
        success: false,
        code: 'INVALID_INPUT',
        message: 'photoIds array is required'
      });
    }

    // Validate each photo ID
    const validPhotoIds = photoIds.filter(id => mongoose.Types.ObjectId.isValid(id));
    if (validPhotoIds.length !== photoIds.length) {
      return res.status(400).json({
        success: false,
        code: 'INVALID_PHOTO_IDS',
        message: 'Some photo IDs are invalid',
        invalidIds: photoIds.filter(id => !mongoose.Types.ObjectId.isValid(id))
      });
    }

    // Get like status for all photos
    const photos = await Photo.find(
      { _id: { $in: validPhotoIds } },
      'url likes likedBy user'
    );

    // Format response
    const statusMap = {};
    photos.forEach(photo => {
      statusMap[photo._id] = {
        isLiked: photo.likedBy.some(id => id.equals(userId)),
        likeCount: photo.likes,
        canLike: !photo.likedBy.some(id => id.equals(userId)) // Only if not already liked
      };
    });

    // Include missing photos
    validPhotoIds.forEach(id => {
      if (!statusMap[id]) {
        statusMap[id] = {
          isLiked: false,
          likeCount: 0,
          canLike: false,
          error: 'Photo not found'
        };
      }
    });

    res.status(200).json({
      success: true,
      data: statusMap
    });

  } catch (error) {
    return handleError(res, error, 'checkLikeStatus');
  }
};

/**
 * Get detailed like information for a photo
 */
const getLikeDetails = async (req, res) => {
  try {
    const photoId = req.params.id;
    const { page = 1, limit = 20 } = req.query;

    // Validate photo ID
    if (!mongoose.Types.ObjectId.isValid(photoId)) {
      return res.status(400).json({
        success: false,
        code: 'INVALID_PHOTO_ID',
        message: 'Invalid photo ID format'
      });
    }

    // Get photo with paginated likers
    const photo = await Photo.findById(photoId)
      .populate({
        path: 'likedBy',
        select: 'name profileImages isOnline lastActive',
        options: {
          skip: (page - 1) * limit,
          limit: parseInt(limit),
          sort: { createdAt: -1 }
        }
      })
      .select('url likes');

    if (!photo) {
      return res.status(404).json({
        success: false,
        code: 'PHOTO_NOT_FOUND',
        message: 'Photo not found'
      });
    }

    // Format response
    const likers = photo.likedBy.map(user => ({
      id: user._id,
      name: user.name,
      photo: user.profileImages[0]?.url || null,
      status: user.isOnline ? 'online' : 
             `last seen ${formatDistanceToNow(user.lastActive)} ago`
    }));

    res.status(200).json({
      success: true,
      data: {
        photoUrl: photo.url,
        totalLikes: photo.likes,
        likers,
        pagination: {
          currentPage: parseInt(page),
          totalPages: Math.ceil(photo.likes / limit),
          totalItems: photo.likes,
          limit: parseInt(limit)
        }
      }
    });

  } catch (error) {
    return handleError(res, error, 'getLikeDetails');
  }
};

// ==================== Export Controller ====================
module.exports = {
  likePhoto,
  likeProfile,
  getLikedPhotos,
  checkLikeStatus,
  getLikeDetails
};