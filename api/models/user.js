const mongoose = require("mongoose");

const userSchema = new mongoose.Schema({
    name: {
        type: String,
        required: true,
    },
    email: {
        type: String,
        required: true,
        unique: true,
    },
    password: {
        type: String,
        required: true,
    },
    gender: {
        type: String,
        enum: ["male", "female", "other"],
    },
    verified: {
        type: Boolean,
        default: false,
    },
    verification: String,
    crushes: [
        {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
        },
    ],
    profileImages: [
        {
            type: String,
        },
    ],
    description: {
        type: String,
    },
    turnOns: [
        {
            type: String,
        },
    ],
    lookingFor: [
        {
            type: String,
        },
    ],
});

const User = mongoose.model("User", userSchema);
module.exports = User;
