const mongoose = require('mongoose');
const { Schema } = mongoose;

const notificationSchema = new Schema({
  // Recipient of the notification
  user: {
    type: Schema.Types.ObjectId,
    ref: 'User',
    required: [true, 'Notification must belong to a user'],
    index: true
  },

  // Sender of the notification (if applicable)
  from: {
    type: Schema.Types.ObjectId,
    ref: 'User',
    index: true
  },

  // Notification type
  type: {
    type: String,
    required: [true, 'Notification type is required'],
    enum: {
      values: [
        'new_like',
        'new_message',
        'subscription_activated',
        'match',
        'payment_received',
        'message_replied',
        'photo_like',
        'profile_view',
        'subscription_expiring',
        'admin_alert'
      ],
      message: 'Invalid notification type: {VALUE}'
    },
    index: true
  },

  // Notification title
  title: {
    type: String,
    required: [true, 'Notification title is required'],
    trim: true,
    maxlength: [100, 'Title cannot exceed 100 characters']
  },

  // Notification message
  message: {
    type: String,
    required: [true, 'Notification message is required'],
    trim: true,
    maxlength: [500, 'Message cannot exceed 500 characters']
  },

  // Read status
  read: {
    type: Boolean,
    default: false,
    index: true
  },

  // When notification was read
  readAt: {
    type: Date
  },

  // Related message (for message notifications)
  relatedMessage: {
    type: Schema.Types.ObjectId,
    ref: 'Message'
  },

  // Related user (for interactions)
  relatedUser: {
    type: Schema.Types.ObjectId,
    ref: 'User'
  },

  // Additional data (flexible field for any extra info)
  data: {
    type: Schema.Types.Mixed,
    default: {}
  },

  // Expiration for temporary notifications
  expiresAt: {
    type: Date,
    index: { expires: 0 } // TTL index
  },

  // Priority level (for sorting/filtering)
  priority: {
    type: Number,
    default: 0,
    min: 0,
    max: 10
  },

  // Metadata for analytics
  metadata: {
    deviceId: String,
    ipAddress: String,
    appVersion: String
  }
}, {
  timestamps: true, // Adds createdAt and updatedAt
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Indexes for optimized queries
notificationSchema.index({ user: 1, read: 1, createdAt: -1 });
notificationSchema.index({ createdAt: -1 });
notificationSchema.index({ type: 1, read: 1 });

// Virtual for time since creation
notificationSchema.virtual('timeAgo').get(function() {
  return formatDistanceToNow(this.createdAt, { addSuffix: true });
});

// Pre-save hook for title/message defaults
notificationSchema.pre('save', function(next) {
  if (!this.title) {
    this.title = this.type
      .split('_')
      .map(word => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ');
  }
  next();
});

// Static method to mark all notifications as read
notificationSchema.statics.markAllAsRead = function(userId) {
  return this.updateMany(
    { user: userId, read: false },
    { $set: { read: true, readAt: new Date() } }
  );
};

// Static method to get unread count
notificationSchema.statics.getUnreadCount = function(userId) {
  return this.countDocuments({ user: userId, read: false });
};

// Query helper to filter by unread
notificationSchema.query.unread = function() {
  return this.where({ read: false });
};

// Query helper to filter by type
notificationSchema.query.ofType = function(type) {
  return this.where({ type });
};

const Notification = mongoose.model('Notification', notificationSchema);

module.exports = Notification;