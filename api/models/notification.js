const mongoose = require('mongoose');
const { Schema } = mongoose;

const notificationSchema = new Schema({
  // Core Notification Fields - FIXED: Changed 'recipient' to 'recipient'
  recipient: {
    type: Schema.Types.ObjectId,
    ref: 'User',
    required: [true, 'Recipient is required'],
    index: true
  },
  sender: {
    type: Schema.Types.ObjectId,
    ref: 'User',
    index: true
  },
  type: {
    type: String,
    required: true,
    enum: [
      'new_like',
      'new_message',
      'chat_initiated',    // When someone starts chat from photo
      'photo_like',       // When someone likes a photo
      'subscription_alert',
      'match_notification',
      'admin_announcement'
    ],
    index: true
  },
  title: {
    type: String,
    trim: true,
    maxlength: 100
  },
  message: {
    type: String,
    trim: true,
    maxlength: 500
  },

  // Related Entities (Enhanced for Ruda)
  photo: {
    type: Schema.Types.ObjectId,
    ref: 'Photo'
  },
  chat: {
    type: Schema.Types.ObjectId,
    ref: 'Chat'
  },
  subscription: {
    type: Schema.Types.ObjectId,
    ref: 'Subscription'
  },

  // Status Fields
  isRead: {
    type: Boolean,
    default: false,
    index: true
  },
  readAt: Date,
  isArchived: {
    type: Boolean,
    default: false,
    index: true
  },

  // Metadata (Enhanced)
  metadata: {
    requiresSubscription: {
      type: Boolean,
      default: false
    },
    photoUrl: String,      // Cached photo URL
    senderPhotoUrl: String,// Cached sender's profile photo
    expirationHours: {     // For temporary notifications
      type: Number,
      default: 72
    },
    priority: {            // 1-5 scale
      type: Number,
      min: 1,
      max: 5,
      default: 3
    }
  }
}, {
  timestamps: true,
  toJSON: { 
    virtuals: true,
    transform: function(doc, ret) {
      ret.id = ret._id;
      delete ret._id;
      delete ret.__v;
      delete ret.isArchived;
      return ret;
    }
  }
});

// ======================
// INDEXES (Optimized for Ruda)
// ======================
notificationSchema.index({ recipient: 1, isRead: 1, createdAt: -1 }); // Main inbox view
notificationSchema.index({ photo: 1 }); // For photo-related notifications
notificationSchema.index({ chat: 1 });  // For chat-related notifications
notificationSchema.index({ 
  createdAt: -1,
  'metadata.priority': -1 
}); // For sorting

// ======================
// VIRTUAL PROPERTIES
// ======================
notificationSchema.virtual('previewImage').get(function() {
  return this.metadata.photoUrl || this.metadata.senderPhotoUrl || null;
});

notificationSchema.virtual('isHighPriority').get(function() {
  return this.metadata.priority >= 4;
});

notificationSchema.virtual('isSubscriptionRelated').get(function() {
  return this.type.includes('subscription') || this.metadata.requiresSubscription;
});

// ======================
// PRE-SAVE HOOKS
// ======================
notificationSchema.pre('save', function(next) {
  // Auto-generate title if not provided
  if (!this.title) {
    this.title = this.type
      .split('_')
      .map(word => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ');
  }

  // Set requiresSubscription for chat-related notifications
  if (['chat_initiated', 'new_message'].includes(this.type)) {
    this.metadata.requiresSubscription = true;
  }
  
  // Ensure recipient is always set
  if (!this.recipient) {
    const err = new mongoose.Error.ValidationError(this);
    err.errors.recipient = new mongoose.Error.ValidatorError({
      message: 'Recipient is required',
      path: 'recipient',
      value: this.recipient
    });
    return next(err);
  }

  next();
});

// ======================
// STATIC METHODS (Ruda-Specific)
// ======================

/**
 * Creates a photo-like notification
 */
notificationSchema.statics.createPhotoLike = async function(
  recipientId, 
  senderId, 
  photoId,
  likeCount
) {
  const sender = await mongoose.model('User').findById(senderId, 'name profileImages');
  
  return this.create({
    recipient: recipientId,
    sender: senderId,
    type: 'photo_like',
    photo: photoId,
    message: `${sender.name} liked your photo`,
    metadata: {
      senderPhotoUrl: sender.profileImages[0]?.url,
      priority: 2,
      likeCount: likeCount
    }
  });
};

/**
 * Creates a chat-initiated notification (from photo)
 */
notificationSchema.statics.createChatInitiated = async function(
  recipientId,
  senderId,
  photoId,
  chatId
) {
  const sender = await mongoose.model('User').findById(senderId, 'name profileImages');
  const photo = await mongoose.model('Photo').findById(photoId, 'url');

  return this.create({
    recipient: recipientId,
    sender: senderId,
    type: 'chat_initiated',
    photo: photoId,
    chat: chatId,
    message: `${sender.name} started a chat about your photo`,
    metadata: {
      requiresSubscription: true,
      photoUrl: photo.url,
      senderPhotoUrl: sender.profileImages[0]?.url,
      priority: 4 // High priority
    }
  });
};

/**
 * Creates subscription alert notification
 */
notificationSchema.statics.createSubscriptionAlert = function(
  userId, 
  message, 
  isExpirationWarning = false
) {
  return this.create({
    recipient: userId,
    type: 'subscription_alert',
    message: message,
    metadata: {
      priority: isExpirationWarning ? 5 : 3,
      expirationHours: isExpirationWarning ? 24 : 72
    }
  });
};

/**
 * Marks all notifications as read for a user
 */
notificationSchema.statics.markAllAsRead = function(userId) {
  return this.updateMany(
    { recipient: userId, isRead: false },
    { $set: { isRead: true, readAt: new Date() } }
  );
};

/**
 * Gets unread count for user
 */
notificationSchema.statics.getUnreadCount = function(userId) {
  return this.countDocuments({ recipient: userId, isRead: false });
};

// ======================
// INSTANCE METHODS
// ======================

/**
 * Marks notification as read
 */
notificationSchema.methods.markAsRead = function() {
  if (this.isRead) return Promise.resolve(this);
  
  this.isRead = true;
  this.readAt = new Date();
  return this.save();
};

/**
 * Archives notification
 */
notificationSchema.methods.archive = function() {
  this.isArchived = true;
  return this.save();
};

const Notification = mongoose.model('Notification', notificationSchema);

module.exports = Notification;