const mongoose = require('mongoose');
const { Schema } = mongoose;

const subscriptionSchema = new Schema({
  user: {
    type: Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    unique: true
  },
  isActive: {
    type: Boolean,
    default: false
  },
  startsAt: {
    type: Date,
    default: Date.now
  },
  expiresAt: {
    type: Date,
    required: true
  },
  mpesaCode: {
    type: String,
    required: true,
    trim: true
  },
  phoneNumber: {
    type: String,
    required: true,
    match: [/^\+?254[17]\d{8}$/, 'Please use a valid Mpesa phone number']
  },
  amount: {
    type: Number,
    required: true,
    min: [10, 'Minimum subscription amount is KES 10'],
    default: 10
  }
}, {
  timestamps: true,
  toJSON: { virtuals: true }
});

// Virtual for checking if subscription is active (not expired)
subscriptionSchema.virtual('isValid').get(function() {
  return this.isActive && this.expiresAt > new Date();
});

// Virtual for hours remaining
subscriptionSchema.virtual('hoursRemaining').get(function() {
  if (!this.expiresAt) return 0;
  const diff = this.expiresAt - new Date();
  return Math.ceil(diff / (1000 * 60 * 60)); // Convert to hours
});

// Pre-save hook to set expiration to 24 hours from creation
subscriptionSchema.pre('save', function(next) {
  if (!this.expiresAt) {
    const now = new Date();
    this.expiresAt = new Date(now.setHours(now.getHours() + 24));
  }
  
  // Automatically set active status
  this.isActive = this.expiresAt > new Date();
  next();
});

// Static method to create a new Mpesa subscription
subscriptionSchema.statics.createMpesaSubscription = async function(userId, mpesaData) {
  const subscription = new this({
    user: userId,
    mpesaCode: mpesaData.mpesaCode,
    phoneNumber: mpesaData.phoneNumber,
    amount: mpesaData.amount || 10
  });
  
  return await subscription.save();
};

// Method to check if subscription is active
subscriptionSchema.methods.checkStatus = function() {
  return {
    isActive: this.isActive && this.expiresAt > new Date(),
    expiresAt: this.expiresAt,
    hoursRemaining: this.hoursRemaining
  };
};

const Subscription = mongoose.model('Subscription', subscriptionSchema);

module.exports = Subscription;