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

// Method validator
const verifyMethod = (controller, methodName) => {
  if (!controller) throw new Error(`Controller is undefined`);
  const fn = controller[methodName];
  if (typeof fn !== 'function') {
    throw new Error(`Controller method "${methodName}" is missing or not a function`);
  }
  return fn;
};

// Route creator
const createRoute = (handler, ...middlewares) => {
  const validated = middlewares.map(mw => {
    if (typeof mw !== 'function') throw new Error(`Invalid middleware: ${mw}`);
    return mw;
  });
  if (typeof handler !== 'function') throw new Error(`Invalid handler: ${typeof handler}`);
  return [...validated, handler];
};

// ========== Debug Middleware ==========
router.use((req, res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.originalUrl}`);
  next();
});

// ========== User Profile ==========
router.get("/:userId",
  ...createRoute(
    verifyMethod(UserController, 'getProfile'),
    ValidateRequest.validateObjectId,
    checkSubscription
  )
);

router.put("/:userId/gender",
  (req, res, next) => {
    console.log(`Gender update request for ${req.params.userId}`);
    next();
  },
  ...createRoute(
    verifyMethod(UserController, 'updateGender'),
    authenticate,
    ValidateRequest.validateObjectId,
    ValidateRequest.validateGenderUpdate
  )
);

router.get("/:userId/description",
  ...createRoute(
    verifyMethod(UserController, 'getDescription'),
    ValidateRequest.validateObjectId
  )
);

router.put("/:userId/description",
  ...createRoute(
    verifyMethod(UserController, 'updateDescription'),
    authenticate,
    ValidateRequest.validateObjectId,
    ValidateRequest.validateDescriptionUpdate
  )
);

// ========== Profile Images ==========
router.post("/:userId/profile-images",
  ...createRoute(
    verifyMethod(UserController, 'addProfileImages'),
    authenticate,
    ValidateRequest.validateObjectId,
    checkSubscription,
    restrictFreeUsers('profile image uploads')
  )
);

// ========== Subscription ==========
router.post("/:userId/subscribe",
  ...createRoute(
    verifyMethod(UserController, 'processSubscription'),
    authenticate,
    ValidateRequest.validateObjectId
  )
);

router.get("/:userId/subscription-status",
  ...createRoute(
    verifyMethod(UserController, 'getSubscriptionStatus'),
    authenticate,
    ValidateRequest.validateObjectId
  )
);

// ========== Notifications ==========
router.get("/:userId/notifications",
  ...createRoute(
    verifyMethod(UserController, 'getNotifications'),
    authenticate,
    ValidateRequest.validateObjectId
  )
);

router.put("/:userId/notifications/read",
  ...createRoute(
    verifyMethod(UserController, 'markNotificationRead'),
    authenticate,
    ValidateRequest.validateObjectId
  )
);

// ========== Match ==========
router.post("/:userId/like",
  ...createRoute(
    verifyMethod(UserController, 'handleLike'),
    authenticate,
    ValidateRequest.validateObjectId,
    checkSubscription,
    restrictFreeUsers('liking profiles')
  )
);

// ========== Messaging ==========
router.post("/:userId/messages",
  ...createRoute(
    verifyMethod(UserController, 'sendMessage'),
    authenticate,
    ValidateRequest.validateObjectId,
    checkSubscription,
    restrictFreeUsers('messaging')
  )
);

router.get("/:userId/messages/:recipientId",
  ...createRoute(
    verifyMethod(UserController, 'getConversation'),
    authenticate,
    ValidateRequest.validateObjectId,
    checkSubscription
  )
);

// ========== Preferences ==========
router.put("/preferences",
  ...createRoute(
    verifyMethod(UserController, 'updatePreferences'),
    authenticate
  )
);

// ========== Account ==========
router.delete("/:userId",
  ...createRoute(
    verifyMethod(UserController, 'deleteUserAccount'),
    authenticate,
    ValidateRequest.validateObjectId
  )
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
