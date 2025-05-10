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
const healthRoutes = require('./routes/healthRoutes');

// Import database connection
const connectDB = require("./config/db");

// Initialize app
const app = express();
const server = http.createServer(app);

// ========== ENHANCED CORS CONFIGURATION ========== //
const allowedOrigins = [
  'http://localhost:19006',       // Expo web
  'exp://192.168.249.233:8081',  // Your Expo Go URL (from your logs)
  'http://192.168.249.233:8081', // Alternative for web
  'http://localhost:5000',       // Your backend
  'https://dating-apps.onrender.com' // Your production URL
];

const corsOptions = {
  origin: function (origin, callback) {
    // Allow requests with no origin (like mobile apps or curl requests)
    if (!origin) return callback(null, true);
    
    if (allowedOrigins.indexOf(origin) !== -1 || allowedOrigins.some(allowedOrigin => {
      return origin.startsWith(allowedOrigin.replace('*', ''));
    })) {
      callback(null, true);
    } else {
      console.warn(`⚠️ Blocked by CORS: ${origin}`);
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With']
};

// Apply CORS middleware
app.use(cors(corsOptions));

// Configure CORS for Socket.IO
const io = new Server(server, {
  cors: {
    origin: allowedOrigins,
    methods: ["GET", "POST"],
    credentials: true
  },
  connectionStateRecovery: {
    maxDisconnectionDuration: 2 * 60 * 1000, // 2 minutes
    skipMiddlewares: true
  }
});

// ========== ENHANCED MIDDLEWARE ========== //
app.use(express.json({ limit: '10mb' })); // Increased payload size
app.use(express.urlencoded({ extended: true }));

// Enhanced request logging middleware
app.use((req, res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.originalUrl}`, {
    headers: req.headers,
    body: req.body
  });
  next();
});

// Add security headers
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('X-XSS-Protection', '1; mode=block');
  next();
});

// Connect to MongoDB
connectDB();

// Database connection events
mongoose.connection.on("connected", () => {
  console.log("✅ Connected to MongoDB successfully");
  console.log(`Database: ${mongoose.connection.db.databaseName}`);
  console.log(`Models: ${Object.keys(mongoose.connection.models).join(', ')}`);
});

mongoose.connection.on("error", (err) => {
  console.error("❌ MongoDB connection error:", err.message);
  process.exit(1); // Exit on DB connection error
});

// ========== ROUTE REGISTRATION ========== //
// Debugging route to test basic routing
app.get('/api/debug-test', (req, res) => {
  res.json({ 
    message: "Debug route working!",
    timestamp: new Date().toISOString(),
    headers: req.headers,
    environment: process.env.NODE_ENV || 'development'
  });
});

// API Routes
app.use("/api/auth", authRoutes);
app.use("/api/chat", chatRoutes);
app.use("/api/email", emailRoutes);
app.use("/api/match", matchRoutes);
app.use("/api/message", messageRoutes);
app.use("/api/users", userRoutes);
app.use("/api/payments", paymentRoutes);
app.use("/api/photos", photoRoutes);
app.use('/api/health', healthRoutes);

// Route registration debug
console.log('🚀 Routes registered:');
const routes = [
  { path: '/api/auth', methods: Object.keys(authRoutes.stack.reduce((acc, layer) => {
    if (layer.route) acc[layer.route.stack[0].method] = true;
    return acc;
  }, {})) },
  { path: '/api/chat', methods: ['GET', 'POST'] },
  { path: '/api/health', methods: ['GET'] }
  // Add other routes as needed
];

console.table(routes);

// Default route
app.get("/", (req, res) => {
  res.json({ 
    message: "Welcome to the My New Dating App API!",
    endpoints: routes,
    status: 'healthy',
    timestamp: new Date().toISOString()
  });
});

// 404 Handler for unmatched routes
app.use((req, res, next) => {
  console.error(`⚠️ 404: No route for ${req.method} ${req.originalUrl}`);
  res.status(404).json({ 
    message: "Endpoint not found",
    requestedUrl: req.originalUrl,
    availableEndpoints: routes
  });
});

// Global error handler
app.use((err, req, res, next) => {
  console.error("🔥 Error:", {
    message: err.message,
    stack: err.stack,
    url: req.originalUrl,
    method: req.method,
    body: req.body
  });

  res.status(err.status || 500).json({
    error: {
      message: err.message || "Internal Server Error",
      code: err.code,
      timestamp: new Date().toISOString()
    }
  });
});

// ========== SOCKET.IO ENHANCEMENTS ========== //
io.on("connection", (socket) => {
  console.log(`⚡ Socket connected: ${socket.id} from ${socket.handshake.headers.origin}`);

  // Add authentication middleware for sockets
  socket.use((packet, next) => {
    const [event, data] = packet;
    console.log(`Socket event: ${event}`, data);
    next();
  });

  socket.on("sendMessage", async (data) => {
    try {
      const { senderId, receiverId, message, attachments } = data;
      const Chat = require("./models/Chat");

      const newMessage = new Chat({
        senderId,
        receiverId,
        message,
        attachments,
        delivered: false,
        read: false,
        timestamp: new Date()
      });
      
      const savedMessage = await newMessage.save();
      
      io.to(receiverId).emit("receiveMessage", savedMessage);
      socket.emit("messageDelivered", { 
        messageId: savedMessage._id,
        timestamp: new Date() 
      });
    } catch (error) {
      console.error("Socket error:", error);
      socket.emit("messageError", { 
        error: error.message,
        originalMessage: data 
      });
    }
  });

  socket.on("disconnect", (reason) => {
    console.log(`Socket disconnected (${reason}): ${socket.id}`);
  });

  socket.on("error", (err) => {
    console.error(`Socket error (${socket.id}):`, err);
  });
});

// ========== SERVER STARTUP ========== //
const PORT = process.env.PORT || 5000;
const HOST = process.env.HOST || '0.0.0.0';

server.listen(PORT, HOST, () => {
  console.log(`🚀 Server running on http://${HOST}:${PORT}`);
  console.log('🔒 CORS-protected origins:', allowedOrigins);
  console.log('Try these endpoints:');
  console.log(`- GET http://${HOST}:${PORT}/api/debug-test`);
  console.log(`- GET http://${HOST}:${PORT}/api/health`);
  console.log(`- POST http://${HOST}:${PORT}/api/auth/login`);
});

// Handle shutdown gracefully
process.on('SIGTERM', () => {
  console.log('SIGTERM received. Shutting down gracefully...');
  server.close(() => {
    console.log('HTTP server closed.');
    mongoose.connection.close(false, () => {
      console.log('MongoDB connection closed.');
      process.exit(0);
    });
  });
});

process.on('SIGINT', () => {
  console.log('SIGINT received. Shutting down...');
  server.close(() => {
    mongoose.connection.close(false, () => process.exit(0));
  });
});