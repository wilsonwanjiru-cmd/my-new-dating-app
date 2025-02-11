const User = require("../models/user");

const verifySubscription = async (req, res, next) => {
  try {
    const userId = req.user.id; // Assuming user ID is stored in `req.user` after authentication
    const user = await User.findById(userId);

    if (!user || !user.isSubscribed || new Date() > user.subscriptionExpires) {
      return res.status(403).json({
        message: "Subscription expired or not active. Please subscribe to access this feature.",
      });
    }

    next();
  } catch (error) {
    console.error("Subscription verification error:", error);
    res.status(500).json({ message: "Internal server error" });
  }
};

module.exports = { verifySubscription };
