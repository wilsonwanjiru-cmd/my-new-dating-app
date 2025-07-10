const express = require("express");
const router = express.Router();
const path = require("path");
const ValidateRequest = require("../middlewares/validateRequest");

// Enhanced controller loader with verification and caching
const loadController = (controllerName) => {
  const controllerPath = path.resolve(__dirname, `../controllers/${controllerName}`);
  try {
    delete require.cache[require.resolve(controllerPath)];
    const controller = require(controllerPath);
    const methods = Object.getOwnPropertyNames(Object.getPrototypeOf(controller))
      .filter(key => key !== 'constructor' && typeof controller[key] === 'function');
    if (!methods.length) throw new Error(`No valid methods found in ${controllerName}`);
    console.log(`✅ ${controllerName} methods verified:`, methods);
    return controller;
  } catch (error) {
    console.error(`❌ Critical error loading ${controllerName}:`, error.message);
    throw error;
  }
};

// Load controllers
let UserController, MatchController;
try {
  UserController = loadController("userController");
  MatchController = loadController("matchController");
} catch (error) {
  process.exit(1);
}

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

// ========== User Profile ==========
router.get("/:userId",
  ...createRoute(
    verifyMethod(UserController, 'fetchUserDetails'),
    ValidateRequest.validateObjectId
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
    ValidateRequest.validateObjectId,
    ValidateRequest.validateDescriptionUpdate
  )
);

// ========== Profile Management ==========
const profileRoutes = express.Router({ mergeParams: true });

profileRoutes.put("/gender",
  ...createRoute(
    verifyMethod(UserController, 'updateGender'),
    ValidateRequest.validateGenderUpdate
  )
);

profileRoutes.put("/profile-images",
  ...createRoute(
    verifyMethod(UserController, 'updateUserProfileImages'),
    ValidateRequest.validateProfileImages
  )
);

profileRoutes.post("/profile-images",
  ...createRoute(
    verifyMethod(UserController, 'addProfileImage'),
    ValidateRequest.validateProfileImages
  )
);

// ========== Preferences ==========
const preferenceRoutes = express.Router({ mergeParams: true });

preferenceRoutes.put("/",
  ...createRoute(
    verifyMethod(UserController, 'updateUserPreferences'),
    ValidateRequest.validateUserPreferences
  )
);

preferenceRoutes.put("/turn-ons/add",
  ...createRoute(
    verifyMethod(UserController, 'addTurnOn'),
    ValidateRequest.validateTurnOnInput
  )
);

preferenceRoutes.put("/turn-ons/remove",
  ...createRoute(
    verifyMethod(UserController, 'removeTurnOn'),
    ValidateRequest.validateTurnOnInput
  )
);

// ========== Match Features ==========
const matchRoutes = express.Router({ mergeParams: true });

matchRoutes.put("/crush",
  ...createRoute(
    verifyMethod(UserController, 'addCrush'),
    ValidateRequest.validateCrushId
  )
);

matchRoutes.delete("/crush",
  ...createRoute(
    verifyMethod(UserController, 'removeCrush'),
    ValidateRequest.validateCrushId
  )
);

matchRoutes.get("/matches",
  ...createRoute(
    verifyMethod(MatchController, 'getMatches')
  )
);

matchRoutes.get("/crushes",
  ...createRoute(
    verifyMethod(MatchController, 'getCrushes')
  )
);

// ========== Nested Routes Mount ==========
router.use("/:userId",
  ValidateRequest.validateObjectId,
  profileRoutes,
  preferenceRoutes,
  matchRoutes
);

// ========== Global Match Routes ==========
router.post("/match",
  ...createRoute(
    verifyMethod(MatchController, 'createMatch'),
    ValidateRequest.validateBodyObjectId(['userAId', 'userBId']) // example usage
  )
);

router.post("/unmatch",
  ...createRoute(
    verifyMethod(MatchController, 'unmatch'),
    ValidateRequest.validateBodyObjectId(['userAId', 'userBId']) // example usage
  )
);

// ========== Account ==========
router.delete("/:userId",
  ...createRoute(
    verifyMethod(UserController, 'deleteUserAccount'),
    ValidateRequest.validateObjectId
  )
);

// ========== Error Middleware ==========
router.use((err, req, res, next) => {
  console.error('❌ Route error:', err.message);
  res.status(500).json({
    success: false,
    error: 'Internal server error',
    details: process.env.NODE_ENV === 'development' ? err.message : undefined
  });
});

module.exports = router;
