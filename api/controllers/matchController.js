const mongoose = require('mongoose');
const { ObjectId } = mongoose.Types;
const User = require("../models/user");

// ==================== Controller Methods ====================

/**
 * Get all likes sent by a user
 */
const getUserLikes = async (req, res) => {
  try {
    const { userId } = req.query;

    if (!userId) {
      return res.status(400).json({
        success: false,
        message: "User ID is required"
      });
    }

    if (!ObjectId.isValid(userId)) {
      return res.status(400).json({
        success: false,
        message: "Invalid user ID format"
      });
    }

    const user = await User.findById(userId)
      .select('crushes')
      .populate('crushes', '_id name profilePhoto');

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found"
      });
    }

    res.status(200).json({
      success: true,
      count: user.crushes.length,
      likes: user.crushes
    });

  } catch (error) {
    console.error("Error retrieving user likes:", error);
    res.status(500).json({
      success: false,
      message: "Internal server error",
      error: process.env.NODE_ENV === 'development' ? error : undefined
    });
  }
};

/**
 * Send a like to another user
 */
const sendLike = async (req, res) => {
  try {
    const { currentUserId, selectedUserId } = req.body;

    if (!currentUserId || !selectedUserId) {
      return res.status(400).json({
        success: false,
        message: "Both user IDs are required"
      });
    }

    if (!ObjectId.isValid(currentUserId) || !ObjectId.isValid(selectedUserId)) {
      return res.status(400).json({
        success: false,
        message: "Invalid user ID format"
      });
    }

    const [currentUser, selectedUser] = await Promise.all([
      User.findById(currentUserId).select('crushes'),
      User.findById(selectedUserId).select('crushes')
    ]);

    if (!currentUser || !selectedUser) {
      return res.status(404).json({
        success: false,
        message: "User not found"
      });
    }

    if (!currentUser.crushes.includes(selectedUserId)) {
      await User.findByIdAndUpdate(currentUserId, {
        $addToSet: { crushes: selectedUserId }
      });
    }

    if (selectedUser.crushes.includes(currentUserId)) {
      return res.status(200).json({
        success: true,
        message: "It's a match!",
        isMatch: true
      });
    }

    res.status(200).json({
      success: true,
      message: "Like sent successfully",
      isMatch: false
    });

  } catch (error) {
    console.error("Error sending like:", error);
    res.status(500).json({
      success: false,
      message: "Internal server error",
      error: process.env.NODE_ENV === 'development' ? error : undefined
    });
  }
};

/**
 * Create a match between two users
 */
const createMatch = async (req, res) => {
  try {
    const { currentUserId, selectedUserId } = req.body;

    if (!currentUserId || !selectedUserId) {
      return res.status(400).json({
        success: false,
        message: "Both user IDs are required"
      });
    }

    if (!ObjectId.isValid(currentUserId) || !ObjectId.isValid(selectedUserId)) {
      return res.status(400).json({
        success: false,
        message: "Invalid user ID format"
      });
    }

    const [currentUserExists, selectedUserExists] = await Promise.all([
      User.exists({ _id: currentUserId }),
      User.exists({ _id: selectedUserId })
    ]);

    if (!currentUserExists || !selectedUserExists) {
      return res.status(404).json({
        success: false,
        message: "User not found"
      });
    }

    await Promise.all([
      User.findByIdAndUpdate(selectedUserId, {
        $addToSet: { matches: currentUserId },
        $pull: { crushes: currentUserId }
      }),
      User.findByIdAndUpdate(currentUserId, {
        $addToSet: { matches: selectedUserId },
        $pull: { receivedLikes: selectedUserId }
      })
    ]);

    res.status(200).json({
      success: true,
      message: "Match created successfully"
    });

  } catch (error) {
    console.error("Error creating match:", error);
    res.status(500).json({
      success: false,
      message: "Internal server error",
      error: process.env.NODE_ENV === 'development' ? error : undefined
    });
  }
};

/**
 * Get all matches for a user
 */
const getMatches = async (req, res) => {
  try {
    const { userId } = req.params;

    if (!userId) {
      return res.status(400).json({
        success: false,
        message: "User ID is required"
      });
    }

    if (!ObjectId.isValid(userId)) {
      return res.status(400).json({
        success: false,
        message: "Invalid user ID format"
      });
    }

    const user = await User.findById(userId)
      .select('matches')
      .populate('matches', '_id name profilePhoto');

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found"
      });
    }

    res.status(200).json({
      success: true,
      count: user.matches.length,
      matches: user.matches
    });

  } catch (error) {
    console.error("Error retrieving matches:", error);
    res.status(500).json({
      success: false,
      message: "Internal server error",
      error: process.env.NODE_ENV === 'development' ? error : undefined
    });
  }
};

/**
 * Get all users who liked the current user (crushes)
 */
const getCrushes = async (req, res) => {
  try {
    const { userId } = req.params;
    const cleanUserId = userId?.trim();

    if (!cleanUserId) {
      return res.status(400).json({
        success: false,
        message: "User ID is required"
      });
    }

    if (!ObjectId.isValid(cleanUserId)) {
      return res.status(400).json({
        success: false,
        message: "Invalid user ID format"
      });
    }

    const user = await User.findById(cleanUserId)
      .select('crushes')
      .populate('crushes', '_id name profilePhoto');

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found"
      });
    }

    res.status(200).json({
      success: true,
      count: user.crushes.length,
      crushes: user.crushes
    });

  } catch (error) {
    console.error("Error retrieving crushes:", error);
    if (error.name === 'CastError') {
      return res.status(400).json({
        success: false,
        message: "Invalid user ID format"
      });
    }
    res.status(500).json({
      success: false,
      message: "Internal server error",
      error: process.env.NODE_ENV === 'development' ? error : undefined
    });
  }
};

/**
 * Unmatch two users
 */
const unmatch = async (req, res) => {
  try {
    const { currentUserId, selectedUserId } = req.body;

    if (!currentUserId || !selectedUserId) {
      return res.status(400).json({
        success: false,
        message: "Both user IDs are required"
      });
    }

    if (!ObjectId.isValid(currentUserId) || !ObjectId.isValid(selectedUserId)) {
      return res.status(400).json({
        success: false,
        message: "Invalid user ID format"
      });
    }

    const [currentUserExists, selectedUserExists] = await Promise.all([
      User.exists({ _id: currentUserId }),
      User.exists({ _id: selectedUserId })
    ]);

    if (!currentUserExists || !selectedUserExists) {
      return res.status(404).json({
        success: false,
        message: "User not found"
      });
    }

    await Promise.all([
      User.findByIdAndUpdate(selectedUserId, {
        $pull: { matches: currentUserId }
      }),
      User.findByIdAndUpdate(currentUserId, {
        $pull: { matches: selectedUserId }
      })
    ]);

    res.status(200).json({
      success: true,
      message: "Match removed successfully"
    });

  } catch (error) {
    console.error("Error removing match:", error);
    res.status(500).json({
      success: false,
      message: "Internal server error",
      error: process.env.NODE_ENV === 'development' ? error : undefined
    });
  }
};

// ==================== Exports ====================
module.exports = {
  getUserLikes,
  sendLike,
  createMatch,
  getMatches,
  getCrushes,
  unmatch
};