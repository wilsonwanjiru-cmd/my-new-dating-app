const express = require("express");
const router = express.Router();
const messageController = require("../controllers/messageController");
const { verifySubscription } = require("../middlewares/subscriptionMiddleware");

// Get chat messages between two users
router.get("/messages", messageController.getMessages);

// Send a new message (restricted to subscribed users)
router.post("/messages", verifySubscription, messageController.sendMessage);

// Delete a specific message by ID
router.delete("/messages/:messageId", messageController.deleteMessage);

// Update a message
router.put("/messages/:messageId", messageController.updateMessage);

// Mark a message as read
router.patch("/messages/:messageId/read", messageController.markMessageAsRead);

// Fetch unread messages for a user
router.get("/messages/unread", messageController.getUnreadMessages);

// Delete all messages between two users
router.delete("/messages", messageController.deleteChatHistory);

module.exports = router; // Export the router
