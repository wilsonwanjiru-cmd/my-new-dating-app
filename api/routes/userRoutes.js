const express = require("express");
const router = express.Router();
const {
  updateGender,
  updateDescription,
  fetchUserDetails,
  updateUserProfileImages,
  addCrush,
  removeCrush,
  updateUserPreferences,
  deleteUserAccount,
  addProfileImage,
  addTurnOn,
  removeTurnOn,
  addLookingFor,
  removeLookingFor,
  getReceivedLikesDetails,
} = require("../controllers/userController");

const matchController = require("../controllers/matchController");

// Input validation middleware
const validateUserId = (req, res, next) => {
  if (!req.params.userId || !mongoose.Types.ObjectId.isValid(req.params.userId)) {
    return res.status(400).json({ success: false, message: "Invalid user ID" });
  }
  next();
};

// Route definitions
router.route("/:userId/gender")
  .put(validateUserId, updateGender);

router.route("/:userId/description")
  .put(validateUserId, updateDescription);

router.route("/:userId")
  .get(validateUserId, fetchUserDetails)
  .delete(validateUserId, deleteUserAccount);

router.route("/:userId/profile-images")
  .put(validateUserId, updateUserProfileImages)
  .post(validateUserId, addProfileImage);

router.route("/:userId/crush")
  .put(validateUserId, addCrush)
  .delete(validateUserId, removeCrush);

router.route("/:userId/preferences")
  .put(validateUserId, updateUserPreferences);

router.route("/:userId/turn-ons/add")
  .put(validateUserId, addTurnOn);

router.route("/:userId/turn-ons/remove")
  .put(validateUserId, removeTurnOn);

router.route("/:userId/looking-for")
  .put(validateUserId, addLookingFor);

router.route("/:userId/looking-for/remove")
  .put(validateUserId, removeLookingFor);

router.route("/received-likes/:userId/details")
  .get(validateUserId, getReceivedLikesDetails);

// Match-related routes
router.route("/match")
  .post(matchController.createMatch);

router.route("/:userId/matches")
  .get(validateUserId, matchController.getMatches);

router.route("/:userId/crushes")
  .get(validateUserId, matchController.getCrushes);

router.route("/unmatch")
  .post(matchController.unmatch);

module.exports = router;
