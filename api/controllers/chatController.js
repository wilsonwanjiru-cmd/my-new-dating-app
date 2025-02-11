const mongoose = require("mongoose");
const Chat = require("../models/Chat");
const User = require("../models/user");

// Send a message to a user
const sendMessage = async (req, res) => {
  const { senderId, receiverId, message } = req.body;

  try {
    // Verify if the sender has an active subscription
    const sender = await User.findById(senderId);

    if (!sender || !sender.isSubscribed || new Date() > sender.subscriptionExpires) {
      return res.status(403).json({
        message: "Your subscription has expired or is inactive. Please subscribe to send messages.",
      });
    }

    const newMessage = new Chat({
      senderId: new mongoose.Types.ObjectId(senderId),
      receiverId: new mongoose.Types.ObjectId(receiverId),
      message,
      timestamp: new Date(),
    });

    await newMessage.save();

    res.status(201).json({ message: "Message sent successfully", newMessage });
  } catch (error) {
    console.error("Error sending message:", error);
    res.status(500).json({ message: "Failed to send message", error });
  }
};

// Get messages between two users
const getMessages = async (req, res) => {
  const { senderId, receiverId } = req.query;

  try {
    if (!senderId || !receiverId) {
      return res.status(400).json({ message: "Both senderId and receiverId are required" });
    }

    const senderObjectId = new mongoose.Types.ObjectId(senderId);
    const receiverObjectId = new mongoose.Types.ObjectId(receiverId);

    const messages = await Chat.find({
      $or: [
        { senderId: senderObjectId, receiverId: receiverObjectId },
        { senderId: receiverObjectId, receiverId: senderObjectId },
      ],
    })
      .populate("senderId", "_id name")
      .populate("receiverId", "_id name")
      .sort({ timestamp: 1 }); // Sorting messages by timestamp in ascending order

    res.status(200).json(messages);
  } catch (error) {
    console.error("Error fetching messages:", error);
    res.status(500).json({ message: "Error getting messages", error });
  }
};

// Delete a specific message
const deleteMessage = async (req, res) => {
  const { messageId } = req.params;

  try {
    const message = await Chat.findByIdAndDelete(messageId);
    if (!message) {
      return res.status(404).json({ message: "Message not found" });
    }
    res.status(200).json({ message: "Message deleted successfully" });
  } catch (error) {
    console.error("Error deleting message:", error);
    res.status(500).json({ message: "Error deleting message", error });
  }
};

// Update a specific message
const updateMessage = async (req, res) => {
  const { messageId } = req.params;
  const { newMessageContent } = req.body;

  try {
    const message = await Chat.findById(messageId);
    if (!message) {
      return res.status(404).json({ message: "Message not found" });
    }

    message.message = newMessageContent;
    await message.save();

    res.status(200).json({ message: "Message updated successfully", updatedMessage: message });
  } catch (error) {
    console.error("Error updating message:", error);
    res.status(500).json({ message: "Error updating message", error });
  }
};

// Mark a message as read
const markMessageAsRead = async (req, res) => {
  const { messageId } = req.params;

  try {
    const message = await Chat.findById(messageId);
    if (!message) {
      return res.status(404).json({ message: "Message not found" });
    }

    message.read = true;
    await message.save();

    res.status(200).json({ message: "Message marked as read", updatedMessage: message });
  } catch (error) {
    console.error("Error marking message as read:", error);
    res.status(500).json({ message: "Error marking message as read", error });
  }
};

// Fetch unread messages for a user
const getUnreadMessages = async (req, res) => {
  const { userId } = req.query;

  try {
    const unreadMessages = await Chat.find({
      receiverId: new mongoose.Types.ObjectId(userId),
      read: false,
    }).populate("senderId", "_id name");

    res.status(200).json(unreadMessages);
  } catch (error) {
    console.error("Error fetching unread messages:", error);
    res.status(500).json({ message: "Error getting unread messages", error });
  }
};

// Delete all messages between two users
const deleteChatHistory = async (req, res) => {
  const { senderId, receiverId } = req.body;

  try {
    await Chat.deleteMany({
      $or: [
        { senderId: new mongoose.Types.ObjectId(senderId), receiverId: new mongoose.Types.ObjectId(receiverId) },
        { senderId: new mongoose.Types.ObjectId(receiverId), receiverId: new mongoose.Types.ObjectId(senderId) },
      ],
    });

    res.status(200).json({ message: "Chat history deleted successfully" });
  } catch (error) {
    console.error("Error deleting chat history:", error);
    res.status(500).json({ message: "Failed to delete chat history", error });
  }
};

module.exports = {
  sendMessage,
  getMessages,
  deleteMessage,
  updateMessage,
  markMessageAsRead,
  getUnreadMessages,
  deleteChatHistory,
};
