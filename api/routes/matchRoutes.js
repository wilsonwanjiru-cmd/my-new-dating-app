const express = require("express");
const router = express.Router();
const matchController = require("../controllers/matchController");

// Send a like to another user
router.post("/send-like", matchController.sendLike);

// Create a match between two users
router.post("/create-match", matchController.createMatch);

// Get all matches for a specific user
router.get("/users/:userId/matches", matchController.getMatches);

// Get all users who liked the current user (crushes)
router.get("/users/:userId/crushes", matchController.getCrushes);

// Unmatch two users
router.post("/unmatch", matchController.unmatch);

module.exports = router;