const User = require("../models/user");
const mongoose = require("mongoose");

// Centralized error handler
const handleError = (error, res) => {
  console.error("Controller Error:", error);
  
  if (error.name === "ValidationError") {
    return res.status(400).json({ 
      success: false, 
      message: error.message 
    });
  }

  if (error.name === "CastError") {
    return res.status(400).json({ 
      success: false, 
      message: "Invalid ID format" 
    });
  }

  return res.status(500).json({ 
    success: false, 
    message: "Internal server error",
    error: process.env.NODE_ENV === "development" ? error : undefined
  });
};

// Helper to validate user IDs
const isValidId = (id) => mongoose.Types.ObjectId.isValid(id);

// User Profile Methods
const getDescription = async (req, res) => {
  try {
    if (!isValidId(req.params.userId)) {
      return res.status(400).json({ success: false, message: "Invalid user ID" });
    }

    const user = await User.findById(req.params.userId).select("description");
    if (!user) {
      return res.status(404).json({ success: false, message: "User not found" });
    }

    return res.status(200).json({ 
      success: true, 
      description: user.description || "No description available" 
    });
  } catch (error) {
    return handleError(error, res);
  }
};

const updateDescription = async (req, res) => {
  try {
    if (!isValidId(req.params.userId)) {
      return res.status(400).json({ success: false, message: "Invalid user ID" });
    }

    const user = await User.findByIdAndUpdate(
      req.params.userId,
      { description: req.body.description },
      { new: true, runValidators: true }
    ).select("description");

    if (!user) {
      return res.status(404).json({ success: false, message: "User not found" });
    }

    return res.status(200).json({ 
      success: true, 
      message: "Description updated successfully",
      description: user.description 
    });
  } catch (error) {
    return handleError(error, res);
  }
};

const fetchUserDetails = async (req, res) => {
  try {
    if (!isValidId(req.params.userId)) {
      return res.status(400).json({ success: false, message: "Invalid user ID" });
    }

    const user = await User.findById(req.params.userId)
      .select("-password -__v")
      .populate("crushes", "name profileImages")
      .populate("matches", "name profileImages");

    if (!user) {
      return res.status(404).json({ success: false, message: "User not found" });
    }

    return res.status(200).json({ 
      success: true, 
      user 
    });
  } catch (error) {
    return handleError(error, res);
  }
};

// Profile Management Methods
const updateGender = async (req, res) => {
  try {
    if (!isValidId(req.params.userId)) {
      return res.status(400).json({ success: false, message: "Invalid user ID" });
    }

    const user = await User.findByIdAndUpdate(
      req.params.userId,
      { gender: req.body.gender },
      { new: true, runValidators: true }
    ).select("gender");

    if (!user) {
      return res.status(404).json({ success: false, message: "User not found" });
    }

    return res.status(200).json({ 
      success: true, 
      message: "Gender updated successfully",
      gender: user.gender 
    });
  } catch (error) {
    return handleError(error, res);
  }
};

const updateUserProfileImages = async (req, res) => {
  try {
    if (!isValidId(req.params.userId)) {
      return res.status(400).json({ success: false, message: "Invalid user ID" });
    }

    const user = await User.findByIdAndUpdate(
      req.params.userId,
      { profileImages: req.body.profileImages },
      { new: true }
    ).select("profileImages");

    if (!user) {
      return res.status(404).json({ success: false, message: "User not found" });
    }

    return res.status(200).json({ 
      success: true, 
      message: "Profile images updated successfully",
      profileImages: user.profileImages 
    });
  } catch (error) {
    return handleError(error, res);
  }
};

const addProfileImage = async (req, res) => {
  try {
    if (!isValidId(req.params.userId)) {
      return res.status(400).json({ success: false, message: "Invalid user ID" });
    }

    if (!req.body.imageUrl) {
      return res.status(400).json({ 
        success: false, 
        message: "Image URL is required" 
      });
    }

    const user = await User.findByIdAndUpdate(
      req.params.userId,
      { $push: { profileImages: req.body.imageUrl } },
      { new: true }
    ).select("profileImages");

    if (!user) {
      return res.status(404).json({ success: false, message: "User not found" });
    }

    return res.status(200).json({ 
      success: true, 
      message: "Profile image added successfully",
      profileImages: user.profileImages 
    });
  } catch (error) {
    return handleError(error, res);
  }
};

// Preferences Methods
const updateUserPreferences = async (req, res) => {
  try {
    if (!isValidId(req.params.userId)) {
      return res.status(400).json({ success: false, message: "Invalid user ID" });
    }

    const user = await User.findByIdAndUpdate(
      req.params.userId,
      { preferences: req.body.preferences },
      { new: true, runValidators: true }
    ).select("preferences");

    if (!user) {
      return res.status(404).json({ success: false, message: "User not found" });
    }

    return res.status(200).json({ 
      success: true, 
      message: "Preferences updated successfully",
      preferences: user.preferences 
    });
  } catch (error) {
    return handleError(error, res);
  }
};

const addTurnOn = async (req, res) => {
  try {
    if (!isValidId(req.params.userId)) {
      return res.status(400).json({ success: false, message: "Invalid user ID" });
    }

    const user = await User.findByIdAndUpdate(
      req.params.userId,
      { $addToSet: { turnOns: req.body.turnOn } },
      { new: true }
    ).select("turnOns");

    if (!user) {
      return res.status(404).json({ success: false, message: "User not found" });
    }

    return res.status(200).json({ 
      success: true, 
      message: "Turn-on added successfully",
      turnOns: user.turnOns 
    });
  } catch (error) {
    return handleError(error, res);
  }
};

const removeTurnOn = async (req, res) => {
  try {
    if (!isValidId(req.params.userId)) {
      return res.status(400).json({ success: false, message: "Invalid user ID" });
    }

    const user = await User.findByIdAndUpdate(
      req.params.userId,
      { $pull: { turnOns: req.body.turnOn } },
      { new: true }
    ).select("turnOns");

    if (!user) {
      return res.status(404).json({ success: false, message: "User not found" });
    }

    return res.status(200).json({ 
      success: true, 
      message: "Turn-on removed successfully",
      turnOns: user.turnOns 
    });
  } catch (error) {
    return handleError(error, res);
  }
};

// Matching System Methods
const addCrush = async (req, res) => {
  try {
    if (!isValidId(req.params.userId)) {
      return res.status(400).json({ success: false, message: "Invalid user ID" });
    }

    if (!isValidId(req.body.crushId)) {
      return res.status(400).json({ success: false, message: "Invalid crush ID" });
    }

    const user = await User.findByIdAndUpdate(
      req.params.userId,
      { $addToSet: { crushes: req.body.crushId } },
      { new: true }
    ).select("crushes");

    if (!user) {
      return res.status(404).json({ success: false, message: "User not found" });
    }

    return res.status(200).json({ 
      success: true, 
      message: "Crush added successfully",
      crushes: user.crushes 
    });
  } catch (error) {
    return handleError(error, res);
  }
};

const removeCrush = async (req, res) => {
  try {
    if (!isValidId(req.params.userId)) {
      return res.status(400).json({ success: false, message: "Invalid user ID" });
    }

    const user = await User.findByIdAndUpdate(
      req.params.userId,
      { $pull: { crushes: req.body.crushId } },
      { new: true }
    ).select("crushes");

    if (!user) {
      return res.status(404).json({ success: false, message: "User not found" });
    }

    return res.status(200).json({ 
      success: true, 
      message: "Crush removed successfully",
      crushes: user.crushes 
    });
  } catch (error) {
    return handleError(error, res);
  }
};

// Account Management
const deleteUserAccount = async (req, res) => {
  try {
    if (!isValidId(req.params.userId)) {
      return res.status(400).json({ success: false, message: "Invalid user ID" });
    }

    const user = await User.findByIdAndDelete(req.params.userId);
    if (!user) {
      return res.status(404).json({ success: false, message: "User not found" });
    }

    return res.status(200).json({ 
      success: true, 
      message: "Account deleted successfully" 
    });
  } catch (error) {
    return handleError(error, res);
  }
};

// Export all methods
module.exports = {
  getDescription,
  updateDescription,
  fetchUserDetails,
  updateGender,
  updateUserProfileImages,
  addProfileImage,
  updateUserPreferences,
  addTurnOn,
  removeTurnOn,
  addCrush,
  removeCrush,
  deleteUserAccount
};