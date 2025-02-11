const express = require("express");
const {
  updateGender,
  updateDescription,
  fetchUserDetails,
  updateUserProfileImages,
  addCrush,
  removeCrush,
  verifyUserEmail,
  updateUserPreferences,
  deleteUserAccount,
  addProfileImage,
  addTurnOn,
  removeTurnOn,
  addLookingFor,
  removeLookingFor,
} = require("../controllers/userController");

const matchController = require("../controllers/matchController");

const router = express.Router();

// Update User Gender
router.put("/:userId/gender", updateGender);

// Update User Description
router.put("/:userId/description", updateDescription);

// Fetch User Details
router.get("/:userId", fetchUserDetails);

// Update User Profile Images
router.put("/:userId/profile-images", updateUserProfileImages);

// Add Profile Image
router.post("/:userId/profile-images", addProfileImage);

// Add Crush to User's Crush List
router.put("/:userId/crush", addCrush);

// Remove Crush from User's Crush List
router.delete("/:userId/crush", removeCrush);

// Verify User Email
router.get("/:verificationToken/verify", verifyUserEmail);

// Update User Preferences (Turn Ons, Looking For)
router.put("/:userId/preferences", updateUserPreferences);

// Add Turn-On
router.put("/:userId/turn-ons/add", addTurnOn);

// Remove Turn-On
router.put("/:userId/turn-ons/remove", removeTurnOn);

// Add Looking-For
router.put("/:userId/looking-for", addLookingFor);

// Remove Looking-For
router.put("/:userId/looking-for/remove", removeLookingFor);

// Delete User Account
router.delete("/:userId", deleteUserAccount);

// Match Routes
router.post("/match", matchController.createMatch); // Create a Match
router.get("/:userId/matches", matchController.getMatches); // Get User Matches
router.get("/:userId/crushes", matchController.getCrushes); // Get User Crushes
router.post("/unmatch", matchController.unmatch); // Unmatch Users

module.exports = router;