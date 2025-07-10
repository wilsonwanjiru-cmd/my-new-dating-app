const mongoose = require("mongoose");
const validator = require("validator");

const userSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, "Name is required"],
      trim: true,
      minlength: [2, "Name must be at least 2 characters"],
      maxlength: [50, "Name cannot exceed 50 characters"]
    },
    email: {
      type: String,
      required: [true, "Email is required"],
      unique: true,
      lowercase: true,
      trim: true,
      validate: {
        validator: (v) => validator.isEmail(v),
        message: (props) => `${props.value} is not a valid email address!`,
      },
      index: true
    },
    password: {
      type: String,
      required: [true, "Password is required"],
      minlength: [8, "Password must be at least 8 characters long"],
      select: false // Never return password in queries
    },
    gender: {
      type: String,
      enum: ["male", "female", "other", "prefer-not-to-say"],
      default: "prefer-not-to-say",
    },
    birthDate: {
      type: Date,
      validate: {
        validator: function(v) {
          return v < new Date(new Date().setFullYear(new Date().getFullYear() - 18));
        },
        message: "User must be at least 18 years old"
      }
    },
    crushes: [{
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: []
    }],
    matches: [{
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: []
    }],
    receivedLikes: [{
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: []
    }],
    profileImages: [{
      type: String,
      validate: {
        validator: (v) => /^https?:\/\/.+\.(jpg|jpeg|png|gif|webp|avif)$/i.test(v),
        message: (props) => `${props.value} is not a valid image URL!`
      },
      default: []
    }],
    description: {
      type: String,
      maxlength: [500, "Description cannot exceed 500 characters"],
      default: "",
      trim: true
    },
    interests: [{
      type: String,
      trim: true,
      maxlength: [30, "Interest cannot exceed 30 characters"],
      default: []
    }],
    location: {
      type: {
        type: String,
        default: "Point",
        enum: ["Point"]
      },
      coordinates: {
        type: [Number], // [longitude, latitude]
        default: [0, 0]
      },
      address: String
    },
    isVerified: {
      type: Boolean,
      default: false
    },
    isSubscribed: {
      type: Boolean,
      default: false
    },
    subscriptionExpires: {
      type: Date,
      default: null
    },
    lastActive: {
      type: Date,
      default: Date.now
    }
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true }
  }
);

// Indexes for better query performance
userSchema.index({ email: 1 }); // Already unique from schema definition
userSchema.index({ location: "2dsphere" });
userSchema.index({ lastActive: -1 });
userSchema.index({ isSubscribed: 1 });

// Virtual for age calculation
userSchema.virtual('age').get(function() {
  if (!this.birthDate) return null;
  const diff = Date.now() - this.birthDate.getTime();
  return Math.floor(diff / (1000 * 60 * 60 * 24 * 365.25));
});

// Middleware to clean data before saving
userSchema.pre('save', function(next) {
  // Trim all string fields
  for (const key in this._doc) {
    if (typeof this[key] === 'string') {
      this[key] = this[key].trim();
    }
  }
  next();
});

const User = mongoose.model("User", userSchema);
module.exports = User;