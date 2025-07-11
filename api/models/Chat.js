const mongoose = require('mongoose');
const { Schema } = mongoose;

const messageSchema = new Schema({
  // Required fields for basic functionality
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
    required: function() {
      return !this.attachments || this.attachments.length === 0;
    },
    trim: true,
    maxlength: 2000
  },
  isRead: {
    type: Boolean,
    default: false
  },
  readAt: {
    type: Date
  },
  requiresSubscription: {
    type: Boolean,
    default: false
  },
  edited: {
    type: Boolean,
    default: false
  },
  deletedBy: [{
    type: Schema.Types.ObjectId,
    ref: 'User'
  }],

  // Enhanced fields from your existing model
  attachments: [{
    url: String,
    fileType: {
      type: String,
      enum: ['image', 'video', 'audio', 'document', 'other']
    },
    thumbnail: String,
    size: Number,
    originalName: String
  }],
  status: {
    type: String,
    enum: ['sent', 'delivered', 'seen'],
    default: 'sent'
  },
  expiresAt: {
    type: Date,
    index: { expires: 0 }
  },
  metadata: {
    deviceId: String,
    ipAddress: String
  }
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Indexes for performance
messageSchema.index({ sender: 1, recipient: 1, createdAt: -1 });
messageSchema.index({ recipient: 1, isRead: 1 });
messageSchema.index({ createdAt: -1 });
messageSchema.index({ 'attachments.fileType': 1 });

// Virtuals
messageSchema.virtual('conversationId').get(function() {
  return [this.sender, this.recipient].sort().join('_');
});

messageSchema.virtual('type').get(function() {
  return this.attachments?.length ? 'media' : 'text';
});

// Pre-save validation
messageSchema.pre('save', function(next) {
  if (!this.content && (!this.attachments || this.attachments.length === 0)) {
    throw new Error('Message must contain either content or attachments');
  }
  next();
});

// Static methods
messageSchema.statics.findConversation = async function(user1Id, user2Id, options = {}) {
  const { limit = 50, before } = options;
  
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
    .populate('recipient', 'name profileImages subscription');
};

messageSchema.statics.markAsRead = function(messageIds, userId) {
  return this.updateMany(
    {
      _id: { $in: messageIds },
      recipient: userId
    },
    {
      $set: { 
        isRead: true,
        readAt: new Date(),
        status: 'seen'
      }
    }
  );
};

messageSchema.statics.getUnreadCount = function(userId) {
  return this.countDocuments({
    recipient: userId,
    isRead: false,
    deletedBy: { $ne: userId }
  });
};

const Message = mongoose.model('Message', messageSchema);

module.exports = Message;