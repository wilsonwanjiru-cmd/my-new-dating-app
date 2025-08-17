const mongoose = require('mongoose');
const { Schema } = mongoose;

const subscriptionSchema = new Schema({
  // Core Subscription Fields
  user: {
    type: Schema.Types.ObjectId,
    ref: 'User',
    required: [true, 'User reference is required'],
    unique: true,
    index: true
  },
  status: {
    type: String,
    enum: ['active', 'expired', 'pending', 'cancelled'],
    default: 'pending',
    index: true
  },
  planType: {
    type: String,
    default: '24hr_chat',
    immutable: true
  },

  // Payment Details (MPesa Specific)
  mpesaReference: {
    type: String,
    required: [true, 'MPesa reference code is required'],
    trim: true,
    index: true
  },
  phoneNumber: {
    type: String,
    required: [true, 'Phone number is required'],
    match: [/^\+?254[17]\d{8}$/, 'Please use a valid Kenyan phone number'],
    index: true
  },
  amount: {
    type: Number,
    required: true,
    min: [10, 'Minimum subscription amount is KES 10'],
    default: 10,
    set: v => Math.round(v * 100) / 100 // Ensure 2 decimal places
  },

  // Timing Controls (Critical for 24hr model)
  activatedAt: {
    type: Date,
    default: Date.now
  },
  expiresAt: {
    type: Date,
    required: [true, 'Expiration date is required'],
    index: true
  },
  lastRenewalAt: Date,

  // Metadata
  paymentMethod: {
    type: String,
    default: 'mpesa',
    enum: ['mpesa', 'card', 'wallet']
  },
  deviceInfo: {
    ipAddress: String,
    userAgent: String
  }
}, {
  timestamps: true,
  toJSON: { 
    virtuals: true,
    transform: function(doc, ret) {
      ret.id = ret._id;
      delete ret._id;
      delete ret.__v;
      delete ret.deviceInfo;
      return ret;
    }
  }
});

// ======================
// INDEXES (Optimized for Ruda)
// ======================
subscriptionSchema.index({ user: 1, status: 1 });
subscriptionSchema.index({ expiresAt: 1 });
subscriptionSchema.index({ mpesaReference: 1 }, { unique: true });

// ======================
// VIRTUAL PROPERTIES
// ======================
subscriptionSchema.virtual('isActive').get(function() {
  return this.status === 'active' && this.expiresAt > new Date();
});

subscriptionSchema.virtual('hoursRemaining').get(function() {
  const diff = this.expiresAt - new Date();
  return Math.max(0, Math.ceil(diff / (1000 * 60 * 60)));
});

subscriptionSchema.virtual('minutesRemaining').get(function() {
  const diff = this.expiresAt - new Date();
  return Math.max(0, Math.ceil(diff / (1000 * 60)));
});

// ======================
// PRE-SAVE HOOKS
// ======================
subscriptionSchema.pre('save', function(next) {
  // Auto-set expiration to 24 hours if not specified
  if (!this.expiresAt && this.isNew) {
    const now = new Date();
    this.expiresAt = new Date(now.setHours(now.getHours() + 24));
  }

  // Auto-update status based on expiration
  if (this.expiresAt < new Date() && this.status === 'active') {
    this.status = 'expired';
  }

  next();
});

// ======================
// STATIC METHODS (Ruda-Specific)
// ======================

/**
 * Creates a new 24-hour chat subscription
 */
subscriptionSchema.statics.createMpesaSubscription = async function(
  userId, 
  mpesaData,
  deviceInfo = {}
) {
  // Prevent duplicate subscriptions
  const existing = await this.findOne({ user: userId, status: 'active' });
  if (existing && existing.expiresAt > new Date()) {
    throw new Error('User already has an active subscription');
  }

  return this.create({
    user: userId,
    mpesaReference: mpesaData.reference,
    phoneNumber: mpesaData.phone,
    amount: mpesaData.amount || 10,
    status: 'active',
    deviceInfo: {
      ipAddress: deviceInfo.ip,
      userAgent: deviceInfo.userAgent
    }
  });
};

/**
 * Renews an existing subscription for another 24 hours
 */
subscriptionSchema.statics.renewSubscription = async function(
  userId,
  mpesaData
) {
  const subscription = await this.findOne({ user: userId });
  if (!subscription) {
    throw new Error('No existing subscription found');
  }

  subscription.mpesaReference = mpesaData.reference;
  subscription.phoneNumber = mpesaData.phone;
  subscription.amount = mpesaData.amount || 10;
  subscription.status = 'active';
  subscription.lastRenewalAt = new Date();
  
  // Reset expiration to 24 hours from now
  const now = new Date();
  subscription.expiresAt = new Date(now.setHours(now.getHours() + 24));

  return subscription.save();
};

/**
 * Gets active subscription status for user
 */
subscriptionSchema.statics.getUserStatus = async function(userId) {
  return this.findOne({ 
    user: userId,
    status: 'active',
    expiresAt: { $gt: new Date() }
  });
};

// ======================
// INSTANCE METHODS
// ======================

/**
 * Checks if subscription is currently active
 */
subscriptionSchema.methods.checkStatus = function() {
  const isActive = this.status === 'active' && this.expiresAt > new Date();
  return {
    isActive,
    status: this.status,
    planType: this.planType,
    expiresAt: this.expiresAt,
    hoursRemaining: this.hoursRemaining,
    minutesRemaining: this.minutesRemaining
  };
};

/**
 * Cancels the subscription (immediate effect)
 */
subscriptionSchema.methods.cancel = function() {
  this.status = 'cancelled';
  this.expiresAt = new Date(); // Immediate expiration
  return this.save();
};

const Subscription = mongoose.model('Subscription', subscriptionSchema);

module.exports = Subscription;