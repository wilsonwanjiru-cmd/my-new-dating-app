const User = require("../models/user");
const mongoose = require("mongoose");
const { formatDistanceToNow } = require('date-fns');
const MAX_FREE_UPLOADS = 7;

// Centralized error handler
const handleError = (error, res) => {
  console.error("Controller Error:", error);

  if (error.name === "ValidationError") {
    return res.status(400).json({
      success: false,
      message: error.message
    });
  }

  if (error.name === "CastError") {
    return res.status(400).json({
      success: false,
      message: "Invalid ID format"
    });
  }

  return res.status(500).json({
    success: false,
    message: "Internal server error",
    error: process.env.NODE_ENV === "development" ? error : undefined
  });
};

const isValidId = (id) => mongoose.Types.ObjectId.isValid(id);

// 1. Process Daily Subscription (KES 10 for 24 hours)
const processSubscription = async (req, res) => {
  try {
    const { userId } = req.params;
    const { amount, paymentMethod } = req.body;

    if (!userId || !isValidId(userId)) {
      return res.status(400).json({ success: false, message: "Invalid user ID" });
    }

    if (amount !== 10) {
      return res.status(400).json({
        success: false,
        message: "Daily subscription requires exactly KES 10 payment"
      });
    }

    const expiresAt = new Date();
    expiresAt.setHours(expiresAt.getHours() + 24);

    const updatedUser = await User.findByIdAndUpdate(
      userId,
      {
        $set: {
          subscription: {
            type: 'daily',
            isActive: true,
            expiresAt,
            paymentMethod,
            amount: 10
          },
          freeUploadsUsed: 0
        }
      },
      { new: true }
    );

    if (!updatedUser) {
      return res.status(404).json({ success: false, message: "User not found" });
    }

    res.status(200).json({
      success: true,
      message: "KES 10 daily subscription activated (expires in 24 hours)",
      subscription: updatedUser.subscription
    });
  } catch (error) {
    console.error("Subscription error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to process subscription"
    });
  }
};

// 2. Update user description
const updateDescription = async (req, res) => {
  try {
    const { userId } = req.params;
    const { description } = req.body;

    if (!description || typeof description !== 'string') {
      return res.status(400).json({
        success: false,
        message: "Invalid description provided"
      });
    }

    if (description.length > 500) {
      return res.status(400).json({
        success: false,
        message: "Description cannot exceed 500 characters"
      });
    }

    const updatedUser = await User.findByIdAndUpdate(
      userId,
      { $set: { description } },
      { new: true, runValidators: true }
    ).select('-password');

    if (!updatedUser) {
      return res.status(404).json({
        success: false,
        message: "User not found"
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

// 3. Get user description
const getDescription = async (req, res) => {
  try {
    const user = await User.findById(req.params.userId).select('description');
    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found"
      });
    }

    res.json({
      success: true,
      description: user.description || ''
    });
  } catch (error) {
    handleError(error, res);
  }
};

// 4. Add profile images with subscription check
const addProfileImages = async (req, res) => {
  try {
    const { userId } = req.params;
    const imageUrls = req.uploadedImageUrls || req.body.profileImages || [];

    if (!isValidId(userId)) {
      return res.status(400).json({
        success: false,
        message: "Invalid user ID"
      });
    }

    if (!Array.isArray(imageUrls) || imageUrls.length === 0) {
      return res.status(400).json({
        success: false,
        message: "profileImages must be a non-empty array"
      });
    }

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found"
      });
    }

    const hasActiveSubscription = user.subscription?.isActive &&
      new Date(user.subscription.expiresAt) > new Date();
    const canUpload = hasActiveSubscription ||
      (user.freeUploadsUsed + imageUrls.length <= MAX_FREE_UPLOADS);

    if (!canUpload) {
      const remaining = MAX_FREE_UPLOADS - user.freeUploadsUsed;
      return res.status(403).json({
        success: false,
        message: `Free users can upload max ${MAX_FREE_UPLOADS} photos (${remaining} remaining). Subscribe for KES 10 to unlock unlimited uploads for 24 hours.`,
        remainingSlots: remaining,
        code: 'UPLOAD_LIMIT_EXCEEDED',
        upgradeRequired: true
      });
    }

    const update = {
      $addToSet: { profileImages: { $each: imageUrls } },
      $set: { lastActive: new Date() }
    };

    if (!hasActiveSubscription) {
      update.$inc = { freeUploadsUsed: imageUrls.length };
    }

    const updatedUser = await User.findByIdAndUpdate(
      userId,
      update,
      { new: true, runValidators: true }
    ).select("profileImages freeUploadsUsed subscription");

    return res.status(200).json({
      success: true,
      profileImages: updatedUser.profileImages,
      uploadsRemaining: hasActiveSubscription
        ? 'Unlimited'
        : MAX_FREE_UPLOADS - updatedUser.freeUploadsUsed,
      subscriptionStatus: {
        isActive: hasActiveSubscription,
        expiresAt: updatedUser.subscription?.expiresAt
      }
    });
  } catch (error) {
    return handleError(error, res);
  }
};

// 5. Get user profile
const getProfile = async (req, res) => {
  try {
    const { userId } = req.params;

    if (!isValidId(userId)) {
      return res.status(400).json({
        success: false,
        message: "Invalid user ID"
      });
    }

    const profileUser = await User.findById(userId)
      .select("-password -__v -verificationToken -resetToken")
      .populate("crushes", "name profileImages")
      .populate("matches", "name profileImages");

    if (!profileUser) {
      return res.status(404).json({
        success: false,
        message: "User not found"
      });
    }

    const hasActiveSubscription = req.user?.subscription?.isActive &&
      new Date(req.user.subscription.expiresAt) > new Date();

    const visiblePhotos = hasActiveSubscription
      ? profileUser.profileImages
      : profileUser.profileImages.slice(0, MAX_FREE_UPLOADS);

    const responseData = {
      ...profileUser.toObject(),
      profileImages: visiblePhotos,
      subscriptionStatus: {
        isRequired: !hasActiveSubscription &&
          profileUser.profileImages.length > MAX_FREE_UPLOADS,
        canViewAll: hasActiveSubscription,
        remainingPhotos: hasActiveSubscription
          ? 0
          : Math.max(0, profileUser.profileImages.length - MAX_FREE_UPLOADS)
      }
    };

    await User.findByIdAndUpdate(userId, {
      $set: { lastActive: new Date() }
    });

    return res.status(200).json({
      success: true,
      data: responseData
    });
  } catch (error) {
    return handleError(error, res);
  }
};

// 6. Handle user likes
const handleLike = async (req, res) => {
  try {
    const { userId } = req.params;
    const likerId = req.user._id;

    if (!isValidId(userId)) {
      return res.status(400).json({
        success: false,
        message: "Invalid user ID"
      });
    }

    const likedUser = await User.findByIdAndUpdate(
      userId,
      { $addToSet: { likesReceived: likerId } },
      { new: true }
    );

    if (!likedUser) {
      return res.status(404).json({
        success: false,
        message: "User not found"
      });
    }

    const hasActiveSubscription = req.user.subscription?.isActive &&
      new Date(req.user.subscription.expiresAt) > new Date();

    await User.findByIdAndUpdate(likedUser._id, {
      $push: {
        notifications: {
          type: 'new_like',
          from: likerId,
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
    return handleError(error, res);
  }
};

// 7. Get subscription status
const getSubscriptionStatus = async (req, res) => {
  try {
    const user = await User.findById(req.user._id)
      .select("subscription freeUploadsUsed profileImages");

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found"
      });
    }

    const isActive = user.subscription?.isActive &&
      new Date(user.subscription.expiresAt) > new Date();

    return res.status(200).json({
      success: true,
      data: {
        isActive,
        expiresAt: user.subscription?.expiresAt,
        timeRemaining: isActive
          ? formatDistanceToNow(new Date(user.subscription.expiresAt))
          : null,
        freeUploadsUsed: user.freeUploadsUsed,
        freeUploadsRemaining: MAX_FREE_UPLOADS - user.freeUploadsUsed,
        totalPhotos: user.profileImages.length,
        canUploadMore: isActive || user.freeUploadsUsed < MAX_FREE_UPLOADS,
        canMessage: isActive,
        canViewAllPhotos: isActive,
        subscriptionType: user.subscription?.type || 'none'
      }
    });
  } catch (error) {
    return handleError(error, res);
  }
};

// 8. Get notifications
const getNotifications = async (req, res) => {
  try {
    const user = await User.findById(req.user._id)
      .select("notifications")
      .populate("notifications.from", "username profileImages")
      .sort({ "notifications.createdAt": -1 });

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found"
      });
    }

    return res.status(200).json({
      success: true,
      notifications: user.notifications
    });
  } catch (error) {
    return handleError(error, res);
  }
};

// 9. Mark notification as read
const markNotificationRead = async (req, res) => {
  try {
    const { notificationId } = req.params;

    const result = await User.updateOne(
      { _id: req.user._id, "notifications._id": notificationId },
      { $set: { "notifications.$.read": true } }
    );

    if (result.modifiedCount === 0) {
      return res.status(404).json({
        success: false,
        message: "Notification not found or already read"
      });
    }

    return res.status(200).json({
      success: true,
      message: "Notification marked as read"
    });
  } catch (error) {
    return handleError(error, res);
  }
};

// 10. Get current user data
const getCurrentUser = async (req, res) => {
  try {
    const user = await User.findById(req.user._id)
      .select("-password -__v -verificationToken -resetToken");

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found"
      });
    }

    return res.status(200).json({
      success: true,
      data: user
    });
  } catch (error) {
    return handleError(error, res);
  }
};

// 11. Update user preferences
const updatePreferences = async (req, res) => {
  try {
    const { preferences } = req.body;

    if (!preferences || typeof preferences !== 'object') {
      return res.status(400).json({
        success: false,
        message: "Invalid preferences format"
      });
    }

    const updatedUser = await User.findByIdAndUpdate(
      req.user._id,
      { $set: { preferences } },
      { new: true }
    ).select("preferences");

    return res.status(200).json({
      success: true,
      data: updatedUser.preferences
    });
  } catch (error) {
    return handleError(error, res);
  }
};

// 12. Send message (missing method)
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

// 13. Get conversation between two users
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

// 14. Add crush (e.g., to indicate interest)
const addCrush = async (req, res) => {
  try {
    const { crushId } = req.params;
    const userId = req.user._id;

    // Implement logic to add a crush to the user's record.
    // Placeholder response:
    return res.status(200).json({
      success: true,
      message: `User ${userId} added crush ${crushId}`
    });
  } catch (error) {
    console.error("addCrush error:", error);
    return res.status(500).json({ success: false, error: "Failed to add crush" });
  }
};

// 15. Remove crush
const removeCrush = async (req, res) => {
  try {
    const { crushId } = req.params;
    const userId = req.user._id;

    // Implement logic to remove a crush from the user's record.
    // Placeholder response:
    return res.status(200).json({
      success: true,
      message: `User ${userId} removed crush ${crushId}`
    });
  } catch (error) {
    console.error("removeCrush error:", error);
    return res.status(500).json({ success: false, error: "Failed to remove crush" });
  }
};

// 16. Delete user account
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
  processSubscription,
  updateDescription,
  getDescription,
  addProfileImages,
  getProfile,
  handleLike,
  getSubscriptionStatus,
  getNotifications,
  markNotificationRead,
  getCurrentUser,
  updatePreferences,
  sendMessage,
  getConversation,
  addCrush,
  removeCrush,
  deleteUserAccount,
  handleError
};
