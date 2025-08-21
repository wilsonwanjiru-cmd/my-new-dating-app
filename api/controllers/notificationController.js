const Notification = require('../models/notification');
const User = require('../models/user');
const mongoose = require('mongoose');
const { formatDistanceToNow } = require('date-fns');

const isDev = process.env.NODE_ENV === 'development';

// ==================== Enhanced Error Handler ====================
const handleError = (error, res, customMessage = 'Internal server error') => {
  console.error('Notification Controller Error:', error);

  if (error instanceof mongoose.Error.CastError) {
    return res.status(400).json({ 
      success: false, 
      message: 'Invalid ID format',
      code: 'INVALID_ID'
    });
  }

  if (error.code === 11000) {
    return res.status(409).json({
      success: false,
      message: 'Duplicate notification prevented',
      code: 'DUPLICATE_NOTIFICATION'
    });
  }

  return res.status(500).json({ 
    success: false, 
    message: customMessage,
    error: isDev ? error.message : undefined,
    code: 'SERVER_ERROR'
  });
};

// ==================== Controller Methods ====================

/**
 * Get notifications with advanced filtering
 */
const getNotifications = async (req, res) => {
  try {
    const { limit = 20, page = 1, type, unreadOnly } = req.query;
    const skip = (page - 1) * parseInt(limit);

    const filter = { user: req.user._id };
    if (type) filter.type = type;
    if (unreadOnly === 'true') filter.read = false;

    const notifications = await Notification.find(filter)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit))
      .populate({
        path: 'from',
        select: 'name profileImages isOnline lastActive',
        transform: doc => doc ? {
          ...doc._doc,
          status: doc.isOnline ? 'online' : `last seen ${formatDistanceToNow(doc.lastActive)} ago`
        } : null
      })
      .populate('relatedMessage', 'content createdAt')
      .populate('relatedUser', 'name profileImages isOnline');

    const total = await Notification.countDocuments(filter);

    // Mark as read if viewing unread notifications
    if (unreadOnly === 'true') {
      await Notification.updateMany(
        { _id: { $in: notifications.map(n => n._id) } },
        { $set: { read: true, readAt: new Date() } }
      );
      
      // Update last read timestamp
      await User.findByIdAndUpdate(req.user._id, {
        $set: { lastNotificationRead: new Date() }
      });

      // Emit real-time update
      if (global.io && notifications.length > 0) {
        global.io.to(`user-${req.user._id}`).emit('notifications-read', {
          count: notifications.length
        });
      }
    }

    return res.status(200).json({
      success: true,
      data: notifications,
      pagination: {
        total,
        page: parseInt(page),
        limit: parseInt(limit),
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    return handleError(error, res, 'Error retrieving notifications');
  }
};

/**
 * Optimized mark all as read with real-time update
 */
const markAllAsRead = async (req, res) => {
  try {
    const result = await Notification.updateMany(
      { user: req.user._id, read: false },
      { $set: { read: true, readAt: new Date() } }
    );

    await User.findByIdAndUpdate(req.user._id, {
      $set: { lastNotificationRead: new Date() },
    });

    // Real-time update
    if (global.io && result.modifiedCount > 0) {
      global.io.to(`user-${req.user._id}`).emit('all-notifications-read', {
        count: result.modifiedCount,
        timestamp: new Date()
      });
    }

    return res.status(200).json({
      success: true,
      message: `${result.modifiedCount} notifications marked as read`,
      count: result.modifiedCount
    });
  } catch (error) {
    return handleError(error, res, 'Error marking all notifications as read');
  }
};

/**
 * Enhanced single notification read with real-time event
 */
const markSingleAsRead = async (req, res) => {
  try {
    const { notificationId } = req.params;

    const notification = await Notification.findOneAndUpdate(
      { _id: notificationId, user: req.user._id },
      { $set: { read: true, readAt: new Date() } },
      { new: true }
    ).populate('from', 'name profileImages');

    if (!notification) {
      return res.status(404).json({
        success: false,
        message: 'Notification not found or unauthorized',
        code: 'NOT_FOUND'
      });
    }

    // Real-time update
    if (global.io) {
      global.io.to(`user-${req.user._id}`).emit('notification-read', {
        notificationId: notification._id,
        readAt: notification.readAt
      });
    }

    return res.status(200).json({
      success: true,
      data: notification,
      message: 'Notification marked as read',
    });
  } catch (error) {
    return handleError(error, res, 'Error marking notification as read');
  }
};

/**
 * Enhanced unread count with caching
 */
const getUnreadCount = async (req, res) => {
  try {
    const lastRead = req.user.lastNotificationRead || new Date(0);
    
    const count = await Notification.countDocuments({
      user: req.user._id,
      read: false,
      createdAt: { $gt: lastRead }
    });

    // Cache control headers for performance
    res.set('Cache-Control', 'public, max-age=30');
    
    return res.status(200).json({
      success: true,
      count,
      lastRead,
    });
  } catch (error) {
    return handleError(error, res, 'Error retrieving unread notification count');
  }
};

/**
 * Secure notification deletion with confirmation
 */
const deleteNotification = async (req, res) => {
  try {
    const { notificationId } = req.params;

    const notification = await Notification.findOneAndDelete({
      _id: notificationId,
      user: req.user._id,
    });

    if (!notification) {
      return res.status(404).json({
        success: false,
        message: 'Notification not found or unauthorized',
        code: 'NOT_FOUND'
      });
    }

    // Real-time update
    if (global.io) {
      global.io.to(`user-${req.user._id}`).emit('notification-deleted', {
        notificationId: notification._id,
        type: notification.type
      });
    }

    return res.status(200).json({
      success: true,
      message: 'Notification deleted successfully',
      deletedId: notificationId
    });
  } catch (error) {
    return handleError(error, res, 'Error deleting notification');
  }
};

/**
 * Enhanced notification creation with deduplication
 */
const createNotification = async (userId, notificationData) => {
  try {
    // Deduplication check
    const duplicate = await Notification.findOne({
      user: userId,
      type: notificationData.type,
      from: notificationData.from,
      relatedEntity: notificationData.relatedEntity,
      createdAt: { $gt: new Date(Date.now() - 24 * 60 * 60 * 1000) } // 24h window
    });

    if (duplicate) {
      console.log('Duplicate notification prevented');
      return duplicate;
    }

    const notification = await Notification.create({
      user: userId,
      ...notificationData,
    });

    const populated = await Notification.populate(notification, [
      { path: 'from', select: 'name profileImages isOnline' },
      { path: 'relatedMessage', select: 'content' },
      { path: 'relatedUser', select: 'name profileImages' },
    ]);

    // Real-time notification
    if (global.io) {
      global.io.to(`user-${userId}`).emit('new-notification', populated);
    }

    return populated;
  } catch (error) {
    console.error('Error creating notification:', error);
    if (error.code === 11000) {
      console.log('Duplicate key error - notification already exists');
      return await Notification.findOne({
        user: userId,
        type: notificationData.type,
        from: notificationData.from,
        relatedEntity: notificationData.relatedEntity
      });
    }
    return null;
  }
};

// ==================== Exports ====================
module.exports = {
  getNotifications,
  markAllAsRead,
  markSingleAsRead,
  getUnreadCount,
  deleteNotification,
  createNotification,
};