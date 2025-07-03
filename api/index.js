require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const fs = require('fs');
const morgan = require('morgan');
const rfs = require('rotating-file-stream');
const client = require('prom-client');

// Initialize Express app and HTTP server
const app = express();
const server = http.createServer(app);

// ==================== Configuration Constants ====================
const IS_PRODUCTION = process.env.NODE_ENV === 'production';
const PORT = parseInt(process.env.PORT) || 5000;
const HOST = process.env.HOST || '0.0.0.0';
const BACKEND_URL = process.env.BACKEND_URL || `http://${HOST}:${PORT}`;

// ==================== Database Connection ====================
const { connectDB, connection } = require('./config/db');

// ==================== Prometheus Metrics Setup ====================
const register = new client.Registry();
client.collectDefaultMetrics({ register });

// ==================== Enhanced CORS Configuration ====================
const allowedOrigins = process.env.CORS_ALLOWED_ORIGINS 
  ? process.env.CORS_ALLOWED_ORIGINS.split(',') 
  : [
      'http://localhost:3000',
      'http://localhost:19006',
      'http://localhost:8081',
      'exp://192.168.*.*:8081',
      'http://localhost:5000',
      'https://rudadatingsite.singles',
      'https://dating-app-3eba.onrender.com',
      'https://*.onrender.com'
    ];

const corsOptions = {
  origin: (origin, callback) => {
    if (!origin && !IS_PRODUCTION) return callback(null, true);
    
    const isAllowed = allowedOrigins.some(o => {
      if (o.startsWith('https://*.')) {
        const domain = o.replace('https://*.', '');
        return origin.endsWith(domain);
      }
      if (o.includes('exp://') && origin.includes('exp://')) return true;
      if (o.includes('http://localhost') && origin.includes('http://localhost')) return true;
      return origin === o;
    });
    
    isAllowed ? callback(null, true) : callback(new Error('Not allowed by CORS'));
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH'],
  allowedHeaders: [
    'Content-Type', 
    'Authorization', 
    'X-Requested-With',
    'Accept',
    'x-access-token',
    'x-refresh-token'
  ],
  exposedHeaders: ['x-access-token', 'x-refresh-token'],
  maxAge: 86400
};

// ==================== Middleware Setup ====================
// CORS Configuration (must come early)
app.use(cors(corsOptions));
app.options('*', cors(corsOptions));

// Body Parsing Middleware (CRUCIAL FIX - ADDED THESE TWO LINES)
app.use(express.json({ limit: '10kb' })); // For parsing application/json with size limit
app.use(express.urlencoded({ extended: true, limit: '10kb' })); // For parsing form data

// Enhanced Logging
const logDirectory = path.join(__dirname, 'logs');
if (!fs.existsSync(logDirectory)) fs.mkdirSync(logDirectory);

const accessLogStream = rfs.createStream('access.log', {
  interval: '1d',
  path: logDirectory,
  compress: 'gzip'
});

app.use(morgan(IS_PRODUCTION ? 'combined' : 'dev', {
  stream: IS_PRODUCTION ? accessLogStream : process.stdout,
  skip: (req) => req.path.startsWith('/api/health')
}));

// Security Middleware
app.use(helmet({
  contentSecurityPolicy: IS_PRODUCTION,
  hsts: IS_PRODUCTION
}));
app.set('trust proxy', 1);

// Rate Limiting
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: IS_PRODUCTION ? 100 : 1000,
  skip: (req) => req.path.startsWith('/api/health'),
  message: 'Too many requests from this IP, please try again later',
  standardHeaders: true,
  legacyHeaders: false
});

app.use('/api', apiLimiter);

// Timeout Handling
app.use((req, res, next) => {
  req.setTimeout(15000, () => console.warn(`Request timeout: ${req.method} ${req.url}`));
  res.setTimeout(15000, () => console.warn(`Response timeout: ${req.method} ${req.url}`));
  next();
});

// Request Body Debugging (optional - remove in production)
if (!IS_PRODUCTION) {
  app.use((req, res, next) => {
    console.log('Incoming Request Body:', req.body);
    next();
  });
}

// Server Timeout Configuration
server.keepAliveTimeout = 60000;
server.headersTimeout = 65000;

// ==================== Database Initialization ====================
const initializeDatabase = async () => {
  try {
    console.log('🔄 Connecting to MongoDB...');
    await connectDB();
    
    connection.on('connected', () => {
      console.log(`✅ MongoDB connected: ${connection.db.databaseName}`);
      console.log(`Host: ${connection.host}`);
      console.log(`Port: ${connection.port}`);
    });
    
    connection.on('error', (err) => {
      console.error('❌ MongoDB connection error:', err);
    });
    
    connection.on('disconnected', () => {
      console.warn('⚠️  MongoDB disconnected');
    });
    
    return true;
  } catch (err) {
    console.error(`❌ MongoDB connection failed: ${err.message}`);
    if (IS_PRODUCTION) {
      setTimeout(() => process.exit(1), 5000);
    }
    return false;
  }
};

// ==================== Route Loading ====================
const loadRoutes = () => {
  // First load health routes with proper middleware
  try {
    const healthRoutes = require('./routes/healthRoutes');
    
    // Mount health routes with proper prefix and middleware
    app.use('/api/health', 
      // Health-specific middleware
      (req, res, next) => {
        res.set({
          'Cache-Control': 'no-store, no-cache, must-revalidate',
          'Pragma': 'no-cache',
          'X-Content-Type-Options': 'nosniff'
        });
        next();
      },
      healthRoutes
    );
    
    console.log('✅ Health routes loaded successfully');
  } catch (err) {
    console.error('❌ Failed to load health routes:', err);
  }

  // Then load other routes
  if (!IS_PRODUCTION) {
    Object.keys(require.cache).forEach(key => {
      if (key.includes('routes')) delete require.cache[key];
    });
  }

  const routeDefinitions = [
    { path: '/api/auth', module: './routes/authRoutes' },
    { path: '/api/chat', module: './routes/chatRoutes' },
    { path: '/api/match', module: './routes/matchRoutes' },
    { path: '/api/message', module: './routes/messageRoutes' },
    { path: '/api/users', module: './routes/userRoutes' },
    { path: '/api/payments', module: './routes/paymentRoutes' },
    { path: '/api/photos', module: './routes/photoRoutes' }
  ];

  routeDefinitions.forEach((route) => {
    try {
      const routeModule = require(route.module);
      const router = routeModule.default || routeModule.router || routeModule;
      
      if (typeof router === 'function' || router instanceof express.Router) {
        app.use(route.path, router);
        console.log(`✅ Route ${route.path} loaded successfully`);
      } else {
        throw new Error(`Invalid route export in ${route.module}`);
      }
    } catch (err) {
      console.error(`❌ Failed to load route ${route.path}:`, err);
      if (IS_PRODUCTION) console.error('Continuing with other routes despite error');
    }
  });

  // Metrics endpoint
  app.get('/metrics', async (req, res) => {
    res.set('Content-Type', register.contentType);
    res.end(await register.metrics());
  });
};

// ==================== API Endpoints ====================
app.get('/', (req, res) => {
  res.json({
    status: 'operational',
    message: 'Ruda Dating App API',
    version: process.env.npm_package_version || '1.0.0',
    environment: process.env.NODE_ENV || 'development',
    timestamp: new Date().toISOString(),
    documentation: `${BACKEND_URL}/api-docs`,
    endpoints: [
      { path: '/api/health', methods: ['GET'], description: 'Comprehensive health check' },
      { path: '/api/health/liveness', methods: ['GET'], description: 'Liveness probe' },
      { path: '/api/health/readiness', methods: ['GET'], description: 'Readiness probe' },
      { path: '/metrics', methods: ['GET'], description: 'Prometheus metrics' }
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
  cors: corsOptions,
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

// ==================== Server Management ====================
const startServer = async () => {
  try {
    console.log('🔄 Starting server initialization...');
    
    const dbConnected = await initializeDatabase();
    if (!dbConnected) throw new Error('Database connection failed');

    console.log('🔄 Loading routes...');
    loadRoutes();

    server.listen(PORT, HOST, () => {
      console.log(`
🚀 Server running on port ${PORT}
Environment: ${process.env.NODE_ENV || 'development'}
MongoDB: ${connection.readyState === 1 ? 'connected' : 'disconnected'}
Process ID: ${process.pid}
      `);
      
      // Verify all endpoints
      const endpoints = [
        '/api/health',
        '/api/health/liveness',
        '/api/health/readiness',
        '/metrics'
      ];
      
      endpoints.forEach(endpoint => {
        http.get(`http://localhost:${PORT}${endpoint}`, (res) => {
          console.log(`✅ ${endpoint} status: ${res.statusCode}`);
        }).on('error', (err) => {
          console.error(`❌ ${endpoint} check failed:`, err.message);
        });
      });
    });
  } catch (err) {
    console.error('❌ Server failed to start:', err);
    process.exit(1);
  }
};

const gracefulShutdown = async () => {
  console.log('🛑 Received shutdown signal, shutting down gracefully...');
  
  try {
    await new Promise((resolve) => server.close(resolve));
    await connection.close(false);
    console.log('✅ Server shutdown complete');
    process.exit(0);
  } catch (err) {
    console.error('⚠️ Error during shutdown:', err);
    process.exit(1);
  }
};

// ==================== Process Event Handlers ====================
process.on('SIGTERM', gracefulShutdown);
process.on('SIGINT', gracefulShutdown);

process.on('unhandledRejection', (err) => {
  console.error('Unhandled Rejection:', err);
});

process.on('uncaughtException', (err) => {
  console.error('Uncaught Exception:', err);
  if (!IS_PRODUCTION) process.exit(1);
});

// ==================== Start the Application ====================
startServer();