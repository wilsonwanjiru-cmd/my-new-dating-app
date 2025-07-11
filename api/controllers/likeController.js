const User = require('../models/user');
const Notification = require('../models/Notification');

const handleLike = async (req, res) => {
  try {
    const { userId } = req.params;
    const liker = req.user;

    // Add like to user's profile
    const likedUser = await User.findByIdAndUpdate(
      userId,
      { $addToSet: { likesReceived: liker._id } },
      { new: true }
    );

    // Create notification
    await Notification.create({
      user: userId,
      type: 'new_like',
      title: 'New Like',
      message: `${liker.name} liked your profile`,
      from: liker._id,
      data: {
        likerId: liker._id,
        likerName: liker.name
      }
    });

    // Check for match
    if (likedUser.likesReceived.includes(liker._id) && 
        liker.likesReceived.includes(userId)) {
      // It's a match - create match notification for both users
      await Promise.all([
        Notification.create({
          user: userId,
          type: 'match',
          title: 'New Match!',
          message: `You matched with ${liker.name}`,
          from: liker._id
        }),
        Notification.create({
          user: liker._id,
          type: 'match',
          title: 'New Match!',
          message: `You matched with ${likedUser.name}`,
          from: userId
        })
      ]);

      return res.json({ 
        success: true, 
        isMatch: true,
        message: "It's a match!" 
      });
    }

    return res.json({ 
      success: true, 
      isMatch: false,
      message: "Like recorded" 
    });

  } catch (error) {
    console.error('Like error:', error);
    return res.status(500).json({ 
      success: false, 
      message: 'Error processing like' 
    });
  }
};

module.exports = {
  handleLike
};