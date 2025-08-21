const mongoose = require('mongoose');

const photoSchema = new mongoose.Schema({
  // Core photo information
  url: {
    type: String,
    required: [true, 'Photo URL is required'],
    validate: {
      validator: function(v) {
        return /^(http|https):\/\/[^ "]+$/.test(v);
      },
      message: props => `${props.value} is not a valid URL!`
    }
  },
  publicId: {
    type: String,
    required: [true, 'Cloudinary public ID is required'],
    index: true
  },
  status: {
    type: String,
    enum: ['pending', 'approved', 'rejected'],
    default: 'pending'
  },
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: [true, 'Photo must belong to a user'],
    index: true
  },
  uploader: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    index: true
  },
  gender: {
    type: String,
    enum: ['male', 'female'],
    required: [true, 'Gender is required for filtering'],
    index: true
  },
  caption: {
    type: String,
    maxlength: [2200, 'Caption cannot exceed 2200 characters'],
    default: ''
  },

  // Like system
  likes: {
    type: Number,
    default: 0,
    min: 0
  },
  likedBy: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    index: true
  }],

  // Primary photo flag
  isPrimary: {
    type: Boolean,
    default: false,
    index: true
  },

  // Timestamps
  createdAt: {
    type: Date,
    default: Date.now,
    index: true
  },
  updatedAt: {
    type: Date,
    default: Date.now
  }
}, {
  timestamps: true,
  toJSON: { 
    virtuals: true,
    transform: function(doc, ret) {
      delete ret.__v;
      // Ensure imageUrl is always present for frontend
      ret.imageUrl = ret.url;
      // Remove publicId from API responses for security
      delete ret.publicId;
      return ret;
    }
  },
  toObject: { 
    virtuals: true,
    transform: function(doc, ret) {
      delete ret.__v;
      ret.imageUrl = ret.url;
      delete ret.publicId;
      return ret;
    }
  }
});

// ==================== VIRTUAL FIELDS ====================
photoSchema.virtual('imageUrl').get(function() {
  return this.url; // Alias for frontend compatibility
});

photoSchema.virtual('owner', {
  ref: 'User',
  localField: 'user',
  foreignField: '_id',
  justOne: true
});

// ==================== INDEXES ====================
photoSchema.index({ status: 1 }); // For moderation queries
photoSchema.index({ user: 1, status: 1 }); // User's photos
photoSchema.index({ gender: 1, createdAt: -1 }); // Gender-based feed
photoSchema.index({ isPrimary: 1, user: 1 }); // Primary photo lookup
photoSchema.index({ uploader: 1, status: 1 }); // Backward compatibility
photoSchema.index({ likedBy: 1 }); // Optimize like checks
photoSchema.index({ user: 1, likedBy: 1 }, { unique: true }); // Prevent duplicate likes

// ==================== MIDDLEWARE ====================

// Auto-populate uploader to match user
photoSchema.pre('save', function(next) {
  // Set uploader if not provided
  if (!this.uploader && this.user) {
    this.uploader = this.user;
  }
  
  // Set moderation status for new photos
  if (this.isNew) {
    this.status = 'pending';
  }
  
  next();
});

// Auto-update likes count
photoSchema.pre('save', function(next) {
  if (this.isModified('likedBy')) {
    this.likes = this.likedBy.length;
  }
  next();
});

// When setting a photo as primary, unset others
photoSchema.pre('save', async function(next) {
  if (this.isModified('isPrimary') && this.isPrimary && this.user) {
    await this.constructor.updateMany(
      { user: this.user, _id: { $ne: this._id } },
      { $set: { isPrimary: false } }
    );
  }
  next();
});

// ==================== STATIC METHODS ====================

/**
 * Get photos for user's feed with gender filtering
 * Aligns with: 🖼️ Bio (Photo Feed) in blueprint
 */
photoSchema.statics.getFilteredFeed = async function(
  currentUserId, 
  page = 1, 
  limit = 10
) {
  const user = await mongoose.model('User').findById(currentUserId)
    .select('gender genderPreference');
  
  if (!user) throw new Error('User not found');
  
  // Get opposite gender based on blueprint logic
  const oppositeGender = user.gender === 'male' ? 'female' : 'male';
  const genderFilter = user.genderPreference.includes(oppositeGender) 
    ? [oppositeGender] 
    : user.genderPreference;

  return this.find({ 
    status: 'approved', // Only approved photos
    gender: { $in: genderFilter }
  })
  .sort({ createdAt: -1 })
  .skip((page - 1) * limit)
  .limit(limit)
  .populate({
    path: 'user',
    select: 'name gender isOnline lastActive profileImages' // Include online status
  });
};

/**
 * Get primary photo for a user
 */
photoSchema.statics.getPrimaryPhoto = async function(userId) {
  return this.findOne({ 
    user: userId,
    isPrimary: true,
    status: 'approved'
  });
};

/**
 * Get user's approved photos
 */
photoSchema.statics.getUserPhotos = async function(userId) {
  return this.find({ 
    user: userId,
    status: 'approved'
  }).sort({ isPrimary: -1, createdAt: -1 });
};

// ==================== INSTANCE METHODS ====================

/**
 * Add a like to the photo with duplicate prevention
 */
photoSchema.methods.addLike = async function(userId) {
  // Check if user has already liked this photo
  if (this.likedBy.includes(userId)) {
    throw new Error('User has already liked this photo');
  }
  
  this.likedBy.push(userId);
  await this.save();
  return this.likes;
};

module.exports = mongoose.model('Photo', photoSchema);