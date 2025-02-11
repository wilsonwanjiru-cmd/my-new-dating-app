const User = require("../models/user");

// Send a like to another user
const sendLike = async (req, res) => {
  try {
    const { currentUserId, selectedUserId } = req.body;

    // Check if both users exist
    const currentUser = await User.findById(currentUserId);
    const selectedUser = await User.findById(selectedUserId);

    if (!currentUser || !selectedUser) {
      return res.status(404).json({ message: "User not found" });
    }

    // Add the selected user to the current user's crushes list
    if (!currentUser.crushes.includes(selectedUserId)) {
      currentUser.crushes.push(selectedUserId);
      await currentUser.save();
    }

    // Check if the selected user also likes the current user (i.e., a match)
    if (selectedUser.crushes.includes(currentUserId)) {
      return res.status(200).json({ message: "It's a match!" });
    }

    res.status(200).json({ message: "Like sent successfully" });
  } catch (error) {
    console.error("Error sending like:", error);
    res.status(500).json({ message: "Server error" });
  }
};

// Create a match between two users
const createMatch = async (req, res) => {
  try {
    const { currentUserId, selectedUserId } = req.body;

    if (!currentUserId || !selectedUserId) {
      return res.status(400).json({ message: "Both user IDs are required" });
    }

    // Update selected user's matches and crushes
    await User.findByIdAndUpdate(selectedUserId, {
      $addToSet: { matches: currentUserId },
      $pull: { crushes: currentUserId },
    });

    // Update current user's matches and receivedLikes
    await User.findByIdAndUpdate(currentUserId, {
      $addToSet: { matches: selectedUserId },
      $pull: { receivedLikes: selectedUserId },
    });

    res.status(200).json({ message: "Match created successfully" });
  } catch (error) {
    console.error("Error creating a match:", error);
    res.status(500).json({ message: "Error creating a match", error });
  }
};

// Get all matches for a user
const getMatches = async (req, res) => {
  try {
    const { userId } = req.params;

    if (!userId) {
      return res.status(400).json({ message: "User ID is required" });
    }

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    const matches = await User.find({ _id: { $in: user.matches } }).select(
      "_id name email"
    );

    res.status(200).json({ matches });
  } catch (error) {
    console.error("Error retrieving matches:", error);
    res.status(500).json({ message: "Error retrieving the matches", error });
  }
};

// Get all users who liked the current user (crushes)
const getCrushes = async (req, res) => {
  try {
    const { userId } = req.params;

    if (!userId) {
      return res.status(400).json({ message: "User ID is required" });
    }

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    const crushes = await User.find({ _id: { $in: user.crushes } }).select(
      "_id name email"
    );

    res.status(200).json({ crushes });
  } catch (error) {
    console.error("Error retrieving crushes:", error);
    res.status(500).json({ message: "Error retrieving the crushes", error });
  }
};

// Unmatch two users
const unmatch = async (req, res) => {
  try {
    const { currentUserId, selectedUserId } = req.body;

    if (!currentUserId || !selectedUserId) {
      return res.status(400).json({ message: "Both user IDs are required" });
    }

    // Remove the selectedUserId from the matches array of both users
    await User.findByIdAndUpdate(selectedUserId, {
      $pull: { matches: currentUserId },
    });

    await User.findByIdAndUpdate(currentUserId, {
      $pull: { matches: selectedUserId },
    });

    res.status(200).json({ message: "Match removed successfully" });
  } catch (error) {
    console.error("Error removing match:", error);
    res.status(500).json({ message: "Error removing match", error });
  }
};

module.exports = {
  sendLike,
  createMatch,
  getMatches,
  getCrushes,
  unmatch,
};