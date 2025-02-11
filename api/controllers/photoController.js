// controllers/photoController.js
const User = require('../models/user');

exports.getAllPhotos = async (req, res) => {
  try {
    const users = await User.find({}, 'profileImages');
    const allPhotos = users.flatMap(user => user.profileImages);
    res.status(200).json(allPhotos);
  } catch (error) {
    res.status(500).json({ message: 'Error fetching photos', error });
  }
};

exports.getFreePhotos = async (req, res) => {
  try {
    const users = await User.find({}, 'profileImages');
    const allPhotos = users.flatMap(user => user.profileImages);
    const freePhotos = allPhotos.slice(0, 3); // Get the first 3 photos
    res.status(200).json(freePhotos);
  } catch (error) {
    res.status(500).json({ message: 'Error fetching free photos', error });
  }
};