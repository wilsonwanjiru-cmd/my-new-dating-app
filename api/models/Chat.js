const mongoose = require("mongoose");

// Define the schema for chat messages
const chatSchema = new mongoose.Schema({
  senderId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true,
  },
  receiverId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true,
  },
  message: {
    type: String,
    required: true,
  },
  isRead: {
    type: Boolean,
    default: false, // Indicates if the message has been read by the receiver
  },
  attachments: [
    {
      url: {
        type: String,
        required: false, // URL of the attached file (if any)
      },
      fileType: {
        type: String,
        required: false, // Type of the file (e.g., image, video, document)
      },
    },
  ],
  deletedBy: {
    type: [mongoose.Schema.Types.ObjectId],
    ref: "User",
    default: [], // Tracks users who have deleted the message
  },
  timestamp: {
    type: Date,
    default: Date.now, // Automatically set to the current date and time
  },
});

// Index for faster queries based on senderId and receiverId
chatSchema.index({ senderId: 1, receiverId: 1, timestamp: -1 });

// Define virtual field for conversation grouping
chatSchema.virtual("conversationId").get(function () {
  // Group conversations based on the participants (sender + receiver)
  return [this.senderId, this.receiverId].sort().join("_");
});

// Create the model
const Chat = mongoose.model("Chat", chatSchema);

// Export the model
module.exports = Chat;

