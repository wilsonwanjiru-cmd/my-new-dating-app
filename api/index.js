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

const app = express();
const server = http.createServer(app);

// ==================== Enhanced Configuration ====================
const IS_PRODUCTION = process.env.NODE_ENV === 'production';
const PORT = parseInt(process.env.PORT) || 5000;
const HOST = process.env.HOST || '0.0.0.0';
const BACKEND_URL = process.env.BACKEND_URL || `http://${HOST}:${PORT}`;

// Parse CORS_ALLOWED_ORIGINS from environment variables
const allowedOrigins = process.env.CORS_ALLOWED_ORIGINS 
  ? process.env.CORS_ALLOWED_ORIGINS.split(',') 
  : [
      'http://localhost:3000',
      'http://localhost:19006',
      'http://localhost:5000',
      'https://rudadatingsite.singles',
      'https://dating-app-3eba.onrender.com',
      'https://*.onrender.com'
    ];

// ==================== Enhanced Logging ====================
const logDirectory = path.join(__dirname, 'logs');
if (!fs.existsSync(logDirectory)) fs.mkdirSync(logDirectory);

const accessLogStream = rfs.createStream('access.log', {
  interval: '1d',
  path: logDirectory,
  compress: 'gzip'
});

app.use(morgan(IS_PRODUCTION ? 'combined' : 'dev', {
  stream: IS_PRODUCTION ? accessLogStream : process.stdout,
  skip: (req) => req.path === '/health' // Skip logging for health checks
}));

// ==================== Security Middleware ====================
app.use(helmet({
  contentSecurityPolicy: IS_PRODUCTION,
  hsts: IS_PRODUCTION
}));
app.set('trust proxy', 1);

const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: IS_PRODUCTION ? 100 : 1000,
  message: 'Too many requests from this IP, please try again later',
  standardHeaders: true,
  legacyHeaders: false
});
app.use('/api', apiLimiter);

// ==================== Enhanced CORS ====================
app.use(cors({
  origin: (origin, callback) => {
    if (!origin || allowedOrigins.some(o => {
      // Handle wildcard subdomains
      if (o.startsWith('https://*.')) {
        const domain = o.replace('https://*.', '');
        return origin.endsWith(domain);
      }
      return origin === o;
    })) {
      callback(null, true);
    } else {
      console.warn(`❌ CORS blocked origin: ${origin}`);
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
  maxAge: 86400
}));

// ==================== Connection Management ====================
app.use((req, res, next) => {
  // Set timeout for all requests
  req.setTimeout(15000, () => {
    console.warn(`Request timeout: ${req.method} ${req.url}`);
  });
  
  // Set server response timeout
  res.setTimeout(15000, () => {
    console.warn(`Response timeout: ${req.method} ${req.url}`);
  });
  next();
});

// Keep-alive headers
server.keepAliveTimeout = 60000; // 60 seconds
server.headersTimeout = 65000; // 65 seconds

// ==================== HTTPS Redirect ====================
if (IS_PRODUCTION) {
  app.use((req, res, next) => {
    if (req.headers['x-forwarded-proto'] !== 'https') {
      return res.redirect(301, `https://${req.headers.host}${req.url}`);
    }
    next();
  });
}

// ==================== Body Parsers ====================
app.use(express.json({ 
  limit: '10mb',
  verify: (req, res, buf) => {
    req.rawBody = buf;
  }
}));
app.use(express.urlencoded({ 
  extended: true, 
  limit: '10mb',
  parameterLimit: 10000
}));

// ==================== Database Connection ====================
const connectDB = require('./config/db');

const initializeDatabase = async () => {
  try {
    await connectDB();
    console.log(`✅ MongoDB connected: ${mongoose.connection.db.databaseName}`);
    
    // Configure MongoDB connection settings
    mongoose.connection.on('connected', () => {
      console.log('MongoDB connection established');
    });
    
    mongoose.connection.on('error', (err) => {
      console.error('MongoDB connection error:', err);
    });
    
    mongoose.connection.on('disconnected', () => {
      console.warn('MongoDB connection lost');
    });
    
    return true;
  } catch (err) {
    console.error(`❌ MongoDB connection error: ${err.message}`);
    if (IS_PRODUCTION) {
      // Retry connection after delay
      setTimeout(() => process.exit(1), 5000);
    }
    return false;
  }
};

// ==================== Route Loader ====================
const loadRoutes = () => {
  // Clear require cache for routes in development
  if (!IS_PRODUCTION) {
    Object.keys(require.cache).forEach(key => {
      if (key.includes('routes')) delete require.cache[key];
    });
  }

  const routeDefinitions = [
    { path: '/api/health', module: './routes/healthRoutes' },
    { path: '/api/auth', module: './routes/authRoutes' },
    { path: '/api/chat', module: './routes/chatRoutes' },
    // { path: '/api/email', module: './routes/emailRoutes' },
    { path: '/api/match', module: './routes/matchRoutes' },
    { path: '/api/message', module: './routes/messageRoutes' },
    { path: '/api/users', module: './routes/userRoutes' },
    { path: '/api/payments', module: './routes/paymentRoutes' },
    { path: '/api/photos', module: './routes/photoRoutes' }
  ];

  routeDefinitions.forEach((route) => {
    try {
      // Use require for CommonJS modules
      const routeModule = require(route.module);
      
      // Check for both default export and direct export
      const router = routeModule.default || routeModule.router || routeModule;
      
      if (typeof router === 'function' || router instanceof express.Router) {
        app.use(route.path, router);
        console.log(`✅ Route ${route.path} loaded successfully`);
      } else {
        throw new Error(`Invalid route export in ${route.module}`);
      }
    } catch (err) {
      console.error(`❌ Failed to load route ${route.path}:`, err);
      if (IS_PRODUCTION) {
        console.error('Continuing with other routes despite error');
      }
    }
  });
};

// ==================== Health Check Endpoint ====================
app.get('/health', (req, res) => {
  const dbStatus = mongoose.connection.readyState === 1 ? 'connected' : 'disconnected';
  const memoryUsage = process.memoryUsage();
  
  res.status(200).json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    database: dbStatus,
    memory: {
      rss: `${(memoryUsage.rss / 1024 / 1024).toFixed(2)} MB`,
      heapTotal: `${(memoryUsage.heapTotal / 1024 / 1024).toFixed(2)} MB`,
      heapUsed: `${(memoryUsage.heapUsed / 1024 / 1024).toFixed(2)} MB`
    },
    uptime: process.uptime()
  });
});

// ==================== Root Endpoint ====================
app.get('/', (req, res) => {
  res.json({
    status: 'operational',
    message: 'Ruda Dating App API',
    version: process.env.npm_package_version || '1.0.0',
    environment: process.env.NODE_ENV || 'development',
    timestamp: new Date().toISOString(),
    documentation: `${BACKEND_URL}/api-docs`,
    endpoints: [
      { path: '/api/health', methods: ['GET'], description: 'Health check' },
      { path: '/api/auth', methods: ['POST', 'GET'], description: 'Authentication' },
      { path: '/api/users', methods: ['GET', 'PUT', 'DELETE'], description: 'User management' }
    ]
  });
});

// ==================== Error Handling ====================
app.use((err, req, res, next) => {
  const statusCode = err.statusCode || 500;
  const message = IS_PRODUCTION && statusCode === 500 
    ? 'Internal server error' 
    : err.message;

  console.error(`[${new Date().toISOString()}] ${statusCode} ${req.method} ${req.url}`, {
    error: message,
    stack: IS_PRODUCTION ? undefined : err.stack,
    body: IS_PRODUCTION ? undefined : req.body
  });

  res.status(statusCode).json({
    success: false,
    message,
    ...(!IS_PRODUCTION && { stack: err.stack })
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
    } catch (err) {
      console.error('Socket Error:', err);
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
    console.log('🔄 Starting server initialization...');
    
    // Initialize database first
    console.log('🔄 Connecting to MongoDB...');
    const dbConnected = await initializeDatabase();
    if (!dbConnected) throw new Error('Database connection failed');

    // Then load routes
    console.log('🔄 Loading routes...');
    loadRoutes(); // Changed to synchronous loading

    // Start the server
    server.listen(PORT, HOST, () => {
      console.log(`
🚀 Server running on port ${PORT}
Environment: ${process.env.NODE_ENV || 'development'}
MongoDB: ${mongoose.connection.readyState === 1 ? 'connected' : 'disconnected'}
Process ID: ${process.pid}
      `);
      
      // Verify server can handle requests
      http.get(`http://localhost:${PORT}/health`, (res) => {
        console.log(`✅ Internal health check: ${res.statusCode}`);
      }).on('error', (err) => {
        console.error('❌ Internal health check failed:', err);
      });
    });
  } catch (err) {
    console.error('❌ Server failed to start:', err);
    
    // In production, wait before exiting to allow logs to flush
    if (IS_PRODUCTION) {
      setTimeout(() => process.exit(1), 5000);
    } else {
      process.exit(1);
    }
  }
};

// ==================== Process Management ====================
process.on('SIGTERM', () => {
  console.log('🛑 Received SIGTERM, shutting down gracefully...');
  server.close(() => {
    mongoose.connection.close(false).then(() => {
      console.log('✅ Server shutdown complete');
      process.exit(0);
    });
  });
  
  // Force shutdown after timeout
  setTimeout(() => {
    console.error('⚠️ Force shutdown due to timeout');
    process.exit(1);
  }, 10000);
});

process.on('SIGINT', () => {
  console.log('🛑 Received SIGINT, shutting down gracefully...');
  server.close(() => {
    mongoose.connection.close(false).then(() => {
      console.log('✅ Server shutdown complete');
      process.exit(0);
    });
  });
});

process.on('unhandledRejection', (err) => {
  console.error('Unhandled Rejection:', err);
  if (IS_PRODUCTION) {
    // Don't exit immediately - try to keep running
    console.error('Continuing despite unhandled rejection');
  }
});

process.on('uncaughtException', (err) => {
  console.error('Uncaught Exception:', err);
  if (IS_PRODUCTION) {
    // Don't exit immediately - try to keep running
    console.error('Continuing despite uncaught exception');
  }
});

// ==================== Start Application ====================
startServer();

// ==================== Performance Monitoring ====================
if (IS_PRODUCTION) {
  setInterval(() => {
    const memoryUsage = process.memoryUsage();
    console.log('Memory usage:', {
      rss: `${(memoryUsage.rss / 1024 / 1024).toFixed(2)} MB`,
      heapTotal: `${(memoryUsage.heapTotal / 1024 / 1024).toFixed(2)} MB`,
      heapUsed: `${(memoryUsage.heapUsed / 1024 / 1024).toFixed(2)} MB`
    });
    
    // Check event loop latency
    const start = process.hrtime();
    setTimeout(() => {
      const delta = process.hrtime(start);
      const latency = (delta[0] * 1000) + (delta[1] / 1000000);
      console.log(`Event loop latency: ${latency.toFixed(2)} ms`);
    }, 0);
  }, 30000);
}