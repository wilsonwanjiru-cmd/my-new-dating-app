const express = require("express");
const router = express.Router();
const {
  sendMessage,
  getMessages,
  deleteMessage,
  updateMessage,
  markMessageAsRead,
  getUnreadMessages,
  deleteChatHistory,
} = require("../controllers/chatController");

// Get chat messages between two users
router.get("/messages", getMessages);

// Send a new message
router.post("/messages", sendMessage);

// Delete a specific message by ID
router.delete("/messages/:messageId", deleteMessage);

// Update a message
router.put("/messages/:messageId", updateMessage);

// Mark a message as read
router.patch("/messages/:messageId/read", markMessageAsRead);

// Fetch unread messages for a user
router.get("/messages/unread", getUnreadMessages);

// Delete all messages between two users
router.delete("/messages", deleteChatHistory);

module.exports = router;
