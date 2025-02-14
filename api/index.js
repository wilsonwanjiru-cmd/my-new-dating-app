const express = require("express");
const mongoose = require("mongoose");
const dotenv = require("dotenv");
const cors = require("cors");
const http = require("http");
const { Server } = require("socket.io");

// Load environment variables
dotenv.config();

// Import routes
const authRoutes = require("./routes/authRoutes");
const chatRoutes = require("./routes/chatRoutes");
const emailRoutes = require("./routes/emailRoutes");
const matchRoutes = require("./routes/matchRoutes");
const messageRoutes = require("./routes/messageRoutes");
const userRoutes = require("./routes/userRoutes");
const paymentRoutes = require("./routes/paymentRoutes");
const photoRoutes = require("./routes/photoRoutes");

// Import database connection
const connectDB = require("./config/db");

// Initialize app
const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: "*", // Restrict this to your frontend URL in production
    methods: ["GET", "POST"],
  },
});

// Middleware
app.use(cors()); // Enable Cross-Origin Resource Sharing
app.use(express.json()); // Parse incoming JSON requests

// Log all incoming requests for debugging
app.use((req, res, next) => {
  console.log(`${req.method} ${req.url}`);
  next();
});

// Connect to MongoDB
connectDB();

// Verify database connection
mongoose.connection.on("connected", () => {
  console.log("Connected to MongoDB successfully");
});

mongoose.connection.on("error", (err) => {
  console.error("Error connecting to MongoDB:", err.message);
});

// Routes
app.use("/api/auth", authRoutes); // Authentication routes
app.use("/api/chat", chatRoutes); // Chat routes
app.use("/api/email", emailRoutes); // Email verification routes
app.use("/api/match", matchRoutes); // Match routes
app.use("/api/message", messageRoutes); // Message routes
app.use("/api/user", userRoutes); // User routes
app.use("/api/payments", paymentRoutes); // Payment routes
app.use("/api/photos", photoRoutes); // Photo routes
app.use("/api/users", userRoutes);

// Default route
app.get("/", (req, res) => {
  res.send("Welcome to the My New Dating App API!");
});

// 404 Handler for unmatched routes
app.use((req, res) => {
  res.status(404).json({ message: "Endpoint not found" });
});

// Global error handler
app.use((err, req, res, next) => {
  console.error("Error:", err.message);
  res.status(err.status || 500).json({
    message: err.message || "Internal Server Error",
  });
});

// Socket.IO setup for real-time messaging
io.on("connection", (socket) => {
  console.log("A user connected");

  // Listen for 'sendMessage' events
  socket.on("sendMessage", async (data) => {
    try {
      const { senderId, receiverId, message, attachments } = data;
      const Chat = require("./models/Chat");

      // Save the message to the database
      const newMessage = new Chat({
        senderId,
        receiverId,
        message,
        attachments,
      });
      await newMessage.save();

      // Emit the message to the receiver in real-time
      io.to(receiverId).emit("receiveMessage", newMessage);
    } catch (error) {
      console.error("Error handling message:", error);
    }
  });

  // Handle user disconnection
  socket.on("disconnect", () => {
    console.log("User disconnected");
  });
});

// Start the server
const PORT = process.env.PORT || 5000;
server.listen(PORT, () => {
  console.log(`Server is running on http://localhost:${PORT}`);
});