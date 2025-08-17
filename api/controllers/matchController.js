const mongoose = require("mongoose");
const { ObjectId } = mongoose.Types;
const User = require("../models/user");
const Chat = require("../models/Chat");
const Notification = require("../models/notification");
const { formatDistanceToNow } = require("date-fns");

// ==================== CONSTANTS ====================
const MATCH_NOTIFICATION_COOLDOWN = 12 * 60 * 60 * 1000; // 12 hours

// ==================== ERROR HANDLER ====================
const handleError = (res, error, context = "match operation") => {
  console.error(`❌ Error during ${context}:`, error);

  if (error instanceof mongoose.Error.CastError) {
    return res.status(400).json({
      success: false,
      code: "INVALID_ID",
      message: "Invalid ID format",
    });
  }

  return res.status(500).json({
    success: false,
    code: "SERVER_ERROR",
    message: "An internal server error occurred",
    error:
      process.env.NODE_ENV === "development"
        ? { message: error.message, stack: error.stack }
        : undefined,
  });
};

// ==================== UTILITY FUNCTIONS ====================
const getOppositeGender = (gender) => 
  gender === 'male' ? 'female' : gender === 'female' ? 'male' : 'any';

const getUserStatus = (userId, onlineUsers, lastActive) => {
  if (onlineUsers.has(userId.toString())) return "online";
  if (lastActive) return `last seen ${formatDistanceToNow(lastActive)} ago`;
  return "offline";
};

// ==================== CONTROLLER METHODS ====================

// ✅ Check mutual like & create match
const createMatchIfMutual = async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const { targetUserId } = req.body;
    const currentUserId = req.user._id;

    // Validate IDs
    if (!ObjectId.isValid(targetUserId)) {
      await session.abortTransaction();
      return res.status(400).json({
        success: false,
        code: "INVALID_ID",
        message: "Invalid user ID format",
      });
    }

    // Fetch users with necessary fields
    const [currentUser, targetUser] = await Promise.all([
      User.findById(currentUserId)
        .select("name gender matches likedProfiles")
        .session(session),
      User.findById(targetUserId)
        .select("name gender matches likedProfiles")
        .session(session),
    ]);

    if (!currentUser || !targetUser) {
      await session.abortTransaction();
      return res.status(404).json({
        success: false,
        code: "USER_NOT_FOUND",
        message: "User not found",
      });
    }

    // Validate gender compatibility
    const targetOpposite = getOppositeGender(targetUser.gender);
    if (currentUser.gender !== targetOpposite && targetOpposite !== 'any') {
      await session.abortTransaction();
      return res.status(400).json({
        success: false,
        code: "GENDER_MISMATCH",
        message: "Cannot match with same gender user",
      });
    }

    // Check if already matched
    if (currentUser.matches.includes(targetUserId)) {
      await session.abortTransaction();
      return res.status(200).json({
        success: true,
        message: "Already matched",
      });
    }

    // Check mutual like
    const hasMutualLike = targetUser.likedProfiles?.includes(currentUserId.toString());
    if (!hasMutualLike) {
      await session.abortTransaction();
      return res.status(200).json({
        success: true,
        message: "Like registered, waiting for mutual like",
      });
    }

    // Update matches
    await Promise.all([
      User.findByIdAndUpdate(
        currentUserId,
        { $addToSet: { matches: targetUserId } },
        { session }
      ),
      User.findByIdAndUpdate(
        targetUserId,
        { $addToSet: { matches: currentUserId } },
        { session }
      ),
    ]);

    // Create chat if doesn't exist
    const existingChat = await Chat.findOne({
      participants: { $all: [currentUserId, targetUserId] },
    }).session(session);

    if (!existingChat) {
      await Chat.create(
        [{
          participants: [currentUserId, targetUserId],
          messages: [],
        }],
        { session }
      );
    }

    // Send match notifications
    await Notification.insertMany(
      [
        {
          user: targetUserId,
          type: "match",
          title: "It's a Match!",
          message: `You and ${currentUser.name} liked each other.`,
          from: currentUserId,
        },
        {
          user: currentUserId,
          type: "match",
          title: "It's a Match!",
          message: `You and ${targetUser.name} liked each other.`,
          from: targetUserId,
        },
      ],
      { session }
    );

    await session.commitTransaction();

    res.status(201).json({
      success: true,
      message: "It's a Match!",
      data: {
        match: {
          userId: targetUser._id,
          name: targetUser.name,
        },
      },
    });
  } catch (error) {
    await session.abortTransaction();
    handleError(res, error, "createMatchIfMutual");
  } finally {
    session.endSession();
  }
};

// ✅ Get all matches for current user
const getMatches = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = Math.min(parseInt(req.query.limit) || 20, 100);
    const skip = (page - 1) * limit;
    const onlineUsers = req.app.get("onlineUsers") || new Set();

    const user = await User.findById(req.user._id)
      .select("matches")
      .lean();

    if (!user) {
      return res.status(404).json({
        success: false,
        code: "USER_NOT_FOUND",
        message: "User not found",
      });
    }

    const matchIds = user.matches.slice(skip, skip + limit);
    const totalMatches = user.matches.length;

    const matches = await User.aggregate([
      { $match: { _id: { $in: matchIds } } },
      {
        $project: {
          _id: 1,
          name: 1,
          profileImages: { $slice: ["$profileImages", 1] },
          gender: 1,
          age: 1,
          lastActive: 1,
        },
      },
    ]);

    const formattedMatches = matches.map(user => ({
      id: user._id,
      name: user.name,
      photo: user.profileImages[0]?.url || null,
      gender: user.gender,
      age: user.age,
      status: getUserStatus(user._id, onlineUsers, user.lastActive),
    }));

    res.status(200).json({
      success: true,
      data: {
        matches: formattedMatches,
        pagination: {
          currentPage: page,
          totalPages: Math.ceil(totalMatches / limit),
          totalItems: totalMatches,
          limit,
        },
      },
    });
  } catch (error) {
    handleError(res, error, "getMatches");
  }
};

// ✅ Get match details
const getMatchDetails = async (req, res) => {
  try {
    const { matchId } = req.params;
    const onlineUsers = req.app.get("onlineUsers") || new Set();

    if (!ObjectId.isValid(matchId)) {
      return res.status(400).json({
        success: false,
        code: "INVALID_ID",
        message: "Invalid match ID format",
      });
    }

    // Verify match relationship
    const isMatched = await User.exists({
      _id: req.user._id,
      matches: matchId,
    });

    if (!isMatched) {
      return res.status(404).json({
        success: false,
        code: "NOT_MATCHED",
        message: "This user is not in your matches",
      });
    }

    const match = await User.findById(matchId)
      .select("name profileImages bio age gender lastActive")
      .lean();

    if (!match) {
      return res.status(404).json({
        success: false,
        code: "USER_NOT_FOUND",
        message: "Match not found",
      });
    }

    res.status(200).json({
      success: true,
      data: {
        id: match._id,
        name: match.name,
        photo: match.profileImages[0]?.url || null,
        bio: match.bio,
        age: match.age,
        gender: match.gender,
        status: getUserStatus(match._id, onlineUsers, match.lastActive),
      },
    });
  } catch (error) {
    handleError(res, error, "getMatchDetails");
  }
};

// ✅ Unmatch with a user
const unmatchUser = async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const { userId } = req.params;
    const currentUserId = req.user._id;

    if (!ObjectId.isValid(userId)) {
      await session.abortTransaction();
      return res.status(400).json({
        success: false,
        code: "INVALID_ID",
        message: "Invalid user ID format",
      });
    }

    // Remove match relationship
    await Promise.all([
      User.findByIdAndUpdate(
        currentUserId,
        { $pull: { matches: userId } },
        { session }
      ),
      User.findByIdAndUpdate(
        userId,
        { $pull: { matches: currentUserId } },
        { session }
      ),
    ]);

    // Delete associated chat
    await Chat.deleteOne({
      participants: { $all: [currentUserId, userId] },
    }).session(session);

    // Send unmatch notification
    await Notification.create(
      {
        user: userId,
        type: "unmatch",
        title: "Match Removed",
        message: `${req.user.name} has unmatched with you`,
        from: currentUserId,
      },
      { session }
    );

    await session.commitTransaction();

    res.status(200).json({
      success: true,
      message: "Successfully unmatched",
    });
  } catch (error) {
    await session.abortTransaction();
    handleError(res, error, "unmatchUser");
  } finally {
    session.endSession();
  }
};

// ✅ Get potential matches (gender-filtered)
const getPotentialMatches = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = Math.min(parseInt(req.query.limit) || 20, 100);
    const skip = (page - 1) * limit;
    const onlineUsers = req.app.get("onlineUsers") || new Set();

    const currentUser = await User.findById(req.user._id)
      .select("gender matches likedProfiles")
      .lean();

    if (!currentUser) {
      return res.status(404).json({
        success: false,
        code: "USER_NOT_FOUND",
        message: "Current user not found",
      });
    }

    // Determine opposite gender for filtering
    const targetGender = getOppositeGender(currentUser.gender);
    
    const query = {
      _id: {
        $ne: req.user._id,
        $nin: [...currentUser.matches, ...(currentUser.likedProfiles || [])],
      },
      ...(targetGender !== 'any' && { gender: targetGender }),
    };

    const [potentialMatches, totalCount] = await Promise.all([
      User.find(query)
        .select("name profileImages age gender lastActive")
        .skip(skip)
        .limit(limit)
        .lean(),
      User.countDocuments(query),
    ]);

    const formattedMatches = potentialMatches.map(user => ({
      id: user._id,
      name: user.name,
      photo: user.profileImages[0]?.url || null,
      age: user.age,
      gender: user.gender,
      status: getUserStatus(user._id, onlineUsers, user.lastActive),
    }));

    res.status(200).json({
      success: true,
      data: {
        potentialMatches: formattedMatches,
        pagination: {
          currentPage: page,
          totalPages: Math.ceil(totalCount / limit),
          totalItems: totalCount,
          limit,
        },
      },
    });
  } catch (error) {
    handleError(res, error, "getPotentialMatches");
  }
};

module.exports = {
  createMatchIfMutual,
  getMatches,
  getMatchDetails,
  unmatchUser,
  getPotentialMatches,
};
