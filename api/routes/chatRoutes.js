const express = require("express");
const router = express.Router();
const chatController = require("../controllers/chatController");
const { authenticate } = require("../middlewares/authMiddleware");
const { checkSubscription } = require("../middlewares/subscriptionMiddleware");

// Apply authentication middleware to all chat routes
router.use(authenticate);

// Apply subscription check middleware
router.use(checkSubscription);

/**
 * @swagger
 * tags:
 *   name: Chat
 *   description: User messaging endpoints
 */

/**
 * @swagger
 * /api/chat:
 *   get:
 *     summary: Get chat messages between users
 *     tags: [Chat]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: recipientId
 *         schema:
 *           type: string
 *         required: true
 *         description: ID of the other user
 *     responses:
 *       200:
 *         description: List of messages
 *       403:
 *         description: Subscription required
 */
router.get("/", chatController.getMessages);

/**
 * @swagger
 * /api/chat:
 *   post:
 *     summary: Send a new message
 *     tags: [Chat]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - recipientId
 *               - content
 *             properties:
 *               recipientId:
 *                 type: string
 *               content:
 *                 type: string
 *     responses:
 *       201:
 *         description: Message sent successfully
 *       403:
 *         description: Subscription required to send messages
 */
router.post("/", 
  // Restrict to paid users only
  (req, res, next) => {
    if (!req.hasActiveSubscription) {
      return res.status(403).json({
        success: false,
        message: "Please subscribe for KES 10 to send messages",
        upgradeRequired: true
      });
    }
    next();
  },
  chatController.sendMessage
);

/**
 * @swagger
 * /api/chat/{messageId}:
 *   delete:
 *     summary: Delete a specific message
 *     tags: [Chat]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: messageId
 *         schema:
 *           type: string
 *         required: true
 *     responses:
 *       200:
 *         description: Message deleted
 *       404:
 *         description: Message not found
 */
router.delete("/:messageId", chatController.deleteMessage);

/**
 * @swagger
 * /api/chat/{messageId}:
 *   put:
 *     summary: Update a message
 *     tags: [Chat]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: messageId
 *         schema:
 *           type: string
 *         required: true
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               content:
 *                 type: string
 *     responses:
 *       200:
 *         description: Message updated
 *       403:
 *         description: Can only update your own messages
 */
router.put("/:messageId", chatController.updateMessage);

/**
 * @swagger
 * /api/chat/{messageId}/read:
 *   patch:
 *     summary: Mark message as read
 *     tags: [Chat]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: messageId
 *         schema:
 *           type: string
 *         required: true
 *     responses:
 *       200:
 *         description: Message marked as read
 *       404:
 *         description: Message not found
 */
router.patch("/:messageId/read", chatController.markMessageAsRead);

/**
 * @swagger
 * /api/chat/unread:
 *   get:
 *     summary: Get unread messages
 *     tags: [Chat]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: List of unread messages
 */
router.get("/unread", chatController.getUnreadMessages);

/**
 * @swagger
 * /api/chat/history:
 *   delete:
 *     summary: Delete chat history with a user
 *     tags: [Chat]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: userId
 *         schema:
 *           type: string
 *         required: true
 *     responses:
 *       200:
 *         description: Chat history deleted
 */
router.delete("/history", chatController.deleteChatHistory);

module.exports = router;