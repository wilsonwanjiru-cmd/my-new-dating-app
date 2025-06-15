const User = require("../models/user");

// Update User Gender
const updateGender = async (req, res) => {
  try {
    const { userId } = req.params;
    const { gender } = req.body;

    const user = await User.findByIdAndUpdate(userId, { gender }, { new: true });
    if (!user) return res.status(404).json({ message: "User not found" });

    return res.status(200).json({ message: "User gender updated successfully", user });
  } catch (error) {
    res.status(500).json({ message: "Error updating user gender", error });
  }
};

// Update User Description
const updateDescription = async (req, res) => {
  try {
    const { userId } = req.params;
    const { description } = req.body;

    const user = await User.findByIdAndUpdate(userId, { description }, { new: true });
    if (!user) return res.status(404).json({ message: "User not found" });

    return res.status(200).json({ message: "User description updated successfully", user });
  } catch (error) {
    res.status(500).json({ message: "Error updating user description", error });
  }
};

// Fetch User Details
const fetchUserDetails = async (req, res) => {
  const { userId } = req.params;

  try {
    const user = await User.findById(userId);
    if (!user) return res.status(404).json({ message: "User not found" });
    res.status(200).json({ user });
  } catch (error) {
    res.status(500).json({ message: "Error fetching user details", error });
  }
};

// Update User Profile Images
const updateUserProfileImages = async (req, res) => {
  const { userId } = req.params;
  const { profileImages } = req.body;

  try {
    const user = await User.findByIdAndUpdate(userId, { profileImages }, { new: true });
    if (!user) return res.status(404).json({ message: "User not found" });

    return res.status(200).json({ message: "Profile images updated successfully", user });
  } catch (error) {
    res.status(500).json({ message: "Error updating profile images", error });
  }
};

// Add a Crush
const addCrush = async (req, res) => {
  const { userId } = req.params;
  const { crushId } = req.body;

  try {
    const user = await User.findByIdAndUpdate(
      userId,
      { $addToSet: { crushes: crushId } },
      { new: true }
    );
    if (!user) return res.status(404).json({ message: "User not found" });

    return res.status(200).json({ message: "Crush added successfully", user });
  } catch (error) {
    res.status(500).json({ message: "Error adding crush", error });
  }
};

// Remove a Crush
const removeCrush = async (req, res) => {
  const { userId } = req.params;
  const { crushId } = req.body;

  try {
    const user = await User.findByIdAndUpdate(
      userId,
      { $pull: { crushes: crushId } },
      { new: true }
    );
    if (!user) return res.status(404).json({ message: "User not found" });

    return res.status(200).json({ message: "Crush removed successfully", user });
  } catch (error) {
    res.status(500).json({ message: "Error removing crush", error });
  }
};

// Update User Preferences
const updateUserPreferences = async (req, res) => {
  const { userId } = req.params;
  const { turnOns, lookingFor } = req.body;

  try {
    const user = await User.findByIdAndUpdate(
      userId,
      { turnOns, lookingFor },
      { new: true }
    );
    if (!user) return res.status(404).json({ message: "User not found" });

    return res.status(200).json({ message: "Preferences updated successfully", user });
  } catch (error) {
    res.status(500).json({ message: "Error updating preferences", error });
  }
};

// Delete User Account
const deleteUserAccount = async (req, res) => {
  const { userId } = req.params;

  try {
    const user = await User.findByIdAndDelete(userId);
    if (!user) return res.status(404).json({ message: "User not found" });

    return res.status(200).json({ message: "User account deleted successfully" });
  } catch (error) {
    res.status(500).json({ message: "Error deleting user account", error });
  }
};

// Add Profile Image
const addProfileImage = async (req, res) => {
  try {
    const { userId } = req.params;
    const { imageUrl } = req.body;

    const user = await User.findByIdAndUpdate(
      userId,
      { $push: { profileImages: imageUrl } },
      { new: true }
    );

    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    res.status(200).json({ message: "Image added successfully", user });
  } catch (error) {
    console.error("Error adding profile image:", error);
    res.status(500).json({ message: "Server error" });
  }
};

// Add Turn-On
const addTurnOn = async (req, res) => {
  try {
    const { userId } = req.params;
    const { turnOn } = req.body;

    const user = await User.findByIdAndUpdate(
      userId,
      { $addToSet: { turnOns: turnOn } },
      { new: true }
    );

    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    res.status(200).json({ message: "Turn-on added successfully", user });
  } catch (error) {
    console.error("Error adding turn-on:", error);
    res.status(500).json({ message: "Server error" });
  }
};

// Remove Turn-On
const removeTurnOn = async (req, res) => {
  try {
    const { userId } = req.params;
    const { turnOn } = req.body;

    const user = await User.findByIdAndUpdate(
      userId,
      { $pull: { turnOns: turnOn } },
      { new: true }
    );

    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    res.status(200).json({ message: "Turn-on removed successfully", user });
  } catch (error) {
    console.error("Error removing turn-on:", error);
    res.status(500).json({ message: "Server error" });
  }
};

// Add Looking-For
const addLookingFor = async (req, res) => {
  try {
    const { userId } = req.params;
    const { lookingFor } = req.body;

    const user = await User.findByIdAndUpdate(
      userId,
      { $addToSet: { lookingFor } },
      { new: true }
    );

    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    res.status(200).json({ message: "Looking-for added successfully", user });
  } catch (error) {
    console.error("Error adding looking-for:", error);
    res.status(500).json({ message: "Server error" });
  }
};

// Remove Looking-For
const removeLookingFor = async (req, res) => {
  try {
    const { userId } = req.params;
    const { lookingFor } = req.body;

    const user = await User.findByIdAndUpdate(
      userId,
      { $pull: { lookingFor } },
      { new: true }
    );

    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    res.status(200).json({ message: "Looking-for removed successfully", user });
  } catch (error) {
    console.error("Error removing looking-for:", error);
    res.status(500).json({ message: "Server error" });
  }
};

// Fetch Received Likes Details
const getReceivedLikesDetails = async (req, res) => {
  try {
    const { userId } = req.params;

    const user = await User.findById(userId).populate({
      path: "receivedLikes",
      select: "name profileImages description",
    });

    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    res.status(200).json({ receivedLikesDetails: user.receivedLikes });
  } catch (error) {
    console.error("Error fetching received likes details:", error);
    res.status(500).json({ message: "Server error" });
  }
};

module.exports = {
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
};
