const mongoose = require('mongoose');
const validator = require('validator');
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
    validate: {
      validator: v => /^\+?[0-9]{10,15}$/.test(v),
      message: props => `${props.value} is not a valid phone number!`
    }
  },

  // Profile Information
  gender: {
    type: String,
    enum: ['male', 'female', 'non-binary', 'prefer-not-to-say'],
    default: 'prefer-not-to-say'
  },
  birthDate: {
    type: Date,
    validate: {
      validator: function(v) {
        return v <= new Date(new Date().setFullYear(new Date().getFullYear() - 18));
      },
      message: 'User must be at least 18 years old'
    }
  },
  bio: {
    type: String,
    maxlength: [500, 'Bio cannot exceed 500 characters'],
    default: '',
    trim: true
  },
  profileImages: {
    type: [String],
    validate: {
      validator: v => v.length <= 20,
      message: 'Cannot have more than 20 profile images'
    },
    default: []
  },
  interests: {
    type: [String],
    validate: {
      validator: v => v.length <= 10,
      message: 'Cannot have more than 10 interests'
    },
    default: []
  },

  // Location Information
  location: {
    type: {
      type: String,
      default: 'Point',
      enum: ['Point']
    },
    coordinates: {
      type: [Number],
      index: '2dsphere'
    },
    city: String,
    country: String
  },

  // Dating Preferences
  lookingFor: {
    type: [String],
    enum: ['relationship', 'dating', 'friendship', 'something-casual'],
    default: []
  },
  preferredAgeRange: {
    min: { type: Number, min: 18, max: 100 },
    max: { type: Number, min: 18, max: 100 }
  },
  preferredGenders: {
    type: [String],
    enum: ['male', 'female', 'non-binary'],
    default: []
  },

  // Subscription Info
  subscription: {
    isActive: { type: Boolean, default: false },
    expiresAt: Date,
    lastPayment: {
      amount: Number,
      date: Date,
      transactionId: String,
      method: {
        type: String,
        enum: ['mpesa', 'card', 'paypal']
      }
    },
    paymentHistory: [{
      amount: Number,
      date: Date,
      transactionId: String,
      method: String
    }]
  },
  freeUploadsUsed: {
    type: Number,
    default: 0,
    min: 0,
    max: 7
  },
  lastSubscribedAt: Date,

  // Social Connections
  crushes: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
  matches: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
  likesReceived: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
  blockedUsers: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],

  // Activity
  lastActive: { type: Date, default: Date.now },
  lastLogin: Date,
  loginCount: { type: Number, default: 0 },

  // Verification
  isVerified: {
    email: Boolean,
    phone: Boolean,
    profile: Boolean
  },
  verificationTokens: {
    email: String,
    phone: String
  },

  // Settings
  notificationPreferences: {
    newMatches: { type: Boolean, default: true },
    messages: { type: Boolean, default: true },
    likes: { type: Boolean, default: true },
    promotions: { type: Boolean, default: true }
  },
  privacySettings: {
    showAge: { type: Boolean, default: true },
    showDistance: { type: Boolean, default: true },
    showLastActive: { type: Boolean, default: true }
  }
}, {
  timestamps: true,
  toJSON: {
    virtuals: true,
    transform: (doc, ret) => {
      delete ret.password;
      delete ret.verificationTokens;
      delete ret.__v;
      return ret;
    }
  },
  toObject: {
    virtuals: true
  }
});

// ✅ Only the required indexes
userSchema.index({ location: '2dsphere' });
userSchema.index({ 'subscription.isActive': 1, 'subscription.expiresAt': 1 });
userSchema.index({ lastActive: -1 });
userSchema.index({ 'isVerified.profile': 1 });

// Virtuals
userSchema.virtual('age').get(function() {
  if (!this.birthDate) return null;
  const ageDiff = Date.now() - this.birthDate.getTime();
  return Math.abs(new Date(ageDiff).getUTCFullYear() - 1970);
});

userSchema.virtual('subscriptionStatus').get(function() {
  if (!this.subscription?.isActive) return 'inactive';
  if (new Date() > this.subscription.expiresAt) return 'expired';
  return 'active';
});

userSchema.virtual('timeUntilSubscriptionExpires').get(function() {
  if (!this.subscription?.expiresAt) return null;
  return formatDistanceToNow(this.subscription.expiresAt);
});

// Instance Methods
userSchema.methods.canUploadMorePhotos = function(count = 1) {
  return this.subscription?.isActive || (this.freeUploadsUsed + count) <= 7;
};

userSchema.methods.canViewFullProfiles = function() {
  return this.subscription?.isActive && this.subscription.expiresAt > new Date();
};

userSchema.methods.canMessage = function() {
  return this.subscription?.isActive && this.subscription.expiresAt > new Date();
};

// Static Methods
userSchema.statics.findActiveSubscribers = function() {
  return this.find({
    'subscription.isActive': true,
    'subscription.expiresAt': { $gt: new Date() }
  });
};

userSchema.statics.findNearbyUsers = function(coordinates, maxDistance = 10000) {
  return this.find({
    location: {
      $near: {
        $geometry: {
          type: 'Point',
          coordinates
        },
        $maxDistance: maxDistance
      }
    }
  });
};

// Hooks
userSchema.pre('save', function(next) {
  if (this.interests) this.interests = [...new Set(this.interests)];
  if (this.lookingFor) this.lookingFor = [...new Set(this.lookingFor)];
  if (this.preferredGenders) this.preferredGenders = [...new Set(this.preferredGenders)];

  if (this.isModified('profileImages') || this.isModified('bio')) {
    this.lastActive = new Date();
  }

  next();
});

const User = mongoose.model('User', userSchema);
module.exports = User;
