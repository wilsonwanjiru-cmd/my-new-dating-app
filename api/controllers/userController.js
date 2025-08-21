const User = require('../models/user');
const Photo = require('../models/photo');
const Chat = require('../models/Chat');
const Notification = require('../models/notification');
const mongoose = require('mongoose');
const { formatDistanceToNow } = require('date-fns');

// ======================
// ENHANCED CONFIGURATION
// ======================
const isDev = process.env.NODE_ENV === 'development';
const ONLINE_STATUS_THRESHOLD = 5 * 60 * 1000; // 5 minutes

// ======================
// ENHANCED ERROR HANDLER
// ======================
const handleError = (res, error, customMessage = 'Internal server error', code = 'SERVER_ERROR') => {
  console.error(`[UserController] ${customMessage}:`, error);

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

  return res.status(500).json({ 
    success: false,
    code,
    message: customMessage,
    error: isDev ? error.message : undefined
  });
};

// ======================
// CORE USER CONTROLLERS
// ======================

/**
 * Get enhanced user profile with online status
 */
const getProfile = async (req, res) => {
  try {
    // Verify that the requested user is the authenticated user
    if (req.params.userId !== req.user._id.toString()) {
      return res.status(403).json({
        success: false,
        code: 'UNAUTHORIZED_ACCESS',
        message: 'You can only access your own profile'
      });
    }

    const user = await User.findById(req.params.userId)
      .select('-password -refreshToken -failedLoginAttempts -activeSessions')
      .lean();

    if (!user) {
      return res.status(404).json({
        success: false,
        code: 'USER_NOT_FOUND',
        message: 'User not found'
      });
    }

    // Enhanced status information
    const enhancedProfile = {
      ...user,
      status: {
        isOnline: user.isOnline,
        lastActive: user.lastActive,
        lastSeen: user.isOnline ? 'online' : `last seen ${formatDistanceToNow(user.lastActive)} ago`
      }
    };

    return res.status(200).json({
      success: true,
      data: enhancedProfile
    });
  } catch (error) {
    return handleError(res, error, 'Error fetching profile');
  }
};

/**
 * Update profile with validation
 */
const updateProfile = async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();
  
  try {
    // Verify ownership
    if (req.params.userId !== req.user._id.toString()) {
      await session.abortTransaction();
      return res.status(403).json({
        success: false,
        code: 'UNAUTHORIZED_ACCESS',
        message: 'You can only update your own profile'
      });
    }

    const { name, bio, age, gender, preferences } = req.body;
    const updates = {};

    // Validate and build update object
    if (name) updates.name = name;
    if (bio) updates.bio = bio;
    if (age) {
      if (age < 18 || age > 100) {
        await session.abortTransaction();
        return res.status(400).json({
          success: false,
          code: 'INVALID_AGE',
          message: 'Age must be between 18 and 100'
        });
      }
      updates.age = age;
    }
    if (gender) updates.gender = gender;
    if (preferences) updates.preferences = preferences;

    const user = await User.findByIdAndUpdate(
      req.params.userId,
      updates,
      { new: true, runValidators: true, session }
    ).select('-password');

    await session.commitTransaction();

    // Broadcast profile update to connections
    if (global.io) {
      global.io.to(`user-${user._id}`).emit('profile-updated', {
        userId: user._id,
        updates
      });
    }

    return res.status(200).json({
      success: true,
      message: 'Profile updated successfully',
      data: user
    });
  } catch (error) {
    await session.abortTransaction();
    return handleError(res, error, 'Error updating profile');
  } finally {
    session.endSession();
  }
};

// ======================
// SUBSCRIPTION HANDLERS
// ======================

/**
 * Handle user subscription
 */
const subscribe = async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    // Verify ownership
    if (req.params.userId !== req.user._id.toString()) {
      await session.abortTransaction();
      return res.status(403).json({
        success: false,
        code: 'UNAUTHORIZED_ACCESS',
        message: 'You can only subscribe for your own account'
      });
    }

    const { plan, paymentMethod } = req.body;
    
    // Validate subscription plan
    const validPlans = ['monthly', 'yearly', 'premium'];
    if (!validPlans.includes(plan)) {
      await session.abortTransaction();
      return res.status(400).json({
        success: false,
        code: 'INVALID_PLAN',
        message: 'Invalid subscription plan'
      });
    }

    // Calculate expiry date
    const expiryDate = new Date();
    if (plan === 'monthly') expiryDate.setMonth(expiryDate.getMonth() + 1);
    else if (plan === 'yearly') expiryDate.setFullYear(expiryDate.getFullYear() + 1);
    else if (plan === 'premium') expiryDate.setFullYear(expiryDate.getFullYear() + 5);

    // Update user subscription
    const updatedUser = await User.findByIdAndUpdate(
      req.params.userId,
      {
        subscription: {
          isActive: true,
          plan,
          startDate: new Date(),
          expiryDate,
          paymentMethod
        }
      },
      { new: true, session }
    );

    await session.commitTransaction();

    // Send subscription confirmation
    if (global.io) {
      global.io.to(`user-${req.params.userId}`).emit('subscription-updated', {
        status: 'active',
        plan
      });
    }

    return res.status(200).json({
      success: true,
      message: 'Subscription successful',
      data: {
        subscription: updatedUser.subscription
      }
    });
  } catch (error) {
    await session.abortTransaction();
    return handleError(res, error, 'Error processing subscription');
  } finally {
    session.endSession();
  }
};

/**
 * Get user subscription status
 */
const getSubscriptionStatus = async (req, res) => {
  try {
    // Verify ownership
    if (req.params.userId !== req.user._id.toString()) {
      return res.status(403).json({
        success: false,
        code: 'UNAUTHORIZED_ACCESS',
        message: 'You can only check your own subscription status'
      });
    }

    const user = await User.findById(req.params.userId)
      .select('subscription');

    if (!user) {
      return res.status(404).json({
        success: false,
        code: 'USER_NOT_FOUND',
        message: 'User not found'
      });
    }

    return res.status(200).json({
      success: true,
      data: {
        subscription: user.subscription || { isActive: false }
      }
    });
  } catch (error) {
    return handleError(res, error, 'Error fetching subscription status');
  }
};

// ======================
// USER INTERACTIONS
// ======================

/**
 * Like another user
 */
const likeUser = async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const { targetUserId } = req.body;
    const currentUserId = req.user._id;

    // Prevent self-liking
    if (currentUserId.toString() === targetUserId) {
      await session.abortTransaction();
      return res.status(400).json({
        success: false,
        code: 'SELF_LIKE',
        message: 'You cannot like yourself'
      });
    }

    // Check if already liked
    const alreadyLiked = await User.exists({
      _id: currentUserId,
      likedUsers: targetUserId
    });

    // Toggle like status
    const updateCurrentUser = alreadyLiked
      ? { $pull: { likedUsers: targetUserId } }
      : { $addToSet: { likedUsers: targetUserId } };

    const updateTargetUser = alreadyLiked
      ? { $pull: { likedBy: currentUserId } }
      : { $addToSet: { likedBy: currentUserId } };

    await Promise.all([
      User.findByIdAndUpdate(currentUserId, updateCurrentUser, { session }),
      User.findByIdAndUpdate(targetUserId, updateTargetUser, { session })
    ]);

    // Create notification if liking (not unliking)
    if (!alreadyLiked) {
      const currentUser = await User.findById(currentUserId).session(session);
      
      await Notification.create([{
        user: targetUserId,
        from: currentUserId,
        type: 'user_like',
        message: `${currentUser.name} liked your profile`,
        data: {
          likerName: currentUser.name,
          likerId: currentUserId
        }
      }], { session });

      // Real-time update
      if (global.io) {
        global.io.to(`user-${targetUserId}`).emit('user-liked', {
          userId: currentUserId,
          userName: currentUser.name
        });
      }
    }

    await session.commitTransaction();

    return res.status(200).json({
      success: true,
      message: alreadyLiked ? 'User unliked' : 'User liked',
      data: {
        isLiked: !alreadyLiked
      }
    });
  } catch (error) {
    await session.abortTransaction();
    return handleError(res, error, 'Error processing like');
  } finally {
    session.endSession();
  }
};

/**
 * Update user preferences
 */
const updatePreferences = async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    // Verify ownership
    if (req.params.userId !== req.user._id.toString()) {
      await session.abortTransaction();
      return res.status(403).json({
        success: false,
        code: 'UNAUTHORIZED_ACCESS',
        message: 'You can only update your own preferences'
      });
    }

    const { genderPreference, ageRange, distance } = req.body;
    const updates = {};

    // Validate and build updates
    if (genderPreference) updates['preferences.gender'] = genderPreference;
    if (ageRange) {
      if (ageRange.min < 18 || ageRange.max > 100) {
        await session.abortTransaction();
        return res.status(400).json({
          success: false,
          code: 'INVALID_AGE_RANGE',
          message: 'Age range must be between 18 and 100'
        });
      }
      updates['preferences.ageRange'] = ageRange;
    }
    if (distance) updates['preferences.distance'] = distance;

    const updatedUser = await User.findByIdAndUpdate(
      req.params.userId,
      { $set: updates },
      { new: true, session }
    );

    await session.commitTransaction();

    return res.status(200).json({
      success: true,
      message: 'Preferences updated successfully',
      data: {
        preferences: updatedUser.preferences
      }
    });
  } catch (error) {
    await session.abortTransaction();
    return handleError(res, error, 'Error updating preferences');
  } finally {
    session.endSession();
  }
};

// ======================
// ACCOUNT MANAGEMENT
// ======================

/**
 * Delete user account
 */
const deleteAccount = async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    // Verify ownership
    if (req.params.userId !== req.user._id.toString()) {
      await session.abortTransaction();
      return res.status(403).json({
        success: false,
        code: 'UNAUTHORIZED_ACCESS',
        message: 'You can only delete your own account'
      });
    }

    // Soft delete by marking as inactive
    const deletedUser = await User.findByIdAndUpdate(
      req.params.userId,
      { isActive: false, deletedAt: new Date() },
      { new: true, session }
    );

    // Remove from other users' liked lists
    await User.updateMany(
      { likedUsers: req.params.userId },
      { $pull: { likedUsers: req.params.userId } },
      { session }
    );

    await session.commitTransaction();

    // Notify connected clients
    if (global.io) {
      global.io.to(`user-${req.params.userId}`).emit('account-deleted');
    }

    return res.status(200).json({
      success: true,
      message: 'Account deleted successfully'
    });
  } catch (error) {
    await session.abortTransaction();
    return handleError(res, error, 'Error deleting account');
  } finally {
    session.endSession();
  }
};

// ======================
// PHOTO MANAGEMENT
// ======================

/**
 * Upload profile photo
 */
const uploadPhoto = async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    // Verify ownership
    if (req.params.userId !== req.user._id.toString()) {
      await session.abortTransaction();
      return res.status(403).json({
        success: false,
        code: 'UNAUTHORIZED_ACCESS',
        message: 'You can only upload photos to your own profile'
      });
    }

    const { url, publicId } = req.body;
    
    if (!url || !publicId) {
      await session.abortTransaction();
      return res.status(400).json({
        success: false,
        code: 'MISSING_FIELDS',
        message: 'Photo URL and public ID are required'
      });
    }

    const newPhoto = {
      url,
      publicId,
      uploadedAt: new Date(),
      likes: 0,
      likedBy: []
    };

    const updatedUser = await User.findByIdAndUpdate(
      req.params.userId,
      { $push: { profileImages: newPhoto } },
      { new: true, session }
    );

    await session.commitTransaction();

    return res.status(201).json({
      success: true,
      message: 'Photo uploaded successfully',
      data: {
        photos: updatedUser.profileImages,
        count: updatedUser.profileImages.length
      }
    });
  } catch (error) {
    await session.abortTransaction();
    return handleError(res, error, 'Error uploading photo');
  } finally {
    session.endSession();
  }
};

/**
 * Delete profile photo
 */
const deletePhoto = async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    // Verify ownership
    if (req.params.userId !== req.user._id.toString()) {
      await session.abortTransaction();
      return res.status(403).json({
        success: false,
        code: 'UNAUTHORIZED_ACCESS',
        message: 'You can only delete your own photos'
      });
    }

    const { photoId } = req.params;
    
    const updatedUser = await User.findByIdAndUpdate(
      req.params.userId,
      { $pull: { profileImages: { _id: photoId } } },
      { new: true, session }
    );

    await session.commitTransaction();

    return res.status(200).json({
      success: true,
      message: 'Photo deleted successfully',
      data: {
        photos: updatedUser.profileImages,
        count: updatedUser.profileImages.length
      }
    });
  } catch (error) {
    await session.abortTransaction();
    return handleError(res, error, 'Error deleting photo');
  } finally {
    session.endSession();
  }
};

// ======================
// PHOTO FEED & INTERACTIONS
// ======================

/**
 * Get enhanced photo feed with online status
 */
const getAllUserPhotos = async (req, res) => {
  try {
    const { page = 1, limit = 20 } = req.query;
    const skip = (page - 1) * limit;

    // Get all users with their photos
    const users = await User.find({ _id: { $ne: req.user._id } })
      .select('name age gender profileImages subscription isOnline lastActive')
      .skip(skip)
      .limit(parseInt(limit));

    // Transform into feed format
    const feed = users.flatMap(user => 
      user.profileImages.map(photo => ({
        photoId: photo._id,
        url: photo.url,
        likes: photo.likes || 0,
        isLiked: photo.likedBy?.includes(req.user._id) || false,
        owner: {
          id: user._id,
          name: user.name,
          age: user.age,
          gender: user.gender,
          isSubscribed: user.subscription?.isActive || false,
          status: user.isOnline ? 'online' : `last seen ${formatDistanceToNow(user.lastActive)} ago`
        },
        canChat: req.user.subscription?.isActive || false,
        uploadedAt: photo.uploadedAt
      }))
    ).sort((a, b) => b.uploadedAt - a.uploadedAt);

    const total = await User.countDocuments({ _id: { $ne: req.user._id } });

    return res.status(200).json({
      success: true,
      data: {
        feed,
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

/**
 * Like/unlike a photo with real-time updates
 */
const likePhoto = async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const { photoId, ownerId } = req.body;
    
    // Prevent self-liking
    if (ownerId === req.user._id.toString()) {
      await session.abortTransaction();
      return res.status(400).json({
        success: false,
        code: 'SELF_LIKE',
        message: 'You cannot like your own photo'
      });
    }

    // Validate photo exists
    const photoOwner = await User.findOne({
      _id: ownerId,
      'profileImages._id': photoId
    }).session(session);

    if (!photoOwner) {
      await session.abortTransaction();
      return res.status(404).json({
        success: false,
        code: 'PHOTO_NOT_FOUND',
        message: 'Photo or owner not found'
      });
    }

    // Check current like status
    const photo = photoOwner.profileImages.id(photoId);
    const alreadyLiked = photo.likedBy.includes(req.user._id);

    // Toggle like status
    const update = alreadyLiked
      ? {
          $inc: { 'profileImages.$.likes': -1 },
          $pull: { 'profileImages.$.likedBy': req.user._id }
        }
      : {
          $inc: { 'profileImages.$.likes': 1 },
          $addToSet: { 'profileImages.$.likedBy': req.user._id }
        };

    await User.updateOne(
      { _id: ownerId, 'profileImages._id': photoId },
      update,
      { session }
    );

    // Update liker's profile
    const userUpdate = alreadyLiked
      ? { $pull: { likedPhotos: { photoId, ownerId } } }
      : { $addToSet: { likedPhotos: { photoId, ownerId } } };

    await User.findByIdAndUpdate(
      req.user._id,
      userUpdate,
      { session }
    );

    // Create notification if liking (not unliking)
    if (!alreadyLiked) {
      await Notification.create([{
        user: ownerId,
        from: req.user._id,
        type: 'photo_like',
        message: `${req.user.name} liked your photo`,
        photo: photoId,
        data: {
          photoUrl: photo.url,
          likerName: req.user.name,
          likerId: req.user._id
        }
      }], { session });

      // Real-time update
      if (global.io) {
        global.io.to(`user-${ownerId}`).emit('photo-liked', {
          photoId,
          likerId: req.user._id,
          likerName: req.user.name,
          newLikeCount: photo.likes + 1
        });
      }
    }

    await session.commitTransaction();

    return res.status(200).json({
      success: true,
      message: alreadyLiked ? 'Photo unliked' : 'Photo liked',
      data: {
        photoId,
        isLiked: !alreadyLiked,
        newLikeCount: alreadyLiked ? photo.likes - 1 : photo.likes + 1
      }
    });
  } catch (error) {
    await session.abortTransaction();
    return handleError(res, error, 'Error processing like');
  } finally {
    session.endSession();
  }
};

// ======================
// CHAT INITIATION
// ======================

/**
 * Start chat from photo with enhanced validation
 */
const startChatFromPhoto = async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const { photoId, targetUserId } = req.body;
    const currentUserId = req.user._id;

    // Prevent self-chatting
    if (targetUserId === currentUserId.toString()) {
      await session.abortTransaction();
      return res.status(400).json({
        success: false,
        code: 'SELF_CHAT',
        message: 'You cannot start a chat with yourself'
      });
    }

    // Validate users and photo
    const [currentUser, targetUser] = await Promise.all([
      User.findById(currentUserId).session(session),
      User.findOne({
        _id: targetUserId,
        'profileImages._id': photoId
      }).session(session)
    ]);

    if (!targetUser) {
      await session.abortTransaction();
      return res.status(404).json({
        success: false,
        code: 'PHOTO_NOT_FOUND',
        message: 'Photo or owner not found'
      });
    }

    // Check for existing chat
    let chat = await Chat.findOne({
      participants: { $all: [currentUserId, targetUserId] },
      photoContext: photoId
    }).session(session);

    if (!chat) {
      // Create new chat with photo context
      chat = await Chat.create([{
        participants: [currentUserId, targetUserId],
        photoContext: photoId,
        messages: [{
          sender: currentUserId,
          content: `I saw your photo and wanted to chat!`,
          isRead: false,
          sentAt: new Date()
        }],
        createdAt: new Date()
      }], { session });

      // Create notification
      await Notification.create([{
        user: targetUserId,
        from: currentUserId,
        type: 'chat_initiated',
        message: `${currentUser.name} started a chat about your photo`,
        chat: chat[0]._id,
        photo: photoId,
        data: {
          photoUrl: targetUser.profileImages.id(photoId).url,
          senderName: currentUser.name,
          senderPhoto: currentUser.profileImages[0]?.url || null
        }
      }], { session });

      // Real-time notification
      if (global.io) {
        global.io.to(`user-${targetUserId}`).emit('new-chat', {
          chatId: chat[0]._id,
          fromUserId: currentUserId,
          fromUserName: currentUser.name,
          photoId,
          previewMessage: 'I saw your photo and wanted to chat!'
        });
      }
    }

    await session.commitTransaction();

    return res.status(200).json({
      success: true,
      data: {
        chatId: chat._id,
        requiresSubscription: !currentUser.subscription?.isActive,
        canChat: targetUser.subscription?.isActive
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
// NOTIFICATIONS
// ======================

/**
 * Get paginated notifications with enhanced data
 */
const getNotifications = async (req, res) => {
  try {
    // Verify ownership
    if (req.params.userId !== req.user._id.toString()) {
      return res.status(403).json({
        success: false,
        code: 'UNAUTHORIZED_ACCESS',
        message: 'You can only access your own notifications'
      });
    }

    const { page = 1, limit = 20, unreadOnly } = req.query;
    const skip = (page - 1) * limit;

    const filter = { user: req.user._id };
    if (unreadOnly === 'true') filter.read = false;

    const [notifications, total] = await Promise.all([
      Notification.find(filter)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(parseInt(limit))
        .populate('from', 'name profileImages isOnline lastActive')
        .lean(),
      Notification.countDocuments(filter)
    ]);

    // Enhance with status information
    const enhancedNotifications = notifications.map(notif => ({
      ...notif,
      from: notif.from ? {
        ...notif.from,
        status: notif.from.isOnline ? 'online' : `last seen ${formatDistanceToNow(notif.from.lastActive)} ago`
      } : null
    }));

    return res.status(200).json({
      success: true,
      data: {
        notifications: enhancedNotifications,
        pagination: {
          currentPage: parseInt(page),
          totalPages: Math.ceil(total / limit),
          totalItems: total,
          itemsPerPage: parseInt(limit)
        }
      }
    });
  } catch (error) {
    return handleError(res, error, 'Error fetching notifications');
  }
};

/**
 * Mark notifications as read with real-time update
 */
const markNotificationsAsRead = async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    // Verify ownership
    if (req.params.userId !== req.user._id.toString()) {
      await session.abortTransaction();
      return res.status(403).json({
        success: false,
        code: 'UNAUTHORIZED_ACCESS',
        message: 'You can only update your own notifications'
      });
    }

    const result = await Notification.updateMany(
      { user: req.user._id, read: false },
      { $set: { read: true, readAt: new Date() } },
      { session }
    );

    await session.commitTransaction();

    // Real-time update
    if (global.io && result.modifiedCount > 0) {
      global.io.to(`user-${req.user._id}`).emit('notifications-read', {
        count: result.modifiedCount
      });
    }

    return res.status(200).json({
      success: true,
      message: `${result.modifiedCount} notifications marked as read`
    });
  } catch (error) {
    await session.abortTransaction();
    return handleError(res, error, 'Error marking notifications as read');
  } finally {
    session.endSession();
  }
};

// ======================
// EXPORTS
// ======================

module.exports = {
  // Profile Management
  getUserProfile: getProfile,
  updateProfile: updateProfile,
  uploadProfileImage: uploadPhoto,
  deleteProfileImage: deletePhoto,

  // Subscription
  subscribe,
  getSubscriptionStatus,

  // Interactions
  likeUser,
  updatePreferences,
  deleteAccount,

  // Photo Feed
  getAllUserPhotos: getAllUserPhotos,
  likePhoto,
  startChatFromPhoto,

  // Notifications
  getNotifications,
  markNotificationsAsRead
};