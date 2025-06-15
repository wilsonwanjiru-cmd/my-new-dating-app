const mongoose = require("mongoose");
const validator = require("validator"); // Ensure this is installed: npm install validator

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
        validator: (v) => validator.isEmail(v),
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
    crushes: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
      },
    ],
    receivedLikes: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
      },
    ],
    profileImages: [
      {
        type: String,
        validate: {
          validator: (v) =>
            /^https?:\/\/.+\.(jpg|jpeg|png|gif|webp|avif)$/i.test(v),
          message: (props) => `${props.value} is not a valid image URL!`,
        },
      },
    ],
    description: {
      type: String,
      maxlength: [500, "Description cannot exceed 500 characters"],
      default: "",
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
      default: false,
    },
    subscriptionExpires: {
      type: Date,
      default: null,
    },
  },
  {
    timestamps: true,
  }
);

const User = mongoose.model("User", userSchema);
module.exports = User;
