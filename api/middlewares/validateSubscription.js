
// middlewares/validateSubscription.js
const jwt = require("jsonwebtoken");
const User = require('../models/user');
const Photo = require('../models/photo'); // Assuming you have a Photo model

const validateSubscription = async (req, res, next) => {
  try {
    // Extract token from the Authorization header
    const token = req.headers.authorization?.split(" ")[1];
    if (!token) {
      return res.status(401).json({ message: "No token provided" });
    }

    // Verify the token and extract the user ID
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const userId = decoded.userId;

    // Fetch the user from the database
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    // Count how many photos the user has uploaded
    const photoCount = await Photo.countDocuments({ userId });

    // If the user is not subscribed
    if (!user.subscriptionActive || new Date() > user.subscriptionExpiresAt) {
      // Allow up to 7 photos only
      if (photoCount >= 7) {
        return res.status(403).json({
          message: "Free upload limit reached. Please subscribe to upload more photos.",
        });
      }
    }

    // Attach the user object to the request for further use
    req.user = user;
    next(); // Proceed to the next middleware/route
  } catch (error) {
    console.error("Error validating subscription:", error);
    res.status(500).json({ message: "Server error", error: error.message });
  }
};

module.exports = validateSubscription;
