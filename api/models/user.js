const mongoose = require('mongoose');
const validator = require('validator');
const bcrypt = require('bcrypt'); 
const { formatDistanceToNow } = require('date-fns');

const userSchema = new mongoose.Schema({
  // Basic Information (unchanged)
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

  // [Previous profile information fields remain unchanged...]

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
      mpesaCode: { // Changed from transactionId to mpesaCode
        type: String,
        validate: {
          validator: v => /^[A-Z0-9]{10}$/.test(v), // MPesa transaction code format
          message: 'Invalid M-Pesa transaction code'
        }
      },
      phoneNumber: { // Store the paying phone number
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

  // [Rest of your schema remains unchanged...]

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
  }
});

// [Previous indexes, virtuals, and methods remain unchanged...]

// Add M-Pesa specific method
userSchema.methods.initiateMpesaPayment = async function() {
  // This would call your M-Pesa API integration
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