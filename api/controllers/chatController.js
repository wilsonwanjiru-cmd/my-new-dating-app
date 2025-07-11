const Message = require('../models/Chat');
const User = require('../models/user');
const mongoose = require('mongoose');
const { formatDistanceToNow } = require('date-fns');

// Centralized error handler
const handleError = (error, res) => {
  console.error('Chat Controller Error:', error);
  
  if (error instanceof mongoose.Error.ValidationError) {
    return res.status(400).json({ 
      success: false, 
      message: error.message 
    });
  }

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

// Get all messages between current user and others
exports.getMessages = async (req, res) => {
  try {
    const { recipientId } = req.query;
    const currentUserId = req.user._id;

    // If recipientId is provided, get conversation between two users
    if (recipientId) {
      if (!mongoose.Types.ObjectId.isValid(recipientId)) {
        return res.status(400).json({
          success: false,
          message: 'Invalid recipient ID'
        });
      }

      // Check if recipient exists
      const recipient = await User.findById(recipientId);
      if (!recipient) {
        return res.status(404).json({
          success: false,
          message: 'Recipient not found'
        });
      }

      const messages = await Message.find({
        $or: [
          { sender: currentUserId, recipient: recipientId },
          { sender: recipientId, recipient: currentUserId }
        ]
      })
      .sort({ createdAt: -1 })
      .populate('sender', 'name profileImages')
      .populate('recipient', 'name profileImages');

      // Mark messages as read if they're being viewed by recipient
      await Message.updateMany(
        {
          recipient: currentUserId,
          sender: recipientId,
          isRead: false
        },
        { $set: { isRead: true } }
      );

      return res.status(200).json({
        success: true,
        data: messages,
        recipientInfo: {
          name: recipient.name,
          profileImages: req.user.hasActiveSubscription 
            ? recipient.profileImages 
            : recipient.profileImages.slice(0, 7),
          canMessage: recipient.subscription?.isActive
        }
      });
    }

    // If no recipientId, get all recent conversations
    const conversations = await Message.aggregate([
      {
        $match: {
          $or: [
            { sender: currentUserId },
            { recipient: currentUserId }
          ]
        }
      },
      {
        $sort: { createdAt: -1 }
      },
      {
        $group: {
          _id: {
            $cond: [
              { $eq: ["$sender", currentUserId] },
              "$recipient",
              "$sender"
            ]
          },
          lastMessage: { $first: "$$ROOT" },
          unreadCount: {
            $sum: {
              $cond: [
                {
                  $and: [
                    { $eq: ["$recipient", currentUserId] },
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
          localField: "_id",
          foreignField: "_id",
          as: "user"
        }
      },
      {
        $unwind: "$user"
      },
      {
        $project: {
          userId: "$_id",
          _id: 0,
          lastMessage: 1,
          unreadCount: 1,
          user: {
            name: 1,
            profileImages: 1,
            subscription: 1,
            lastActive: 1
          }
        }
      }
    ]);

    // Process profile images based on subscription
    const processedConversations = conversations.map(conv => {
      const canViewAll = req.user.hasActiveSubscription;
      return {
        ...conv,
        user: {
          ...conv.user,
          profileImages: canViewAll 
            ? conv.user.profileImages 
            : conv.user.profileImages.slice(0, 7)
        }
      };
    });

    res.status(200).json({
      success: true,
      data: processedConversations
    });

  } catch (error) {
    handleError(error, res);
  }
};

// Send a new message
exports.sendMessage = async (req, res) => {
  try {
    const { recipientId, content } = req.body;
    const senderId = req.user._id;

    // Validate input
    if (!mongoose.Types.ObjectId.isValid(recipientId)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid recipient ID'
      });
    }

    if (!content || content.trim() === '') {
      return res.status(400).json({
        success: false,
        message: 'Message content is required'
      });
    }

    // Check if recipient exists
    const recipient = await User.findById(recipientId);
    if (!recipient) {
      return res.status(404).json({
        success: false,
        message: 'Recipient not found'
      });
    }

    // Check subscription status for sender
    if (!req.user.hasActiveSubscription) {
      return res.status(403).json({
        success: false,
        message: 'Please subscribe for KES 10 to send messages',
        upgradeRequired: true
      });
    }

    // Create the message
    const message = await Message.create({
      sender: senderId,
      recipient: recipientId,
      content: content.trim(),
      requiresSubscription: !recipient.subscription?.isActive
    });

    // Populate sender/recipient info
    const populatedMessage = await Message.populate(message, [
      { path: 'sender', select: 'name profileImages' },
      { path: 'recipient', select: 'name profileImages' }
    ]);

    // Notify recipient if they haven't paid
    if (!recipient.subscription?.isActive) {
      await User.findByIdAndUpdate(recipientId, {
        $push: { 
          notifications: {
            type: 'new_message',
            from: senderId,
            message: `${req.user.name} sent you a message`,
            data: { 
              messageId: message._id,
              requiresSubscription: true
            },
            createdAt: new Date()
          }
        },
        $set: { lastActive: new Date() }
      });
    }

    res.status(201).json({
      success: true,
      message: populatedMessage,
      recipientCanReply: recipient.subscription?.isActive || false
    });

  } catch (error) {
    handleError(error, res);
  }
};

// Delete a specific message
exports.deleteMessage = async (req, res) => {
  try {
    const { messageId } = req.params;
    const userId = req.user._id;

    if (!mongoose.Types.ObjectId.isValid(messageId)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid message ID'
      });
    }

    const message = await Message.findOne({
      _id: messageId,
      $or: [
        { sender: userId },
        { recipient: userId }
      ]
    });

    if (!message) {
      return res.status(404).json({
        success: false,
        message: 'Message not found or unauthorized'
      });
    }

    // Soft delete by adding user to deletedBy array
    if (!message.deletedBy.includes(userId)) {
      message.deletedBy.push(userId);
      await message.save();
    }

    res.status(200).json({
      success: true,
      message: 'Message deleted successfully'
    });

  } catch (error) {
    handleError(error, res);
  }
};

// Update a message
exports.updateMessage = async (req, res) => {
  try {
    const { messageId } = req.params;
    const { content } = req.body;
    const userId = req.user._id;

    if (!mongoose.Types.ObjectId.isValid(messageId)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid message ID'
      });
    }

    if (!content || content.trim() === '') {
      return res.status(400).json({
        success: false,
        message: 'Message content is required'
      });
    }

    const message = await Message.findOneAndUpdate(
      {
        _id: messageId,
        sender: userId,
        createdAt: { $gt: new Date(Date.now() - 5 * 60 * 1000) } // Only allow edits within 5 minutes
      },
      { 
        content: content.trim(),
        edited: true 
      },
      { new: true }
    );

    if (!message) {
      return res.status(404).json({
        success: false,
        message: 'Message not found, unauthorized, or edit window expired'
      });
    }

    res.status(200).json({
      success: true,
      message: await Message.populate(message, [
        { path: 'sender', select: 'name profileImages' },
        { path: 'recipient', select: 'name profileImages' }
      ])
    });

  } catch (error) {
    handleError(error, res);
  }
};

// Mark message as read
exports.markMessageAsRead = async (req, res) => {
  try {
    const { messageId } = req.params;
    const userId = req.user._id;

    if (!mongoose.Types.ObjectId.isValid(messageId)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid message ID'
      });
    }

    const message = await Message.findOneAndUpdate(
      {
        _id: messageId,
        recipient: userId,
        isRead: false
      },
      { $set: { isRead: true } },
      { new: true }
    );

    if (!message) {
      return res.status(404).json({
        success: false,
        message: 'Message not found or already read'
      });
    }

    res.status(200).json({
      success: true,
      message: 'Message marked as read'
    });

  } catch (error) {
    handleError(error, res);
  }
};

// Get unread messages
exports.getUnreadMessages = async (req, res) => {
  try {
    const userId = req.user._id;

    const messages = await Message.find({
      recipient: userId,
      isRead: false
    })
    .sort({ createdAt: -1 })
    .populate('sender', 'name profileImages');

    res.status(200).json({
      success: true,
      count: messages.length,
      messages
    });

  } catch (error) {
    handleError(error, res);
  }
};

// Delete chat history with a user
exports.deleteChatHistory = async (req, res) => {
  try {
    const { userId } = req.query;
    const currentUserId = req.user._id;

    if (!mongoose.Types.ObjectId.isValid(userId)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid user ID'
      });
    }

    // Mark all messages as deleted by current user
    await Message.updateMany(
      {
        $or: [
          { sender: currentUserId, recipient: userId },
          { sender: userId, recipient: currentUserId }
        ],
        deletedBy: { $ne: currentUserId }
      },
      {
        $push: { deletedBy: currentUserId }
      }
    );

    res.status(200).json({
      success: true,
      message: 'Chat history deleted successfully'
    });

  } catch (error) {
    handleError(error, res);
  }
};