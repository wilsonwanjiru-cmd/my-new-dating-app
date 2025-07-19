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
      validator: v => /^\+?254[0-9]{9}$/.test(v), // Kenyan phone number format
      message: props => `${props.value} is not a valid Kenyan phone number!`
    }
  },

  // Profile Information
  gender: {
    type: String,
    enum: ['male', 'female', 'non-binary', 'prefer-not-to-say'],
    required: false
  },
  age: {
    type: Number,
    min: [18, 'You must be at least 18 years old'],
    max: [100, 'Age cannot exceed 100 years']
  },
  description: {
    type: String,
    maxlength: [500, 'Description cannot exceed 500 characters']
  },
  profileImages: [{
    type: String,
    validate: {
      validator: v => validator.isURL(v, { protocols: ['http','https'], require_protocol: true }),
      message: 'Invalid image URL'
    }
  }],
  location: {
    type: {
      type: String,
      default: 'Point',
      enum: ['Point'],
      required: true
    },
    coordinates: {
      type: [Number],
      required: true,
      validate: {
        validator: function(v) {
          return Array.isArray(v) && 
                 v.length === 2 && 
                 typeof v[0] === 'number' && 
                 typeof v[1] === 'number' &&
                 v[0] >= -180 && v[0] <= 180 && // Valid longitude
                 v[1] >= -90 && v[1] <= 90;     // Valid latitude
        },
        message: props => `Invalid coordinates: ${props.value}. Must be [longitude, latitude] with valid values`
      },
      default: [36.8219, -1.2921] // Default to Nairobi coordinates
    },
    address: {
      type: String,
      trim: true
    },
    lastUpdated: {
      type: Date,
      default: Date.now
    }
  },
  lastActive: {
    type: Date,
    default: Date.now
  },

  // Subscription Info - M-Pesa Only
  subscription: {
    isActive: { type: Boolean, default: false },
    expiresAt: { type: Date, default: null },
    lastPayment: {
      amount: { 
        type: Number, 
        default: 10, // KES 10 fixed amount
        validate: {
          validator: v => v === 10,
          message: 'Subscription amount must be KES 10'
        }
      },
      date: { type: Date, default: null },
      mpesaCode: {
        type: String,
        validate: {
          validator: v => /^[A-Z0-9]{10}$/.test(v), // MPesa transaction code format
          message: 'Invalid M-Pesa transaction code'
        }
      },
      phoneNumber: {
        type: String,
        validate: {
          validator: v => /^\+?254[0-9]{9}$/.test(v),
          message: 'Invalid M-Pesa phone number'
        }
      }
    },
    paymentHistory: [{
      amount: { type: Number, default: 10 },
      date: Date,
      mpesaCode: String,
      phoneNumber: String
    }]
  },
  freeUploadsUsed: {
    type: Number,
    default: 0,
    min: 0,
    max: 7
  },

  // Social Features
  likesReceived: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }],
  matches: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }],
  crushes: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }],
  preferences: {
    gender: {
      type: String,
      enum: ['male', 'female', 'non-binary', 'any'],
      default: 'any'
    },
    ageRange: {
      min: { type: Number, default: 18, min: 18 },
      max: { type: Number, default: 100, max: 100 }
    },
    distance: { // in kilometers
      type: Number,
      default: 50,
      min: 1,
      max: 1000
    }
  },

  // Notifications
  notifications: [{
    type: {
      type: String,
      enum: ['new_like', 'new_match', 'new_message', 'subscription_expiry']
    },
    from: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    message: String,
    read: {
      type: Boolean,
      default: false
    },
    requiresSubscription: {
      type: Boolean,
      default: false
    },
    createdAt: {
      type: Date,
      default: Date.now
    }
  }],

  // Account Verification
  isVerified: {
    type: Boolean,
    default: false
  },
  verificationToken: String,
  verificationTokenExpires: Date,
  resetToken: String,
  resetTokenExpires: Date

}, {
  timestamps: true,
  toJSON: {
    virtuals: true,
    transform: (doc, ret) => {
      delete ret.password;
      delete ret.verificationToken;
      delete ret.resetToken;
      delete ret.__v;
      return ret;
    }
  }
});

// Indexes
userSchema.index({ email: 1 }, { unique: true });
userSchema.index({ location: '2dsphere' });
userSchema.index({ lastActive: -1 });

// Middleware to ensure valid location data - FIXED VERSION
userSchema.pre('save', function(next) {
  if (this.isModified('location') && this.location) {
    // Ensure coordinates array exists and has exactly 2 numbers
    if (!Array.isArray(this.location.coordinates)) {
      this.location.coordinates = [36.8219, -1.2921]; // Default to Nairobi
    } else if (this.location.coordinates.length !== 2) {
      this.location.coordinates = [36.8219, -1.2921]; // Default to Nairobi
    }
    
    // Update lastUpdated timestamp
    this.location.lastUpdated = new Date();
  }
  next();
});

// Password hashing middleware
userSchema.pre('save', async function(next) {
  if (!this.isModified('password')) return next();
  
  try {
    const salt = await bcrypt.genSalt(10);
    this.password = await bcrypt.hash(this.password, salt);
    next();
  } catch (err) {
    next(err);
  }
});

// Method to compare passwords
userSchema.methods.comparePassword = async function(candidatePassword) {
  return await bcrypt.compare(candidatePassword, this.password);
};

// Virtual for subscription status
userSchema.virtual('subscriptionStatus').get(function() {
  return {
    isActive: this.subscription?.isActive && new Date(this.subscription.expiresAt) > new Date(),
    expiresAt: this.subscription?.expiresAt,
    timeRemaining: this.subscription?.expiresAt 
      ? formatDistanceToNow(new Date(this.subscription.expiresAt))
      : null
  };
});

// Virtual for formatted location
userSchema.virtual('location.formatted').get(function() {
  if (!this.location || !this.location.coordinates) return 'Location not set';
  return `Lat: ${this.location.coordinates[1]}, Long: ${this.location.coordinates[0]}`;
});

// Add M-Pesa specific method
userSchema.methods.initiateMpesaPayment = async function() {
  return {
    phoneNumber: this.phoneNumber,
    amount: 10,
    accountReference: `Ruda-${this._id}`,
    transactionDesc: 'Ruda Dating Premium Subscription'
  };
};

// Update subscription method for M-Pesa
userSchema.methods.activateSubscription = function(mpesaResponse) {
  this.subscription = {
    isActive: true,
    expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000), // 24 hours from now
    lastPayment: {
      amount: 10,
      date: new Date(),
      mpesaCode: mpesaResponse.TransactionID,
      phoneNumber: mpesaResponse.PhoneNumber
    }
  };
  
  // Add to payment history
  this.subscription.paymentHistory.push({
    amount: 10,
    date: new Date(),
    mpesaCode: mpesaResponse.TransactionID,
    phoneNumber: mpesaResponse.PhoneNumber
  });

  return this.save();
};

const User = mongoose.model('User', userSchema);
module.exports = User;