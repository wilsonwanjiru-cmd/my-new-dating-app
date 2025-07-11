const Notification = require('../models/Notification');
const User = require('../models/user');
const mongoose = require('mongoose');
const { formatDistanceToNow } = require('date-fns');

// Centralized error handler
const handleError = (error, res) => {
  console.error('Notification Controller Error:', error);
  
  if (error instanceof mongoose.Error.CastError) {
    return res.status(400).json({ 
      success: false, 
      message: 'Invalid ID format' 
    });
  }

  return res.status(500).json({ 
    success: false, 
    message: 'Internal server error',
    error: process.env.NODE_ENV === 'development' ? error : undefined
  });
};

/**
 * Get all notifications for the authenticated user
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
exports.getNotifications = async (req, res) => {
  try {
    const { limit = 20, page = 1 } = req.query;
    const skip = (page - 1) * limit;

    const notifications = await Notification.find({ user: req.user._id })
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit))
      .populate('from', 'name profileImages subscription')
      .populate('relatedMessage', 'content')
      .populate('relatedUser', 'name profileImages');

    const total = await Notification.countDocuments({ user: req.user._id });

    return res.status(200).json({
      success: true,
      data: notifications,
      pagination: {
        total,
        page: parseInt(page),
        limit: parseInt(limit),
        totalPages: Math.ceil(total / limit)
      }
    });
  } catch (error) {
    return handleError(error, res);
  }
};

/**
 * Mark all notifications as read for the authenticated user
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
exports.markAllAsRead = async (req, res) => {
  try {
    await Notification.updateMany(
      { user: req.user._id, read: false },
      { $set: { read: true, readAt: new Date() } }
    );

    // Update user's last notification read time
    await User.findByIdAndUpdate(req.user._id, {
      $set: { lastNotificationRead: new Date() }
    });

    return res.status(200).json({
      success: true,
      message: 'All notifications marked as read'
    });
  } catch (error) {
    return handleError(error, res);
  }
};

/**
 * Mark a single notification as read
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
exports.markSingleAsRead = async (req, res) => {
  try {
    const notification = await Notification.findOneAndUpdate(
      { _id: req.params.notificationId, user: req.user._id },
      { $set: { read: true, readAt: new Date() } },
      { new: true }
    );

    if (!notification) {
      return res.status(404).json({
        success: false,
        message: 'Notification not found or unauthorized'
      });
    }

    return res.status(200).json({
      success: true,
      data: notification,
      message: 'Notification marked as read'
    });
  } catch (error) {
    return handleError(error, res);
  }
};

/**
 * Get count of unread notifications for the authenticated user
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
exports.getUnreadCount = async (req, res) => {
  try {
    const count = await Notification.countDocuments({
      user: req.user._id,
      read: false
    });

    return res.status(200).json({
      success: true,
      count
    });
  } catch (error) {
    return handleError(error, res);
  }
};

/**
 * Delete a specific notification
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
exports.deleteNotification = async (req, res) => {
  try {
    const notification = await Notification.findOneAndDelete({
      _id: req.params.notificationId,
      user: req.user._id
    });

    if (!notification) {
      return res.status(404).json({
        success: false,
        message: 'Notification not found or unauthorized'
      });
    }

    return res.status(200).json({
      success: true,
      message: 'Notification deleted successfully'
    });
  } catch (error) {
    return handleError(error, res);
  }
};

/**
 * Create a new notification
 * @param {String} userId - Recipient user ID
 * @param {Object} notificationData - Notification data
 */
exports.createNotification = async (userId, notificationData) => {
  try {
    const notification = await Notification.create({
      user: userId,
      ...notificationData
    });

    // Populate necessary fields if needed
    return await Notification.populate(notification, [
      { path: 'from', select: 'name profileImages' },
      { path: 'relatedMessage', select: 'content' },
      { path: 'relatedUser', select: 'name profileImages' }
    ]);
  } catch (error) {
    console.error('Error creating notification:', error);
    return null;
  }
};