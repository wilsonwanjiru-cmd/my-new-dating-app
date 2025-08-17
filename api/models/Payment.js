const mongoose = require('mongoose');
const { Schema } = mongoose;

const paymentSchema = new Schema({
  // Core Payment Fields
  user: {
    type: Schema.Types.ObjectId,
    ref: 'User',
    required: [true, 'User reference is required'],
    index: true
  },
  subscription: {
    type: Schema.Types.ObjectId,
    ref: 'Subscription',
    index: true
  },

  // Payment Details (MPesa Focused)
  amount: {
    type: Number,
    required: [true, 'Amount is required'],
    min: [10, 'Minimum payment amount is KES 10'],
    get: v => Math.round(v * 100) / 100 // Ensure 2 decimal places
  },
  currency: {
    type: String,
    default: 'KES',
    enum: ['KES'],
    immutable: true
  },
  paymentMethod: {
    type: String,
    required: true,
    default: 'mpesa',
    enum: ['mpesa'], // Only MPesa supported for now
    immutable: true
  },

  // MPesa Specific Fields
  mpesaReference: {
    type: String,
    required: [true, 'MPesa reference is required'],
    trim: true,
    unique: true,
    index: true
  },
  mpesaCode: {
    type: String,
    required: [true, 'MPesa transaction code is required'],
    trim: true,
    index: true
  },
  phoneNumber: {
    type: String,
    required: [true, 'Phone number is required'],
    match: [/^\+?254[17]\d{8}$/, 'Please use a valid Kenyan phone number'],
    index: true
  },

  // Payment Status & Timing
  status: {
    type: String,
    required: true,
    enum: ['initiated', 'processing', 'completed', 'failed', 'cancelled'],
    default: 'initiated',
    index: true
  },
  initiatedAt: {
    type: Date,
    default: Date.now
  },
  completedAt: Date,
  expiresAt: {
    type: Date,
    default: () => new Date(Date.now() + 30 * 60 * 1000) // 30 minutes expiration
  },

  // Metadata
  purpose: {
    type: String,
    required: true,
    default: 'chat_subscription',
    enum: ['chat_subscription', 'premium_features', 'gift'],
    index: true
  },
  deviceInfo: {
    ipAddress: String,
    userAgent: String
  },
  callbackData: Schema.Types.Mixed // For storing MPesa callback payload
}, {
  timestamps: true,
  toJSON: { 
    virtuals: true,
    getters: true,
    transform: function(doc, ret) {
      ret.id = ret._id;
      delete ret._id;
      delete ret.__v;
      delete ret.deviceInfo;
      delete ret.callbackData;
      return ret;
    }
  }
});

// ======================
// INDEXES (Optimized for Ruda)
// ======================
paymentSchema.index({ user: 1, status: 1 });
paymentSchema.index({ mpesaReference: 1 }, { unique: true });
paymentSchema.index({ mpesaCode: 1 }, { unique: true });
paymentSchema.index({ createdAt: -1 });
paymentSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

// ======================
// VIRTUAL PROPERTIES
// ======================
paymentSchema.virtual('isExpired').get(function() {
  return this.expiresAt < new Date() && this.status !== 'completed';
});

paymentSchema.virtual('isSuccessful').get(function() {
  return this.status === 'completed';
});

paymentSchema.virtual('paymentUrl').get(function() {
  if (this.paymentMethod === 'mpesa') {
    return `/api/payments/mpesa/confirm/${this.mpesaReference}`;
  }
  return null;
});

// ======================
// PRE-SAVE HOOKS
// ======================
paymentSchema.pre('save', function(next) {
  // Auto-update completedAt when payment completes
  if (this.isModified('status') && this.status === 'completed') {
    this.completedAt = new Date();
  }

  // Auto-cancel expired payments
  if (this.isExpired && this.status === 'initiated') {
    this.status = 'cancelled';
  }

  next();
});

// ======================
// STATIC METHODS (Ruda-Specific)
// ======================

/**
 * Creates a new MPesa payment for chat subscription
 */
paymentSchema.statics.createMpesaPayment = async function(
  userId,
  phoneNumber,
  amount = 10,
  purpose = 'chat_subscription',
  deviceInfo = {}
) {
  // Validate amount for chat subscriptions
  if (purpose === 'chat_subscription' && amount < 10) {
    throw new Error('Chat subscription requires minimum KES 10');
  }

  return this.create({
    user: userId,
    amount: amount,
    phoneNumber: phoneNumber,
    purpose: purpose,
    status: 'initiated',
    deviceInfo: {
      ipAddress: deviceInfo.ip,
      userAgent: deviceInfo.userAgent
    }
  });
};

/**
 * Completes an MPesa payment
 */
paymentSchema.statics.completeMpesaPayment = async function(
  reference,
  mpesaCode,
  callbackData
) {
  return this.findOneAndUpdate(
    { mpesaReference: reference },
    { 
      mpesaCode: mpesaCode,
      status: 'completed',
      callbackData: callbackData,
      completedAt: new Date()
    },
    { new: true }
  );
};

/**
 * Gets user's payment history
 */
paymentSchema.statics.getUserPayments = async function(
  userId,
  limit = 10,
  page = 1
) {
  return this.find({ user: userId })
    .sort({ createdAt: -1 })
    .skip((page - 1) * limit)
    .limit(limit);
};

// ======================
// INSTANCE METHODS
// ======================

/**
 * Checks if payment can be processed
 */
paymentSchema.methods.canProcess = function() {
  return !this.isExpired && this.status === 'initiated';
};

/**
 * Formats payment for client response
 */
paymentSchema.methods.toResponse = function() {
  return {
    id: this._id,
    amount: this.amount,
    currency: this.currency,
    status: this.status,
    paymentMethod: this.paymentMethod,
    purpose: this.purpose,
    createdAt: this.createdAt,
    expiresAt: this.expiresAt,
    isExpired: this.isExpired,
    paymentUrl: this.paymentUrl
  };
};

const Payment = mongoose.model('Payment', paymentSchema);

module.exports = Payment;