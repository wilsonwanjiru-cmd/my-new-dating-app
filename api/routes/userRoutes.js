const express = require("express");
const router = express.Router();
const ValidateRequest = require("../middlewares/validateRequest");
const { checkSubscription, restrictFreeUsers } = require("../middlewares/subscriptionMiddleware");
const { authenticate } = require("../middlewares/authMiddleware");

// Import controllers
const UserController = require("../controllers/userController");
const MatchController = require("../controllers/matchController");
const NotificationController = require("../controllers/notificationController");
const PaymentController = require("../controllers/paymentController");

// ========== Debug Middleware ==========
router.use((req, res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.originalUrl}`);
  next();
});

// ========== User Profile ==========
router.get("/:userId",
  authenticate,
  ValidateRequest.validateObjectId,
  checkSubscription,
  UserController.getProfile
);

router.put("/:userId/gender",
  (req, res, next) => {
    console.log(`Gender update request for ${req.params.userId}`);
    next();
  },
  authenticate,
  ValidateRequest.validateObjectId,
  ValidateRequest.validateGenderUpdate,
  UserController.updateGender
);

router.get("/:userId/description",
  authenticate,
  ValidateRequest.validateObjectId,
  UserController.getDescription
);

router.put("/:userId/description",
  authenticate,
  ValidateRequest.validateObjectId,
  ValidateRequest.validateDescriptionUpdate,
  UserController.updateDescription
);

// ========== Profile Images ==========
router.post("/:userId/profile-images",
  authenticate,
  ValidateRequest.validateObjectId,
  checkSubscription,
  restrictFreeUsers('profile image uploads'),
  UserController.addProfileImages
);

// ========== Subscription ==========
router.post("/:userId/subscribe",
  authenticate,
  ValidateRequest.validateObjectId,
  UserController.processSubscription
);

router.get("/:userId/subscription-status",
  authenticate,
  ValidateRequest.validateObjectId,
  UserController.getSubscriptionStatus
);

// ========== Notifications ==========
router.get("/:userId/notifications",
  authenticate,
  ValidateRequest.validateObjectId,
  UserController.getNotifications
);

router.put("/:userId/notifications/read",
  authenticate,
  ValidateRequest.validateObjectId,
  UserController.markNotificationRead
);

// ========== Match ==========
router.post("/:userId/like",
  authenticate,
  ValidateRequest.validateObjectId,
  checkSubscription,
  restrictFreeUsers('liking profiles'),
  UserController.handleLike
);

// ========== Messaging ==========
router.post("/:userId/messages",
  authenticate,
  ValidateRequest.validateObjectId,
  checkSubscription,
  restrictFreeUsers('messaging'),
  UserController.sendMessage
);

router.get("/:userId/messages/:recipientId",
  authenticate,
  ValidateRequest.validateObjectId,
  checkSubscription,
  UserController.getConversation
);

// ========== Preferences ==========
router.put("/preferences",
  authenticate,
  UserController.updatePreferences
);

// ========== Account ==========
router.delete("/:userId",
  authenticate,
  ValidateRequest.validateObjectId,
  UserController.deleteUserAccount
);

// ========== Test Endpoint ==========
router.put("/test-gender", (req, res) => {
  console.log("Test gender endpoint hit");
  res.json({
    success: true,
    message: "Test endpoint working",
    data: req.body
  });
});

// ========== 404 Fallback ==========
router.use((req, res) => {
  res.status(404).json({
    success: false,
    message: "Endpoint not found",
    path: req.originalUrl,
    suggestion: "Check /health for available services"
  });
});

// ========== Error Handler ==========
router.use((err, req, res, next) => {
  console.error("❌ Route error:", err.message);
  res.status(500).json({
    success: false,
    error: "Internal server error",
    details: process.env.NODE_ENV === "development" ? err.message : undefined
  });
});

// ========== Route Logger ==========
console.log("\n✅ Registered User Routes:");
router.stack.forEach(layer => {
  if (layer.route) {
    const methods = Object.keys(layer.route.methods).map(m => m.toUpperCase()).join(', ');
    console.log(`  ${methods.padEnd(6)} ${layer.route.path}`);
  }
});
console.log("");

module.exports = router;