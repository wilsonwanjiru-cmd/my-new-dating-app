const mongoose = require('mongoose');
const { Schema } = mongoose;

const chatSchema = new Schema({
  // Core Message Fields
  sender: {
    type: Schema.Types.ObjectId,
    ref: 'User',
    required: [true, 'Sender ID is required'],
    index: true
  },
  recipient: {
    type: Schema.Types.ObjectId,
    ref: 'User',
    required: [true, 'Recipient ID is required'],
    index: true
  },
  content: {
    type: String,
    trim: true,
    maxlength: 2000,
    required: function() {
      return !this.photoContext && (!this.attachments || this.attachments.length === 0);
    }
  },

  // Thread Management
  threadId: {
    type: Schema.Types.ObjectId,
    ref: 'Chat',
    index: true
  },
  isThreadStarter: {
    type: Boolean,
    default: false
  },

  // Photo Context (Critical for Ruda's photo-initiated chats)
  photoContext: {
    type: Schema.Types.ObjectId,
    ref: 'Photo',
    index: true
  },
  photoPreviewUrl: String,

  // Subscription Control
  requiresSubscription: {
    type: Boolean,
    default: true
  },
  subscriptionBypass: {
    type: Boolean,
    default: false
  },

  // Message Status
  isRead: {
    type: Boolean,
    default: false
  },
  readAt: Date,
  status: {
    type: String,
    enum: ['sent', 'delivered', 'seen'],
    default: 'sent'
  },

  // Moderation & Deletion
  deletedBy: [{
    type: Schema.Types.ObjectId,
    ref: 'User'
  }],
  moderated: {
    type: Boolean,
    default: false
  },

  // Metadata
  deviceInfo: {
    os: String,
    browser: String
  },
  ipAddress: String
}, {
  timestamps: true,
  toJSON: {
    virtuals: true,
    transform: function(doc, ret) {
      ret.id = ret._id;
      delete ret._id;
      delete ret.__v;
      delete ret.deletedBy;
      delete ret.deviceInfo;
      delete ret.ipAddress;
      return ret;
    }
  }
});

// ======================
// INDEXES (Optimized for Ruda's Use Cases)
// ======================
chatSchema.index({ sender: 1, recipient: 1, createdAt: -1 }); // Primary chat view
chatSchema.index({ threadId: 1, createdAt: 1 }); // Threaded messages
chatSchema.index({ photoContext: 1 }); // Photo-initiated chat lookup
chatSchema.index({ createdAt: -1 }); // General sorting
chatSchema.index({ 
  "content": "text",
  "attachments.originalName": "text"
}, {
  weights: {
    content: 3,
    "attachments.originalName": 1
  }
});

// ======================
// VIRTUAL PROPERTIES
// ======================
chatSchema.virtual('isActive').get(function() {
  return !this.deletedBy || this.deletedBy.length === 0;
});

chatSchema.virtual('canReply').get(function() {
  return !this.requiresSubscription || this.subscriptionBypass;
});

chatSchema.virtual('photoDetails', {
  ref: 'Photo',
  localField: 'photoContext',
  foreignField: '_id',
  justOne: true
});

// ======================
// PRE-SAVE HOOKS
// ======================
chatSchema.pre('save', function(next) {
  // Auto-set threadId for new messages
  if (this.isNew && !this.threadId) {
    this.threadId = this._id;
    this.isThreadStarter = true;
  }

  // Auto-generate photo preview URL if photo context exists
  if (this.photoContext && !this.photoPreviewUrl) {
    this.photoPreviewUrl = `/api/photos/${this.photoContext}/preview`;
  }

  next();
});

// ======================
// STATIC METHODS (Ruda-Specific)
// ======================

/**
 * Finds or creates a photo-initiated chat thread
 * @param {ObjectId} senderId 
 * @param {ObjectId} recipientId 
 * @param {ObjectId} photoId 
 * @returns {Promise<Chat>}
 */
chatSchema.statics.initiateFromPhoto = async function(senderId, recipientId, photoId) {
  if (senderId.toString() === recipientId.toString()) {
    throw new Error('Cannot start chat with yourself');
  }

  const existingChat = await this.findOne({
    $or: [
      { sender: senderId, recipient: recipientId, photoContext: photoId },
      { sender: recipientId, recipient: senderId, photoContext: photoId }
    ],
    deletedBy: { $ne: senderId }
  })
  .sort({ createdAt: -1 });

  if (existingChat) {
    return existingChat;
  }

  return this.create({
    sender: senderId,
    recipient: recipientId,
    photoContext: photoId,
    content: 'I saw your photo and wanted to connect!',
    requiresSubscription: true
  });
};

/**
 * Gets conversation between two users
 * @param {ObjectId} user1Id 
 * @param {ObjectId} user2Id 
 * @param {Object} options 
 * @returns {Promise<Chat[]>}
 */
chatSchema.statics.getConversation = async function(user1Id, user2Id, options = {}) {
  const { limit = 20, before } = options;

  const query = {
    $or: [
      { sender: user1Id, recipient: user2Id },
      { sender: user2Id, recipient: user1Id }
    ],
    deletedBy: { $ne: user1Id }
  };

  if (before) {
    query.createdAt = { $lt: new Date(before) };
  }

  return this.find(query)
    .sort({ createdAt: -1 })
    .limit(limit)
    .populate('sender', 'name profileImages subscription')
    .populate('recipient', 'name profileImages subscription')
    .populate('photoDetails');
};

/**
 * Gets all chat threads for a user (Ruda's inbox view)
 * @param {ObjectId} userId 
 * @returns {Promise<Chat[]>}
 */
chatSchema.statics.getUserThreads = async function(userId) {
  return this.aggregate([
    {
      $match: {
        $or: [
          { sender: userId },
          { recipient: userId }
        ],
        deletedBy: { $ne: userId }
      }
    },
    {
      $sort: { updatedAt: -1 }
    },
    {
      $group: {
        _id: "$threadId",
        lastMessage: { $first: "$$ROOT" },
        unreadCount: {
          $sum: {
            $cond: [
              {
                $and: [
                  { $eq: ["$recipient", userId] },
                  { $eq: ["$isRead", false] }
                ]
              },
              1,
              0
            ]
          }
        }
      }
    },
    {
      $lookup: {
        from: "users",
        localField: "lastMessage.sender",
        foreignField: "_id",
        as: "sender"
      }
    },
    {
      $lookup: {
        from: "users",
        localField: "lastMessage.recipient",
        foreignField: "_id",
        as: "recipient"
      }
    },
    {
      $unwind: "$sender"
    },
    {
      $unwind: "$recipient"
    },
    {
      $project: {
        _id: "$lastMessage._id",
        threadId: 1,
        content: "$lastMessage.content",
        photoContext: "$lastMessage.photoContext",
        isRead: "$lastMessage.isRead",
        createdAt: "$lastMessage.createdAt",
        unreadCount: 1,
        partner: {
          $cond: [
            { $eq: ["$lastMessage.sender", userId] },
            "$recipient",
            "$sender"
          ]
        }
      }
    },
    {
      $project: {
        _id: 1,
        threadId: 1,
        content: 1,
        photoContext: 1,
        isRead: 1,
        createdAt: 1,
        unreadCount: 1,
        partner: {
          _id: "$partner._id",
          name: "$partner.name",
          profileImages: "$partner.profileImages",
          isSubscribed: "$partner.subscription.isActive"
        }
      }
    }
  ]);
};

// ======================
// INSTANCE METHODS
// ======================

/**
 * Marks message as read
 */
chatSchema.methods.markAsRead = function() {
  if (this.isRead) return;
  
  this.isRead = true;
  this.readAt = new Date();
  this.status = 'seen';
  return this.save();
};

/**
 * Soft deletes message for a user
 * @param {ObjectId} userId 
 */
chatSchema.methods.softDeleteForUser = function(userId) {
  if (!this.deletedBy.includes(userId)) {
    this.deletedBy.push(userId);
  }
  return this.save();
};

const Chat = mongoose.model('Chat', chatSchema);

module.exports = Chat;