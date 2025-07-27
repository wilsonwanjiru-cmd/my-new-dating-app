const User = require("../models/user");
const mongoose = require("mongoose");
const { formatDistanceToNow } = require('date-fns');
const MAX_FREE_UPLOADS = 7;

// ==================== UTILITY FUNCTIONS ====================
const isValidId = (id) => mongoose.Types.ObjectId.isValid(String(id || ''));

const safeAccess = (obj, path, fallback = null) => {
  return path.split('.').reduce((acc, key) => 
    (acc && typeof acc === 'object' && key in acc) ? acc[key] : fallback, 
    obj
  );
};

const handleError = (error, res) => {
  console.error("[CONTROLLER ERROR]", error);

  if (error instanceof mongoose.Error.ValidationError) {
    return res.status(400).json({
      success: false,
      message: error.message,
      systemCode: "VALIDATION_ERROR"
    });
  }

  if (error instanceof mongoose.Error.CastError) {
    return res.status(400).json({
      success: false,
      message: "Invalid data format",
      systemCode: "CAST_ERROR"
    });
  }

  if (error.name === "TypeError") {
    return res.status(500).json({
      success: false,
      message: "Data processing error",
      systemCode: "TYPE_ERROR"
    });
  }

  return res.status(500).json({
    success: false,
    message: "Internal server error",
    systemCode: "SERVER_ERROR",
    debugInfo: process.env.NODE_ENV === "development" 
      ? { message: error.message, stack: error.stack } 
      : undefined
  });
};

// ==================== CONTROLLER METHODS ====================

// 1. Get Current User Profile (NEW)
const getMyProfile = async (req, res) => {
  try {
    if (!req.user || !isValidId(req.user._id)) {
      return res.status(401).json({
        success: false,
        message: "Authentication required",
        systemCode: "AUTH_REQUIRED"
      });
    }

    const user = await User.findById(new mongoose.Types.ObjectId(req.user._id))
      .select('-password -__v -verificationToken -resetToken')
      .populate("crushes", "name profileImages")
      .populate("matches", "name profileImages")
      .lean();

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found",
        systemCode: "USER_NOT_FOUND"
      });
    }

    // Safe subscription handling
    const subscription = user.subscription || {};
    const isSubscribed = Boolean(subscription.isActive) && 
      new Date(subscription.expiresAt) > new Date();

    // Construct safe response
    const responseData = {
      ...user,
      _id: String(user._id),
      name: String(user.name || ''),
      email: String(user.email || ''),
      profileImages: (user.profileImages || []).map(img => String(img)),
      subscriptionStatus: {
        isActive: isSubscribed,
        expiresAt: subscription.expiresAt instanceof Date 
          ? subscription.expiresAt.toISOString() 
          : null,
        timeRemaining: isSubscribed 
          ? formatDistanceToNow(new Date(subscription.expiresAt))
          : null
      },
      crushes: user.crushes || [],
      matches: user.matches || [],
      lastActive: user.lastActive instanceof Date
        ? user.lastActive.toISOString()
        : null,
      createdAt: user.createdAt instanceof Date
        ? user.createdAt.toISOString()
        : null
    };

    await User.updateOne(
      { _id: new mongoose.Types.ObjectId(req.user._id) },
      { $set: { lastActive: new Date() } }
    );

    return res.status(200).json({
      success: true,
      data: responseData
    });
  } catch (error) {
    handleError(error, res);
  }
};

// 2. Process Daily Subscription (KES 10 for 24 hours)
const processSubscription = async (req, res) => {
  try {
    const userId = String(req.params.userId || '');
    const { amount, paymentMethod } = req.body;

    if (!isValidId(userId)) {
      return res.status(400).json({ 
        success: false, 
        message: "Invalid user ID",
        systemCode: "INVALID_USER_ID" 
      });
    }

    if (Number(amount) !== 10) {
      return res.status(400).json({
        success: false,
        message: "Daily subscription requires exactly KES 10 payment",
        systemCode: "INVALID_SUBSCRIPTION_AMOUNT"
      });
    }

    const expiresAt = new Date();
    expiresAt.setHours(expiresAt.getHours() + 24);

    const updatedUser = await User.findByIdAndUpdate(
      new mongoose.Types.ObjectId(userId),
      {
        $set: {
          subscription: {
            type: 'daily',
            isActive: true,
            expiresAt,
            paymentMethod: String(paymentMethod || 'M-Pesa'),
            amount: 10
          },
          freeUploadsUsed: 0
        }
      },
      { new: true, runValidators: true }
    ).select('subscription freeUploadsUsed');

    if (!updatedUser) {
      return res.status(404).json({ 
        success: false, 
        message: "User not found",
        systemCode: "USER_NOT_FOUND" 
      });
    }

    res.status(200).json({
      success: true,
      message: "KES 10 daily subscription activated (expires in 24 hours)",
      subscription: updatedUser.subscription,
      expiresAt: updatedUser.subscription.expiresAt.toISOString(),
      timeRemaining: formatDistanceToNow(updatedUser.subscription.expiresAt)
    });
  } catch (error) {
    handleError(error, res);
  }
};

// 3. Update Gender
const updateGender = async (req, res) => {
  try {
    const userId = String(req.params.userId || '');
    const { gender } = req.body;

    if (!isValidId(userId)) {
      return res.status(400).json({
        success: false,
        message: "Invalid user ID",
        systemCode: "INVALID_USER_ID"
      });
    }

    if (!['male', 'female', 'other'].includes(String(gender || '').toLowerCase())) {
      return res.status(400).json({
        success: false,
        message: "Invalid gender value",
        systemCode: "INVALID_GENDER"
      });
    }

    const updatedUser = await User.findByIdAndUpdate(
      new mongoose.Types.ObjectId(userId),
      { gender: String(gender).toLowerCase() },
      { new: true, runValidators: true }
    ).select('-password -__v');

    if (!updatedUser) {
      return res.status(404).json({
        success: false,
        message: "User not found",
        systemCode: "USER_NOT_FOUND"
      });
    }

    res.status(200).json({
      success: true,
      message: "Gender updated successfully",
      data: updatedUser
    });
  } catch (error) {
    handleError(error, res);
  }
};

// 4. Update user description
const updateDescription = async (req, res) => {
  try {
    const userId = String(req.params.userId || '');
    const { description } = req.body;

    if (!description || typeof description !== 'string') {
      return res.status(400).json({
        success: false,
        message: "Invalid description provided",
        systemCode: "INVALID_DESCRIPTION"
      });
    }

    if (description.length > 500) {
      return res.status(400).json({
        success: false,
        message: "Description cannot exceed 500 characters",
        systemCode: "DESCRIPTION_TOO_LONG"
      });
    }

    const updatedUser = await User.findByIdAndUpdate(
      new mongoose.Types.ObjectId(userId),
      { $set: { description } },
      { new: true, runValidators: true }
    ).select('-password');

    if (!updatedUser) {
      return res.status(404).json({
        success: false,
        message: "User not found",
        systemCode: "USER_NOT_FOUND"
      });
    }

    res.status(200).json({
      success: true,
      message: "Description updated successfully",
      user: updatedUser
    });
  } catch (error) {
    handleError(error, res);
  }
};

// 5. Get user description
const getDescription = async (req, res) => {
  try {
    const userId = String(req.params.userId || '');
    
    if (!isValidId(userId)) {
      return res.status(400).json({
        success: false,
        message: "Invalid user ID",
        systemCode: "INVALID_USER_ID"
      });
    }

    const user = await User.findById(new mongoose.Types.ObjectId(userId))
      .select('description')
      .lean();

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found",
        systemCode: "USER_NOT_FOUND"
      });
    }

    res.json({
      success: true,
      description: String(user.description || '')
    });
  } catch (error) {
    handleError(error, res);
  }
};

// 6. Add profile images with subscription check
const addProfileImages = async (req, res) => {
  try {
    const userId = String(req.params.userId || '');
    const imageUrls = Array.isArray(req.uploadedImageUrls) 
      ? req.uploadedImageUrls 
      : Array.isArray(req.body.profileImages) 
        ? req.body.profileImages 
        : [];

    if (!isValidId(userId)) {
      return res.status(400).json({
        success: false,
        message: "Invalid user ID",
        systemCode: "INVALID_USER_ID"
      });
    }

    if (imageUrls.length === 0) {
      return res.status(400).json({
        success: false,
        message: "No valid images provided",
        systemCode: "NO_IMAGES"
      });
    }

    const user = await User.findById(new mongoose.Types.ObjectId(userId))
      .select('subscription freeUploadsUsed profileImages')
      .lean();

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found",
        systemCode: "USER_NOT_FOUND"
      });
    }

    const subscription = user.subscription || {};
    const hasActiveSubscription = Boolean(subscription.isActive) && 
      new Date(subscription.expiresAt) > new Date();
    const freeUploadsUsed = Number(user.freeUploadsUsed) || 0;
    const remainingFreeSlots = MAX_FREE_UPLOADS - freeUploadsUsed;

    if (!hasActiveSubscription && (freeUploadsUsed + imageUrls.length > MAX_FREE_UPLOADS)) {
      return res.status(403).json({
        success: false,
        message: `Free users can upload max ${MAX_FREE_UPLOADS} photos (${remainingFreeSlots} remaining). Subscribe for KES 10 to unlock unlimited uploads for 24 hours.`,
        remainingSlots: remainingFreeSlots,
        systemCode: "UPLOAD_LIMIT_EXCEEDED",
        upgradeRequired: true
      });
    }

    const update = {
      $addToSet: { profileImages: { $each: imageUrls.map(img => String(img)) } },
      $set: { lastActive: new Date() }
    };

    if (!hasActiveSubscription) {
      update.$inc = { freeUploadsUsed: imageUrls.length };
    }

    const updatedUser = await User.findByIdAndUpdate(
      new mongoose.Types.ObjectId(userId),
      update,
      { new: true }
    ).select("profileImages freeUploadsUsed subscription");

    res.status(200).json({
      success: true,
      profileImages: updatedUser.profileImages.map(img => String(img)),
      uploadsRemaining: hasActiveSubscription
        ? 'Unlimited'
        : MAX_FREE_UPLOADS - updatedUser.freeUploadsUsed,
      subscriptionStatus: {
        isActive: hasActiveSubscription,
        expiresAt: updatedUser.subscription?.expiresAt instanceof Date
          ? updatedUser.subscription.expiresAt.toISOString()
          : null
      }
    });
  } catch (error) {
    handleError(error, res);
  }
};

// 7. Get user profile (Fully Hardened)
const getProfile = async (req, res) => {
  try {
    const userId = String(req.params.userId || '');
    
    if (!isValidId(userId)) {
      return res.status(400).json({
        success: false,
        message: "Invalid user ID format",
        systemCode: "INVALID_USER_ID"
      });
    }

    const user = await User.findById(new mongoose.Types.ObjectId(userId))
      .select('-password -__v -verificationToken -resetToken')
      .populate("crushes", "name profileImages")
      .populate("matches", "name profileImages")
      .lean();

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found",
        systemCode: "USER_NOT_FOUND"
      });
    }

    // Safe subscription handling
    const subscription = user.subscription || {};
    const isSubscribed = Boolean(subscription.isActive) && 
      new Date(subscription.expiresAt) > new Date();

    // Safe profile images
    const visiblePhotos = isSubscribed 
      ? user.profileImages || []
      : (user.profileImages || []).slice(0, MAX_FREE_UPLOADS);

    // Construct safe response
    const responseData = {
      ...user,
      _id: String(user._id),
      name: String(user.name || ''),
      email: String(user.email || ''),
      profileImages: visiblePhotos.map(img => String(img)),
      subscriptionStatus: {
        isActive: isSubscribed,
        expiresAt: subscription.expiresAt instanceof Date 
          ? subscription.expiresAt.toISOString() 
          : null,
        timeRemaining: isSubscribed 
          ? formatDistanceToNow(new Date(subscription.expiresAt))
          : null,
        isRequired: !isSubscribed && (user.profileImages?.length || 0) > MAX_FREE_UPLOADS,
        canViewAll: isSubscribed,
        remainingPhotos: isSubscribed 
          ? 0 
          : Math.max(0, (user.profileImages?.length || 0) - MAX_FREE_UPLOADS)
      },
      crushes: user.crushes || [],
      matches: user.matches || [],
      lastActive: user.lastActive instanceof Date
        ? user.lastActive.toISOString()
        : null,
      createdAt: user.createdAt instanceof Date
        ? user.createdAt.toISOString()
        : null
    };

    await User.updateOne(
      { _id: new mongoose.Types.ObjectId(userId) },
      { $set: { lastActive: new Date() } }
    );

    return res.status(200).json({
      success: true,
      data: responseData
    });
  } catch (error) {
    handleError(error, res);
  }
};

// 8. Handle user likes
const handleLike = async (req, res) => {
  try {
    const userId = String(req.params.userId || '');
    const likerId = String(req.user._id || '');

    if (!isValidId(userId)) {
      return res.status(400).json({
        success: false,
        message: "Invalid user ID",
        systemCode: "INVALID_USER_ID"
      });
    }

    const likedUser = await User.findByIdAndUpdate(
      new mongoose.Types.ObjectId(userId),
      { $addToSet: { likesReceived: new mongoose.Types.ObjectId(likerId) } },
      { new: true }
    );

    if (!likedUser) {
      return res.status(404).json({
        success: false,
        message: "User not found",
        systemCode: "USER_NOT_FOUND"
      });
    }

    const hasActiveSubscription = req.user.subscription?.isActive &&
      new Date(req.user.subscription.expiresAt) > new Date();

    await User.findByIdAndUpdate(likedUser._id, {
      $push: {
        notifications: {
          type: 'new_like',
          from: new mongoose.Types.ObjectId(likerId),
          message: `${req.user.username} liked your profile`,
          requiresSubscription: !hasActiveSubscription,
          read: false,
          createdAt: new Date()
        }
      }
    });

    return res.status(200).json({
      success: true,
      message: "Like recorded successfully",
      canMessage: hasActiveSubscription
    });
  } catch (error) {
    handleError(error, res);
  }
};

// 9. Get subscription status
const getSubscriptionStatus = async (req, res) => {
  try {
    if (!req.user || !isValidId(req.user._id)) {
      return res.status(401).json({
        success: false,
        message: "Authentication required",
        systemCode: "AUTH_REQUIRED"
      });
    }

    const user = await User.findById(new mongoose.Types.ObjectId(req.user._id))
      .select("subscription freeUploadsUsed profileImages")
      .lean();

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found",
        systemCode: "USER_NOT_FOUND"
      });
    }

    const subscription = user.subscription || {};
    const isActive = Boolean(subscription.isActive) && 
      new Date(subscription.expiresAt) > new Date();

    return res.status(200).json({
      success: true,
      data: {
        isActive,
        expiresAt: subscription.expiresAt instanceof Date
          ? subscription.expiresAt.toISOString()
          : null,
        timeRemaining: isActive
          ? formatDistanceToNow(new Date(subscription.expiresAt))
          : null,
        freeUploadsUsed: Number(user.freeUploadsUsed) || 0,
        freeUploadsRemaining: Math.max(0, MAX_FREE_UPLOADS - (Number(user.freeUploadsUsed) || 0)),
        totalPhotos: Array.isArray(user.profileImages) ? user.profileImages.length : 0,
        canUploadMore: isActive || (Number(user.freeUploadsUsed) || 0) < MAX_FREE_UPLOADS,
        canMessage: isActive,
        canViewAllPhotos: isActive,
        subscriptionType: String(subscription.type || 'none')
      }
    });
  } catch (error) {
    handleError(error, res);
  }
};

// 10. Get notifications
const getNotifications = async (req, res) => {
  try {
    if (!req.user || !isValidId(req.user._id)) {
      return res.status(401).json({
        success: false,
        message: "Authentication required",
        systemCode: "AUTH_REQUIRED"
      });
    }

    const user = await User.findById(new mongoose.Types.ObjectId(req.user._id))
      .select("notifications")
      .populate("notifications.from", "username profileImages")
      .sort({ "notifications.createdAt": -1 })
      .lean();

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found",
        systemCode: "USER_NOT_FOUND"
      });
    }

    const safeNotifications = (user.notifications || []).map(notification => ({
      ...notification,
      _id: String(notification._id),
      from: notification.from ? {
        _id: String(notification.from._id),
        username: String(notification.from.username || ''),
        profileImages: (notification.from.profileImages || []).map(img => String(img))
      } : null,
      message: String(notification.message || ''),
      createdAt: notification.createdAt instanceof Date
        ? notification.createdAt.toISOString()
        : null
    }));

    return res.status(200).json({
      success: true,
      notifications: safeNotifications
    });
  } catch (error) {
    handleError(error, res);
  }
};

// 11. Mark notification as read
const markNotificationRead = async (req, res) => {
  try {
    const notificationId = String(req.params.notificationId || '');

    if (!isValidId(notificationId)) {
      return res.status(400).json({
        success: false,
        message: "Invalid notification ID",
        systemCode: "INVALID_NOTIFICATION_ID"
      });
    }

    const result = await User.updateOne(
      { 
        _id: new mongoose.Types.ObjectId(req.user._id),
        "notifications._id": new mongoose.Types.ObjectId(notificationId)
      },
      { $set: { "notifications.$.read": true } }
    );

    if (result.modifiedCount === 0) {
      return res.status(404).json({
        success: false,
        message: "Notification not found or already read",
        systemCode: "NOTIFICATION_NOT_FOUND"
      });
    }

    return res.status(200).json({
      success: true,
      message: "Notification marked as read"
    });
  } catch (error) {
    handleError(error, res);
  }
};

// 12. Update user preferences
const updatePreferences = async (req, res) => {
  try {
    const { preferences } = req.body;

    if (!preferences || typeof preferences !== 'object') {
      return res.status(400).json({
        success: false,
        message: "Invalid preferences format",
        systemCode: "INVALID_PREFERENCES"
      });
    }

    const updatedUser = await User.findByIdAndUpdate(
      new mongoose.Types.ObjectId(req.user._id),
      { $set: { preferences } },
      { new: true }
    ).select("preferences");

    return res.status(200).json({
      success: true,
      data: updatedUser.preferences
    });
  } catch (error) {
    handleError(error, res);
  }
};

// 13. Send message
const sendMessage = async (req, res) => {
  try {
    const { recipientId, content } = req.body;
    const senderId = req.user._id;

    // Implement your messaging logic here (e.g., saving to a messages collection)
    // For now we return a placeholder response.
    return res.status(200).json({
      success: true,
      message: `Message sent from ${senderId} to ${recipientId}`,
      content
    });
  } catch (error) {
    console.error("sendMessage error:", error);
    return res.status(500).json({ success: false, error: "Failed to send message" });
  }
};

// 14. Get conversation between two users
const getConversation = async (req, res) => {
  try {
    const { recipientId } = req.params;
    const senderId = req.user._id;

    // Implement your conversation retrieval logic here.
    // This is a placeholder response.
    return res.status(200).json({
      success: true,
      conversation: [],
      message: `Conversation between ${senderId} and ${recipientId}`
    });
  } catch (error) {
    console.error("getConversation error:", error);
    return res.status(500).json({ success: false, error: "Failed to retrieve conversation" });
  }
};

// 15. Delete user account
const deleteUserAccount = async (req, res) => {
  try {
    const { userId } = req.params;

    // Implement account deletion logic here (e.g., remove user and related data)
    // Placeholder response:
    return res.status(200).json({
      success: true,
      message: `User account ${userId} deleted`
    });
  } catch (error) {
    console.error("deleteUserAccount error:", error);
    return res.status(500).json({ success: false, error: "Failed to delete account" });
  }
};

// Export all methods
module.exports = {
  getMyProfile, // Added the new endpoint
  processSubscription,
  updateGender,
  updateDescription,
  getDescription,
  addProfileImages,
  getProfile,
  handleLike,
  getSubscriptionStatus,
  getNotifications,
  markNotificationRead,
  updatePreferences,
  sendMessage,
  getConversation,
  deleteUserAccount,
  handleError
};