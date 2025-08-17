const express = require('express');
const router = express.Router();
const notificationController = require('../controllers/notificationController');
const { authenticate } = require('../middlewares/authMiddleware');
const ValidateRequest = require('../middlewares/validateRequest');

/**
 * @swagger
 * tags:
 *   name: Notifications
 *   description: User notification management
 */

// ================== SAFETY CHECK ==================
if (!notificationController) {
  throw new Error("❌ notificationController is missing or not exported properly.");
}

// Verify ValidateRequest middleware
if (!ValidateRequest || !ValidateRequest.validateObjectIdParam) {
  throw new Error("❌ ValidateRequest middleware is missing required validation functions");
}

// Destructure controller methods for validation
const {
  getNotifications,
  markAllAsRead,
  markSingleAsRead,
  getUnreadCount,
  deleteNotification
} = notificationController;

if (!getNotifications || !markAllAsRead || !markSingleAsRead || !getUnreadCount || !deleteNotification) {
  throw new Error("❌ One or more methods are missing in notificationController. Verify exports in notificationController.js");
}

// ================== GLOBAL MIDDLEWARE ==================
router.use(authenticate); // Require authentication for all notification routes

// ================== ROUTES ==================

/**
 * @swagger
 * /api/notifications:
 *   get:
 *     summary: Get all user notifications
 */
router.get('/', getNotifications);

/**
 * @swagger
 * /api/notifications/read:
 *   put:
 *     summary: Mark all notifications as read
 */
router.put('/read', markAllAsRead);

/**
 * @swagger
 * /api/notifications/{notificationId}/read:
 *   put:
 *     summary: Mark a single notification as read
 */
router.put('/:notificationId/read', ValidateRequest.validateObjectIdParam('notificationId'), markSingleAsRead);

/**
 * @swagger
 * /api/notifications/unread-count:
 *   get:
 *     summary: Get count of unread notifications
 */
router.get('/unread-count', getUnreadCount);

/**
 * @swagger
 * /api/notifications/{notificationId}:
 *   delete:
 *     summary: Delete a notification
 */
router.delete('/:notificationId', ValidateRequest.validateObjectIdParam('notificationId'), deleteNotification);

// ================== 404 FALLBACK ==================
router.use((req, res) => {
  res.status(404).json({
    success: false,
    message: "Notification endpoint not found",
    path: req.path,
    suggestion: "Check API documentation for available notification endpoints"
  });
});

// ================== ERROR HANDLER ==================
router.use((err, req, res, next) => {
  console.error("NotificationRoutes Error:", err);
  res.status(500).json({
    success: false,
    message: "Internal server error in Notification Routes",
    error: process.env.NODE_ENV === "development" ? err.message : undefined
  });
});

// ================== ROUTE LOGGER ==================
console.log("\n✅ Registered Notification Routes:");
router.stack.forEach(layer => {
  if (layer.route && layer.route.path) {
    const methods = Object.keys(layer.route.methods)
      .map(m => m.toUpperCase())
      .join(", ");
    console.log(`  ${methods.padEnd(6)} ${layer.route.path}`);
  }
});
console.log("");

module.exports = router;
