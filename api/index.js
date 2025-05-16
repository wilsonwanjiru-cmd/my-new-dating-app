const express = require("express");
const mongoose = require("mongoose");
const dotenv = require("dotenv");
const cors = require("cors");
const http = require("http");
const { Server } = require("socket.io");
const os = require("os");
const process = require("process");

// Load environment variables
dotenv.config();

// Constants
const PRODUCTION_URL = 'https://api.rudadatingsite.singles/';
const IS_PRODUCTION = process.env.NODE_ENV === 'production';
const PORT = process.env.PORT || 5000;
const HOST = process.env.HOST || '0.0.0.0';

// Initialize Express and HTTP Server
const app = express();
const server = http.createServer(app);

// ========== CORS CONFIGURATION ==========
const allowedOrigins = [
  'http://localhost:19006',
  'exp://192.168.249.233:8081',
  'http://192.168.249.233:8081',
  'http://localhost:5000',
  PRODUCTION_URL,
  'https://api.rudadatingsite.singles/',
];

const corsOptions = {
  origin(origin, callback) {
    if (!origin || allowedOrigins.some(o => origin.startsWith(o))) {
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

app.use(cors(corsOptions));

// ========== FORCE HTTPS IN PRODUCTION ==========
app.set('trust proxy', 1);
if (IS_PRODUCTION) {
  app.use((req, res, next) => {
    if (req.headers['x-forwarded-proto'] !== 'https') {
      return res.redirect(`https://${req.headers.host}${req.url}`);
    }
    next();
  });
}

// ========== MIDDLEWARE ==========
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Logging middleware
app.use((req, res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.originalUrl}`);
  next();
});

// Basic security headers
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('X-XSS-Protection', '1; mode=block');
  if (IS_PRODUCTION) {
    res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  }
  next();
});

// ========== DATABASE ==========
const connectDB = require("./config/db");
connectDB();

mongoose.connection.on("connected", () => {
  console.log("✅ MongoDB connected to:", mongoose.connection.db.databaseName);
});

mongoose.connection.on("error", (err) => {
  console.error("❌ MongoDB connection error:", err.message);
  process.exit(1);
});

// ========== ROUTES ==========
const authRoutes = require("./routes/authRoutes");
const chatRoutes = require("./routes/chatRoutes");
const emailRoutes = require("./routes/emailRoutes");
const matchRoutes = require("./routes/matchRoutes");
const messageRoutes = require("./routes/messageRoutes");
const userRoutes = require("./routes/userRoutes");
const paymentRoutes = require("./routes/paymentRoutes");
const photoRoutes = require("./routes/photoRoutes");
const healthRoutes = require("./routes/healthRoutes");

// Health check route first
app.use("/api", healthRoutes);

// Main API routes
app.use("/api/auth", authRoutes);
app.use("/api/chat", chatRoutes);
app.use("/api/email", emailRoutes);
app.use("/api/match", matchRoutes);
app.use("/api/message", messageRoutes);
app.use("/api/users", userRoutes);
app.use("/api/payments", paymentRoutes);
app.use("/api/photos", photoRoutes);

// System info endpoint
app.get("/api/system-info", (req, res) => {
  res.json({
    status: 'operational',
    timestamp: new Date().toISOString(),
    system: {
      platform: os.platform(),
      uptime: os.uptime(),
      memory: {
        total: os.totalmem(),
        free: os.freemem()
      }
    },
    database: {
      status: mongoose.connection.readyState === 1 ? 'connected' : 'disconnected'
    }
  });
});

// Debug test route
app.get("/api/debug-test", (req, res) => {
  res.json({
    status: 'ok',
    environment: process.env.NODE_ENV || 'development',
    timestamp: new Date().toISOString()
  });
});

// API overview route
app.get("/", (req, res) => {
  res.json({
    message: "Ruda Dating App API",
    status: "healthy",
    timestamp: new Date().toISOString(),
    endpoints: [
      { path: '/api/health', methods: ['GET'] },
      { path: '/api/auth', methods: ['POST'] },
      { path: '/api/chat', methods: ['GET', 'POST'] },
      { path: '/api/debug-test', methods: ['GET'] },
      { path: '/api/system-info', methods: ['GET'] }
    ]
  });
});

// 404 Handler
app.use((req, res) => {
  res.status(404).json({
    message: "Endpoint not found",
    requestedUrl: req.originalUrl,
    help: "Try GET /api/health or GET /api/debug-test"
  });
});

// Error Handler
app.use((err, req, res, next) => {
  console.error("Unhandled Error:", err.message);
  res.status(err.status || 500).json({
    error: err.message,
    timestamp: new Date().toISOString()
  });
});

// ========== SOCKET.IO ==========
const io = new Server(server, {
  cors: {
    origin: allowedOrigins,
    methods: ["GET", "POST"],
    credentials: true
  },
  connectionStateRecovery: {
    maxDisconnectionDuration: 2 * 60 * 1000,
    skipMiddlewares: true
  }
});

io.on("connection", (socket) => {
  console.log(`🔌 Socket connected: ${socket.id}`);

  socket.on("sendMessage", async (data) => {
    try {
      const Chat = require("./models/Chat");
      const newMessage = new Chat({
        ...data,
        timestamp: new Date()
      });
      const savedMessage = await newMessage.save();
      io.to(data.receiverId).emit("receiveMessage", savedMessage);
    } catch (error) {
      console.error("Socket Error:", error);
    }
  });

  socket.on("disconnect", () => {
    console.log(`⚡ Socket disconnected: ${socket.id}`);
  });
});

// ========== START SERVER ==========
server.listen(PORT, HOST, () => {
  console.log(`
  🚀 Server running at http://${HOST}:${PORT}
  Environment: ${process.env.NODE_ENV || 'development'}
  MongoDB: ${mongoose.connection.readyState === 1 ? 'connected' : 'disconnected'}
  `);
});

// ========== GRACEFUL SHUTDOWN ==========
process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);

function shutdown() {
  console.log("🛑 Shutting down gracefully...");
  server.close(() => {
    mongoose.connection.close(false, () => {
      console.log("✅ Server and MongoDB connection closed.");
      process.exit(0);
    });
  });
}
