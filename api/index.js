require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const http = require('http');
const { Server } = require('socket.io');
const os = require('os');
const path = require('path');
const fs = require('fs');
const morgan = require('morgan');
const rfs = require('rotating-file-stream');
const { initializeTransporter } = require('./controllers/emailController');

// Initialize Express app
const app = express();
const server = http.createServer(app);

// ==================== Environment Configuration ====================
const IS_PRODUCTION = process.env.NODE_ENV === 'production';
const PORT = process.env.PORT || 5000;
const HOST = process.env.HOST || '0.0.0.0';
const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:3000';
const BACKEND_URL = process.env.BACKEND_URL || `http://${HOST}:${PORT}`;

// ==================== Logging Configuration ====================
const logDirectory = path.join(__dirname, 'logs');

// Ensure log directory exists
if (!fs.existsSync(logDirectory)) {
  fs.mkdirSync(logDirectory);
}

// Create a rotating write stream for access logs
const accessLogStream = rfs.createStream('access.log', {
  interval: '1d',
  path: logDirectory
});

// Setup logging
app.use(morgan(IS_PRODUCTION ? 'combined' : 'dev', {
  stream: IS_PRODUCTION ? accessLogStream : process.stdout
}));

// ==================== Security Middleware ====================
app.use(helmet());
app.set('trust proxy', 1); // Trust first proxy

// Rate limiting
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // limit each IP to 100 requests per windowMs
  message: 'Too many requests from this IP, please try again later'
});

// Apply to all API routes
app.use('/api', apiLimiter);

// ==================== CORS Configuration ====================
const allowedOrigins = [
  FRONTEND_URL,
  BACKEND_URL,
  'http://localhost:3000',
  'http://localhost:19006',
  'exp://192.168.249.233:3000',
  'http://192.168.249.233:3000',
  'http://localhost:5000',
  'https://rudadatingsite.singles',
  'https://api.rudadatingsite.singles'
].filter(Boolean); // Remove any undefined values

const corsOptions = {
  origin: (origin, callback) => {
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

// ==================== HTTPS Redirection (Production Only) ====================
if (IS_PRODUCTION) {
  app.use((req, res, next) => {
    if (req.headers['x-forwarded-proto'] !== 'https') {
      return res.redirect(301, `https://${req.headers.host}${req.url}`);
    }
    next();
  });
}

// ==================== Body Parsing Middleware ====================
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// ==================== Database Connection ====================
const connectDB = require('./config/db');
connectDB();

mongoose.connection.on('connected', () => {
  console.log('✅ MongoDB connected to:', mongoose.connection.db.databaseName);
  console.log('📊 MongoDB pinged successfully');
});

mongoose.connection.on('error', (err) => {
  console.error('❌ MongoDB connection error:', err.message);
  if (IS_PRODUCTION) {
    process.exit(1); // Exit process in production on DB connection failure
  }
});

mongoose.connection.on('disconnected', () => {
  console.warn('⚠️ MongoDB disconnected');
});

// ==================== Initialize Services ====================
const initializeServices = async () => {
  try {
    // Initialize Email Transporter
    await initializeTransporter();
    console.log('✉️ Email transporter initialized');
    
    // Add other service initializations here if needed
    
    return true;
  } catch (err) {
    console.error('❌ Service initialization failed:', err);
    throw err;
  }
};

// ==================== Route Imports ====================
const authRoutes = require('./routes/authRoutes');
const chatRoutes = require('./routes/chatRoutes');
const emailRoutes = require('./routes/emailRoutes');
const matchRoutes = require('./routes/matchRoutes');
const messageRoutes = require('./routes/messageRoutes');
const userRoutes = require('./routes/userRoutes');
const paymentRoutes = require('./routes/paymentRoutes');
const photoRoutes = require('./routes/photoRoutes');
const healthRoutes = require('./routes/healthRoutes');

// ==================== API Routes ====================
// Health check route (no authentication)
app.use('/api/health', healthRoutes);

// Main API routes
app.use('/api/auth', authRoutes);
app.use('/api/chat', chatRoutes);
app.use('/api/email', emailRoutes);
app.use('/api/match', matchRoutes);
app.use('/api/message', messageRoutes);
app.use('/api/users', userRoutes);
app.use('/api/payments', paymentRoutes);
app.use('/api/photos', photoRoutes);

// ==================== System Monitoring Routes ====================
app.get('/api/system-info', (req, res) => {
  res.json({
    status: 'operational',
    timestamp: new Date().toISOString(),
    system: {
      platform: os.platform(),
      uptime: os.uptime(),
      load: os.loadavg(),
      memory: {
        total: os.totalmem(),
        free: os.freemem(),
        used: os.totalmem() - os.freemem()
      },
      cpu: os.cpus().length
    },
    process: {
      pid: process.pid,
      memory: process.memoryUsage(),
      uptime: process.uptime(),
      version: process.version
    },
    database: {
      status: mongoose.connection.readyState === 1 ? 'connected' : 'disconnected',
      name: mongoose.connection.db?.databaseName,
      models: mongoose.modelNames()
    }
  });
});

// ==================== API Documentation Route ====================
app.get('/', (req, res) => {
  res.json({
    message: 'Ruda Dating App API',
    status: 'healthy',
    version: process.env.npm_package_version || '1.0.0',
    environment: process.env.NODE_ENV || 'development',
    timestamp: new Date().toISOString(),
    documentation: IS_PRODUCTION 
      ? 'https://api.rudadatingsite.singles/docs'
      : `${BACKEND_URL}/api-docs`,
    endpoints: [
      { path: '/api/health', methods: ['GET'], description: 'Health check' },
      { path: '/api/auth', methods: ['POST', 'GET'], description: 'Authentication' },
      { path: '/api/users', methods: ['GET', 'PUT', 'DELETE'], description: 'User management' },
      { path: '/api/system-info', methods: ['GET'], description: 'System information' }
    ]
  });
});

// ==================== Error Handling Middleware ====================
// 404 Handler
app.use((req, res) => {
  res.status(404).json({
    success: false,
    message: 'Endpoint not found',
    requestedUrl: req.originalUrl,
    availableEndpoints: [
      '/api/auth',
      '/api/users',
      '/api/health',
      '/api/system-info'
    ]
  });
});

// Global error handler
app.use((err, req, res, next) => {
  const statusCode = err.statusCode || 500;
  const message = IS_PRODUCTION && statusCode === 500 
    ? 'Internal server error' 
    : err.message;

  console.error(`[${new Date().toISOString()}] Error: ${message}`, {
    url: req.originalUrl,
    stack: IS_PRODUCTION ? undefined : err.stack
  });

  res.status(statusCode).json({
    success: false,
    message,
    ...(IS_PRODUCTION ? {} : { stack: err.stack })
  });
});

// ==================== Socket.IO Configuration ====================
const io = new Server(server, {
  cors: {
    origin: allowedOrigins,
    methods: ['GET', 'POST'],
    credentials: true
  },
  connectionStateRecovery: {
    maxDisconnectionDuration: 2 * 60 * 1000,
    skipMiddlewares: true
  },
  pingTimeout: 60000,
  pingInterval: 25000
});

io.on('connection', (socket) => {
  console.log(`🔌 Socket connected: ${socket.id}`);

  socket.on('joinRoom', (roomId) => {
    socket.join(roomId);
    console.log(`User joined room: ${roomId}`);
  });

  socket.on('sendMessage', async (data) => {
    try {
      const Chat = require('./models/Chat');
      const newMessage = new Chat({
        ...data,
        timestamp: new Date()
      });
      const savedMessage = await newMessage.save();
      io.to(data.roomId).emit('receiveMessage', savedMessage);
    } catch (error) {
      console.error('Socket Error:', error);
      socket.emit('error', { message: 'Failed to send message' });
    }
  });

  socket.on('disconnect', () => {
    console.log(`⚡ Socket disconnected: ${socket.id}`);
  });
});

// ==================== Server Startup ====================
const startServer = async () => {
  try {
    await initializeServices();
    
    server.listen(PORT, HOST, () => {
      console.log(`
      🚀 Server running at ${BACKEND_URL}
      Environment: ${process.env.NODE_ENV || 'development'}
      MongoDB: ${mongoose.connection.readyState === 1 ? 'connected' : 'disconnected'}
      Process ID: ${process.pid}
      `);
    });
  } catch (err) {
    console.error('❌ Server startup failed:', err);
    process.exit(1);
  }
};

startServer();

// ==================== Graceful Shutdown ====================
const shutdown = (signal) => {
  console.log(`🛑 Received ${signal}, shutting down gracefully...`);
  
  // Close server first
  server.close(async () => {
    console.log('✅ HTTP server closed');
    
    // Close database connection
    await mongoose.connection.close(false);
    console.log('✅ MongoDB connection closed');
    
    // Exit process
    process.exit(0);
  });

  // Force shutdown if takes too long
  setTimeout(() => {
    console.error('⚠️ Forcing shutdown due to timeout');
    process.exit(1);
  }, 10000);
};

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
process.on('unhandledRejection', (err) => {
  console.error('Unhandled Rejection:', err);
  if (IS_PRODUCTION) {
    process.exit(1);
  }
});
process.on('uncaughtException', (err) => {
  console.error('Uncaught Exception:', err);
  if (IS_PRODUCTION) {
    process.exit(1);
  }
});