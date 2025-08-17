const Message = require('../models/Chat');
const User = require('../models/user');
const Photo = require('../models/photo');
const mongoose = require('mongoose');
const { formatDistanceToNow } = require('date-fns');

// Enhanced error handler
const handleError = (error, res) => {
  console.error('Chat Controller Error:', error);
  
  if (error instanceof mongoose.Error.ValidationError) {
    return res.status(400).json({ 
      success: false, 
      message: error.message,
      code: 'VALIDATION_ERROR'
    });
  }

  if (error instanceof mongoose.Error.CastError) {
    return res.status(400).json({ 
      success: false, 
      message: 'Invalid ID format',
      code: 'INVALID_ID'
    });
  }

  return res.status(500).json({ 
    success: false, 
    message: 'Internal server error',
    code: 'SERVER_ERROR',
    error: process.env.NODE_ENV === 'development' ? error : undefined
  });
};

// Format chat response
const formatChatResponse = async (message, currentUser, showAllPhotos = true) => {
  const populated = await Message.populate(message, [
    { path: 'sender', select: 'name profileImages subscription' },
    { path: 'recipient', select: 'name profileImages subscription' }
  ]);

  return {
    _id: populated._id,
    threadId: populated.threadId || populated._id,
    sender: {
      _id: populated.sender._id,
      name: populated.sender.name,
      profileImages: showAllPhotos 
        ? populated.sender.profileImages 
        : [populated.sender.profileImages[0]],
      isSubscribed: populated.sender.subscription?.isActive
    },
    recipient: {
      _id: populated.recipient._id,
      name: populated.recipient.name,
      profileImages: showAllPhotos 
        ? populated.recipient.profileImages 
        : [populated.recipient.profileImages[0]],
      isSubscribed: populated.recipient.subscription?.isActive
    },
    content: populated.content,
    photoContext: populated.photoContext,
    isRead: populated.isRead,
    createdAt: populated.createdAt,
    updatedAt: populated.updatedAt,
    canReply: currentUser.subscription?.isActive
  };
};

// Controller Methods
const getMessages = async (req, res) => {
  try {
    const { recipientId } = req.query;
    const currentUser = req.user;

    if (recipientId) {
      // Get conversation with specific recipient
      const messages = await Message.find({
        $or: [
          { sender: currentUser._id, recipient: recipientId },
          { sender: recipientId, recipient: currentUser._id }
        ],
        deletedBy: { $ne: currentUser._id }
      })
      .sort({ createdAt: 1 })
      .populate('sender', 'name profileImages')
      .populate('recipient', 'name profileImages');

      // Mark as read if recipient
      await Message.updateMany(
        {
          recipient: currentUser._id,
          isRead: false,
          _id: { $in: messages.map(m => m._id) }
        },
        { $set: { isRead: true } }
      );

      // Fixed: Properly handle async operation
      const formattedMessages = await Promise.all(
        messages.map(m => formatChatResponse(m, currentUser, true))
      );

      return res.status(200).json({
        success: true,
        messages: formattedMessages
      });
    }

    // Get all conversations
    const conversations = await Message.aggregate([
      {
        $match: {
          $or: [
            { sender: currentUser._id },
            { recipient: currentUser._id }
          ],
          deletedBy: { $ne: currentUser._id }
        }
      },
      {
        $sort: { createdAt: -1 }
      },
      {
        $group: {
          _id: {
            $cond: [
              { $eq: ["$sender", currentUser._id] },
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
                    { $eq: ["$recipient", currentUser._id] },
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
          as: "user",
          pipeline: [
            {
              $project: {
                name: 1,
                profileImages: 1,
                subscription: 1,
                lastActive: 1
              }
            }
          ]
        }
      },
      {
        $unwind: "$user"
      },
      {
        $project: {
          _id: "$lastMessage._id",
          threadId: "$lastMessage.threadId",
          lastMessage: {
            content: "$lastMessage.content",
            createdAt: "$lastMessage.createdAt",
            isRead: "$lastMessage.isRead",
            photoContext: "$lastMessage.photoContext"
          },
          unreadCount: 1,
          user: {
            _id: "$_id",
            name: "$user.name",
            profileImages: "$user.profileImages",
            subscription: "$user.subscription",
            lastActive: "$user.lastActive"
          }
        }
      }
    ]);

    res.status(200).json({
      success: true,
      conversations: conversations.map(conv => ({
        ...conv,
        canReply: currentUser.subscription?.isActive
      }))
    });

  } catch (error) {
    handleError(error, res);
  }
};

const sendMessage = async (req, res) => {
  try {
    const { recipientId, content } = req.body;
    const currentUser = req.user;

    // ===== START: STRICT SUBSCRIPTION CHECK =====
    if (!currentUser.isSubscribed) {
      return res.status(403).json({
        success: false,
        code: 'SUBSCRIPTION_REQUIRED',
        message: 'Subscribe to send messages (KES 10/24hr)',
        upgradeUrl: '/api/subscribe'
      });
    }
    // ===== END: STRICT SUBSCRIPTION CHECK =====

    if (!content || content.trim() === '') {
      return res.status(400).json({
        success: false,
        message: 'Message content is required',
        code: 'EMPTY_CONTENT'
      });
    }

    // Validate recipient exists
    const recipient = await User.findById(recipientId);
    if (!recipient) {
      return res.status(404).json({
        success: false,
        message: 'Recipient not found',
        code: 'USER_NOT_FOUND'
      });
    }

    // Check for existing conversation thread
    const existingThread = await Message.findOne({
      $or: [
        { sender: currentUser._id, recipient: recipientId },
        { sender: recipientId, recipient: currentUser._id }
      ]
    }).sort({ createdAt: -1 });

    const threadId = existingThread?._id || null;

    // Create new message
    const message = await Message.create({
      sender: currentUser._id,
      recipient: recipientId,
      content: content.trim(),
      threadId: threadId,
      isRead: false
    });

    // Update thread timestamp if this is a reply
    if (threadId) {
      await Message.findByIdAndUpdate(threadId, { updatedAt: new Date() });
    }

    const formattedMessage = await formatChatResponse(message, currentUser, true);

    res.status(201).json({
      success: true,
      message: formattedMessage
    });

  } catch (error) {
    handleError(error, res);
  }
};

const initiateFromPhoto = async (req, res) => {
  try {
    const { photoId, targetUserId } = req.body;
    const currentUser = req.user;

    // ===== START: STRICT SUBSCRIPTION CHECK =====
    if (!currentUser.isSubscribed) {
      return res.status(403).json({
        success: false,
        code: 'SUBSCRIPTION_REQUIRED',
        message: 'Subscribe to initiate chats (KES 10/24hr)',
        upgradeUrl: '/api/subscribe'
      });
    }
    // ===== END: STRICT SUBSCRIPTION CHECK =====

    // Validate photo exists
    const photo = await Photo.findById(photoId)
      .populate('user', 'name gender subscription profileImages');
    
    if (!photo) {
      return res.status(404).json({
        success: false,
        message: 'Photo not found',
        code: 'PHOTO_NOT_FOUND'
      });
    }

    // Validate target user exists
    const targetUser = await User.findById(targetUserId);
    if (!targetUser) {
      return res.status(404).json({
        success: false,
        message: 'User not found',
        code: 'USER_NOT_FOUND'
      });
    }

    // Prevent self-chatting
    if (targetUserId === currentUser._id.toString()) {
      return res.status(400).json({
        success: false,
        message: 'Cannot chat with yourself',
        code: 'SELF_CHAT'
      });
    }

    // Check for existing conversation
    const existingChat = await Message.findOne({
      $or: [
        { sender: currentUser._id, recipient: targetUserId },
        { sender: targetUserId, recipient: currentUser._id }
      ]
    }).sort({ createdAt: -1 });

    if (existingChat) {
      const formattedChat = await formatChatResponse(existingChat, currentUser, true);
      return res.status(200).json({
        success: true,
        message: 'Existing conversation found',
        chat: formattedChat
      });
    }

    // Create new conversation
    const newMessage = await Message.create({
      sender: currentUser._id,
      recipient: targetUserId,
      content: `Hi! I saw your photo and wanted to connect.`,
      photoContext: photoId,
      isRead: false
    });

    // Notify recipient
    await User.findByIdAndUpdate(targetUserId, {
      $push: {
        notifications: {
          type: 'new_chat',
          from: currentUser._id,
          message: `${currentUser.name} started a chat about your photo`,
          data: {
            messageId: newMessage._id,
            photoId: photoId
          },
          createdAt: new Date()
        }
      }
    });

    const formattedNewMessage = await formatChatResponse(newMessage, currentUser, true);

    res.status(201).json({
      success: true,
      message: 'Conversation started',
      chat: formattedNewMessage
    });

  } catch (error) {
    handleError(error, res);
  }
};

const getUnreadMessages = async (req, res) => {
  try {
    const currentUser = req.user;
    const unread = await Message.find({
      recipient: currentUser._id,
      isRead: false,
      deletedBy: { $ne: currentUser._id }
    })
    .populate('sender', 'name profileImages subscription');

    const formattedMessages = await Promise.all(
      unread.map(m => formatChatResponse(m, currentUser, true))
    );

    res.status(200).json({
      success: true,
      count: unread.length,
      messages: formattedMessages
    });

  } catch (error) {
    handleError(error, res);
  }
};

const markMessageAsRead = async (req, res) => {
  try {
    const { messageId } = req.params;
    const currentUser = req.user;

    const message = await Message.findOneAndUpdate(
      {
        _id: messageId,
        recipient: currentUser._id,
        isRead: false
      },
      { isRead: true },
      { new: true }
    );

    if (!message) {
      return res.status(404).json({
        success: false,
        message: 'Message not found or already read',
        code: 'MESSAGE_NOT_FOUND'
      });
    }

    const formattedMessage = await formatChatResponse(message, currentUser, true);

    res.status(200).json({
      success: true,
      message: 'Message marked as read',
      updatedMessage: formattedMessage
    });

  } catch (error) {
    handleError(error, res);
  }
};

const updateMessage = async (req, res) => {
  try {
    const { messageId } = req.params;
    const { content } = req.body;
    const currentUser = req.user;

    // ===== START: STRICT SUBSCRIPTION CHECK =====
    if (!currentUser.isSubscribed) {
      return res.status(403).json({
        success: false,
        code: 'SUBSCRIPTION_REQUIRED',
        message: 'Subscribe to edit messages (KES 10/24hr)',
        upgradeUrl: '/api/subscribe'
      });
    }
    // ===== END: STRICT SUBSCRIPTION CHECK =====

    // Check if message can be edited (within 5 minutes)
    const message = await Message.findOne({
      _id: messageId,
      sender: currentUser._id,
      createdAt: { $gt: new Date(Date.now() - 5 * 60 * 1000) },
      deletedBy: { $ne: currentUser._id }
    });

    if (!message) {
      return res.status(400).json({
        success: false,
        message: 'Message cannot be edited (either not found, edit window expired, or deleted)',
        code: 'EDIT_FAILED'
      });
    }

    message.content = content;
    message.updatedAt = new Date();
    await message.save();

    const formattedMessage = await formatChatResponse(message, currentUser, true);

    res.status(200).json({
      success: true,
      message: formattedMessage
    });

  } catch (error) {
    handleError(error, res);
  }
};

const deleteMessage = async (req, res) => {
  try {
    const { messageId } = req.params;
    const currentUser = req.user;

    const result = await Message.updateOne(
      {
        _id: messageId,
        $or: [
          { sender: currentUser._id },
          { recipient: currentUser._id }
        ],
        deletedBy: { $ne: currentUser._id }
      },
      { $addToSet: { deletedBy: currentUser._id } }
    );

    if (result.modifiedCount === 0) {
      return res.status(404).json({
        success: false,
        message: 'Message not found or already deleted',
        code: 'DELETE_FAILED'
      });
    }

    res.status(200).json({
      success: true,
      message: 'Message deleted'
    });

  } catch (error) {
    handleError(error, res);
  }
};

const deleteChatHistory = async (req, res) => {
  try {
    const { userId } = req.query;
    const currentUser = req.user;

    const result = await Message.updateMany(
      {
        $or: [
          { sender: currentUser._id, recipient: userId },
          { sender: userId, recipient: currentUser._id }
        ],
        deletedBy: { $ne: currentUser._id }
      },
      { $addToSet: { deletedBy: currentUser._id } }
    );

    res.status(200).json({
      success: true,
      message: 'Conversation deleted',
      deletedCount: result.modifiedCount
    });

  } catch (error) {
    handleError(error, res);
  }
};

module.exports = {
  getMessages,
  sendMessage,
  initiateFromPhoto,
  getUnreadMessages,
  markMessageAsRead,
  updateMessage,
  deleteMessage,
  deleteChatHistory
};