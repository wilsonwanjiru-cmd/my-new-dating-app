const mongoose = require('mongoose');
const validator = require('validator');
const bcrypt = require('bcrypt');
const { formatDistanceToNow } = require('date-fns');

const userSchema = new mongoose.Schema({
  // Basic Information
  name: {
    type: String,
    required: [true, 'Name is required'],
    trim: true,
    minlength: [2, 'Name must be at least 2 characters'],
    maxlength: [50, 'Name cannot exceed 50 characters']
  },
  email: {
    type: String,
    required: [true, 'Email is required'],
    unique: true,
    lowercase: true,
    trim: true,
    validate: {
      validator: validator.isEmail,
      message: props => `${props.value} is not a valid email address!`
    }
  },
  password: {
    type: String,
    required: [true, 'Password is required'],
    minlength: [8, 'Password must be at least 8 characters'],
    select: false
  },
  phoneNumber: {
    type: String,
    required: [true, 'Phone number is required for M-Pesa'],
    validate: {
      validator: v => /^(\+?254|0)[17]\d{8}$/.test(v),
      message: props => `${props.value} is not a valid Kenyan phone number!`
    }
  },

  // Profile Information - UPDATED TO MATCH BLUEPRINT
  gender: {
    type: String,
    enum: ['male', 'female', 'non-binary'],
    required: [true, 'Gender is required']
  },
  genderPreference: {
    type: [String],
    enum: ['male', 'female', 'non-binary'],
    required: [true, 'Gender preference is required'],
    validate: {
      validator: function(v) {
        return v && v.length > 0;
      },
      message: 'At least one gender preference is required'
    }
  },
  profileComplete: {
    type: Boolean,
    default: false
  },
  age: {
    type: Number,
    min: [18, 'You must be at least 18 years old'],
    max: [100, 'Age cannot exceed 100 years']
  },
  bio: {
    type: String,
    maxlength: [500, 'Bio cannot exceed 500 characters']
  },
  profileImages: [{
    url: {
      type: String,
      required: true,
      validate: {
        validator: v => validator.isURL(v, { protocols: ['http', 'https'], require_protocol: true }),
        message: 'Invalid image URL'
      }
    },
    publicId: { 
      type: String, 
      required: true
    },
    likes: { type: Number, default: 0 },
    likedBy: [{ 
      type: mongoose.Schema.Types.ObjectId, 
      ref: 'User' 
    }],
    uploadedAt: { type: Date, default: Date.now }
  }],

  // Online Status & Activity - UPDATED FOR SOCKET.IO TRACKING
  isOnline: {
    type: Boolean,
    default: false
  },
  lastActive: {
    type: Date,
    default: Date.now
  },
  socketId: String,
  activeSessions: [String],

  // Location
  location: {
    type: {
      type: String,
      default: 'Point',
      enum: ['Point']
    },
    coordinates: {
      type: [Number],
      index: '2dsphere',
      validate: {
        validator: function(v) {
          return v.length === 2 && 
          v[0] >= -180 && v[0] <= 180 && 
          v[1] >= -90 && v[1] <= 90;
        },
        message: 'Invalid coordinates'
      }
    },
    lastUpdated: Date
  },

  // Subscription Info - UPDATED FOR REAL-TIME VALIDATION
  subscription: {
    isActive: {
      type: Boolean,
      default: false
    },
    startsAt: Date,
    expiresAt: Date,
    lastPayment: {
      amount: Number,
      date: Date,
      mpesaCode: String
    }
  },

  // Social Features - OPTIMIZED FOR DATING APP
  likesReceived: [{ 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'User' 
  }],
  matches: [{ 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'User' 
  }],
  likedPhotos: [{ 
    photoId: { type: mongoose.Schema.Types.ObjectId, ref: 'Photo' },
    ownerId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    likedAt: { type: Date, default: Date.now }
  }],

  // Preferences - SIMPLIFIED
  preferences: {
    ageRange: {
      min: { type: Number, default: 18, min: 18 },
      max: { type: Number, default: 100, max: 100 }
    },
    distance: {
      type: Number,
      default: 50,
      min: 1,
      max: 1000
    }
  },

  // Account Security
  isVerified: { type: Boolean, default: false },
  verificationToken: String,
  verificationTokenExpires: Date,
  resetToken: String,
  resetTokenExpires: Date,
  failedLoginAttempts: { type: Number, default: 0 },
  accountLocked: { type: Boolean, default: false },
  lockUntil: { type: Date }

}, {
  timestamps: true,
  toJSON: {
    virtuals: true,
    transform: (doc, ret) => {
      delete ret.password;
      delete ret.verificationToken;
      delete ret.resetToken;
      delete ret.__v;
      delete ret.socketId;
      delete ret.activeSessions;
      // Include virtual subscription status in output
      ret.isSubscribed = doc.isSubscribed;
      return ret;
    }
  }
});

// ======================
// INDEXES - OPTIMIZED FOR QUERIES
// ======================
userSchema.index({ location: '2dsphere' });
userSchema.index({ lastActive: -1 });
userSchema.index({ isOnline: 1 });
userSchema.index({ 'subscription.expiresAt': 1 }); // Optimized for subscription checks
userSchema.index({ gender: 1 });
userSchema.index({ genderPreference: 1 });
userSchema.index({ profileComplete: 1 });

// ======================
// PRE-SAVE HOOKS - UPDATED
// ======================
userSchema.pre('save', async function(next) {
  // Skip password hashing if password not modified
  if (!this.isModified('password')) return next();
  
  try {
    const salt = await bcrypt.genSalt(10);
    this.password = await bcrypt.hash(this.password, salt);
    next();
  } catch (err) {
    next(err);
  }
});

// Auto-set profileComplete when gender preferences are set
userSchema.pre('save', function(next) {
  if (this.isModified('genderPreference') || this.isModified('gender')) {
    this.profileComplete = !!this.gender && 
                           Array.isArray(this.genderPreference) && 
                           this.genderPreference.length > 0;
  }
  next();
});

// ======================
// VIRTUAL PROPERTIES - UPDATED FOR REAL-TIME SUBSCRIPTION
// ======================
userSchema.virtual('isSubscribed').get(function() {
  if (!this.subscription || !this.subscription.expiresAt) return false;
  return this.subscription.expiresAt > new Date();
});

userSchema.virtual('subscriptionStatus').get(function() {
  return {
    isActive: this.isSubscribed,
    expiresAt: this.subscription?.expiresAt,
    timeRemaining: this.subscription?.expiresAt ? 
      formatDistanceToNow(new Date(this.subscription.expiresAt)) : null
  };
});

userSchema.virtual('photoCount').get(function() {
  return this.profileImages.length;
});

userSchema.virtual('totalLikes').get(function() {
  return this.profileImages.reduce((sum, img) => sum + img.likes, 0);
});

userSchema.virtual('statusIndicator').get(function() {
  return {
    isOnline: this.isOnline,
    lastSeen: formatDistanceToNow(this.lastActive) + ' ago'
  };
});

// ======================
// INSTANCE METHODS - UPDATED FOR BLUEPRINT
// ======================
userSchema.methods.comparePassword = async function(candidatePassword) {
  return await bcrypt.compare(candidatePassword, this.password);
};

userSchema.methods.hasLikedPhoto = function(photoId) {
  return this.likedPhotos.some(photo => photo.photoId.equals(photoId));
};

userSchema.methods.getSubscriptionStatus = function() {
  return {
    isActive: this.isSubscribed,
    expiresAt: this.subscription?.expiresAt
  };
};

userSchema.methods.markOnline = function(socketId) {
  this.isOnline = true;
  this.lastActive = new Date();
  if (!this.activeSessions.includes(socketId)) {
    this.activeSessions.push(socketId);
  }
  return this.save();
};

userSchema.methods.markOffline = function(socketId) {
  this.activeSessions = this.activeSessions.filter(id => id !== socketId);
  if (this.activeSessions.length === 0) {
    this.isOnline = false;
  }
  return this.save();
};

userSchema.methods.updateActivity = function() {
  this.lastActive = new Date();
  return this.save();
};

userSchema.methods.activateSubscription = function(durationHours = 24) {
  const now = new Date();
  this.subscription = {
    isActive: true,
    startsAt: now,
    expiresAt: new Date(now.getTime() + durationHours * 60 * 60 * 1000)
  };
  return this.save();
};

const User = mongoose.model('User', userSchema);

module.exports = User;