const mongoose = require("mongoose");
const validator = require("validator"); // Install this package using `npm install validator`

const userSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, "Name is required"],
      trim: true,
    },
    email: {
      type: String,
      required: [true, "Email is required"],
      unique: true,
      lowercase: true,
      trim: true,
      validate: {
        validator: (v) => validator.isEmail(v), // Use validator library for email validation
        message: (props) => `${props.value} is not a valid email address!`,
      },
    },
    password: {
      type: String,
      required: [true, "Password is required"],
      minlength: [8, "Password must be at least 8 characters long"],
    },
    gender: {
      type: String,
      enum: ["male", "female", "other"],
      default: "other",
    },
    verified: {
      type: Boolean,
      default: false, // Default to false until email is verified
    },
    verificationToken: {
      type: String,
      select: false, // Prevent it from being returned in queries by default
    },
    crushes: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User", // Reference to other User documents
      },
    ],
    profileImages: [
      {
        type: String,
        validate: {
          validator: (v) =>
            /^https?:\/\/.+\.(jpg|jpeg|png|gif|webp|avif)$/i.test(v), // URL format validation for image files
          message: (props) => `${props.value} is not a valid image URL!`,
        },
      },
    ],
    description: {
      type: String,
      maxlength: [500, "Description cannot exceed 500 characters"],
      default: "", // Default to an empty string
    },
    turnOns: [
      {
        type: String,
        trim: true,
      },
    ],
    lookingFor: [
      {
        type: String,
        trim: true,
      },
    ],
    isSubscribed: {
      type: Boolean,
      default: false, // Default to false (user is not subscribed)
    },
    subscriptionExpires: {
      type: Date,
      default: null, // Default to null (no subscription expiry date)
    },
  },
  {
    timestamps: true, // Automatically create `createdAt` and `updatedAt` fields
  }
);

const User = mongoose.model("User", userSchema);
module.exports = User;