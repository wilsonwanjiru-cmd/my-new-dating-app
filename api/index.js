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
const PRODUCTION_URL = 'https://ruda-backend.onrender.com';
const IS_PRODUCTION = process.env.NODE_ENV === 'production';

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

// ========== CORS CONFIGURATION ========== //
const allowedOrigins = [
  'http://localhost:19006',
  'exp://192.168.249.233:8081',
  'http://192.168.249.233:8081',
  'http://localhost:5000',
  PRODUCTION_URL,
  'https://dating-apps.onrender.com'
];

const corsOptions = {
  origin: function (origin, callback) {
    if (!origin) return callback(null, true);
    if (allowedOrigins.some(allowedOrigin => origin.startsWith(allowedOrigin))) {
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

// ========== FORCE HTTPS IN PRODUCTION ========== //
app.set('trust proxy', 1); // Trust proxy headers from Render

if (IS_PRODUCTION) {
  app.use((req, res, next) => {
    if (req.headers['x-forwarded-proto'] !== 'https') {
      return res.redirect(`https://${req.headers.host}${req.url}`);
    }
    next();
  });
}

// ========== MIDDLEWARE ========== //
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Request logging
app.use((req, res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.originalUrl}`);
  next();
});

// Security headers
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('X-XSS-Protection', '1; mode=block');
  if (IS_PRODUCTION) {
    res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  }
  next();
});

// Connect to MongoDB
connectDB();

mongoose.connection.on("connected", () => {
  console.log("✅ MongoDB connected to:", mongoose.connection.db.databaseName);
});

mongoose.connection.on("error", (err) => {
  console.error("❌ MongoDB error:", err.message);
  process.exit(1);
});

// ========== ROUTES ========== //
// Debug route
app.get('/api/debug-test', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV || 'development'
  });
});

// API Routes - Health routes first
app.use('/api', healthRoutes);
app.use("/api/auth", authRoutes);
app.use("/api/chat", chatRoutes);
app.use("/api/email", emailRoutes);
app.use("/api/match", matchRoutes);
app.use("/api/message", messageRoutes);
app.use("/api/users", userRoutes);
app.use("/api/payments", paymentRoutes);
app.use("/api/photos", photoRoutes);

// System info endpoint
app.get('/api/system-info', (req, res) => {
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

// Registered routes for documentation
const registeredRoutes = [
  { path: '/api/health', methods: ['GET'] },
  { path: '/api/auth', methods: ['POST'] },
  { path: '/api/chat', methods: ['GET', 'POST'] },
  { path: '/api/debug-test', methods: ['GET'] },
  { path: '/api/system-info', methods: ['GET'] }
];

// Default route
app.get("/", (req, res) => {
  res.json({
    message: "Ruda Dating App API",
    status: 'healthy',
    endpoints: registeredRoutes,
    timestamp: new Date().toISOString()
  });
});

// 404 Handler
app.use((req, res) => {
  res.status(404).json({
    message: "Endpoint not found",
    requestedUrl: req.originalUrl,
    availableEndpoints: registeredRoutes,
    help: "Try GET /api/health or GET /api/debug-test"
  });
});

// Error handler
app.use((err, req, res, next) => {
  console.error("Error:", err.message);
  res.status(err.status || 500).json({
    error: err.message,
    timestamp: new Date().toISOString()
  });
});

// ========== SOCKET.IO ========== //
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
  console.log(`Socket connected: ${socket.id}`);

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
      console.error("Socket error:", error);
    }
  });

  socket.on("disconnect", () => {
    console.log(`Socket disconnected: ${socket.id}`);
  });
});

// ========== SERVER STARTUP ========== //
const PORT = process.env.PORT || 5000;
const HOST = process.env.HOST || '0.0.0.0';

server.listen(PORT, HOST, () => {
  console.log(`
  🚀 Server running on http://${HOST}:${PORT}
  Environment: ${process.env.NODE_ENV || 'development'}
  Database: ${mongoose.connection.readyState === 1 ? 'connected' : 'disconnected'}
  `);
});

// Graceful shutdown
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);

function shutdown() {
  console.log('Shutting down gracefully...');
  server.close(() => {
    mongoose.connection.close(false, () => {
      console.log('Server stopped');
      process.exit(0);
    });
  });
}
