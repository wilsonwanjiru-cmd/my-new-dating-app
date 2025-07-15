require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const http = require('http');
const path = require('path');
const fs = require('fs');
const morgan = require('morgan');
const { Server } = require('socket.io');
const { format } = require('date-fns');

const app = express();
const server = http.createServer(app);

// ==================== Config ====================
const IS_PRODUCTION = process.env.NODE_ENV === 'production';
const PORT = parseInt(process.env.PORT) || 5000;
const HOST = process.env.HOST || '0.0.0.0';
const API_BASE_URL = process.env.API_BASE_URL || `http://${HOST}:${PORT}`;

// ✅ Check for MONGODB_URI
if (!process.env.MONGODB_URI) {
  console.error('❌ MONGODB_URI is missing in environment variables');
  if (IS_PRODUCTION) process.exit(1);
}

// ==================== Initialize Socket.IO ====================
const io = new Server(server, {
  cors: {
    origin: IS_PRODUCTION
      ? process.env.CORS_ALLOWED_ORIGINS?.split(',') || []
      : '*',
    methods: ['GET', 'POST']
  },
  pingTimeout: 60000
});
require('./sockets/notificationSocket')(io);

// ==================== Error Handlers ====================
process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
});

process.on('uncaughtException', (err) => {
  console.error('Uncaught Exception:', err);
  if (!IS_PRODUCTION) process.exit(1);
});

// ==================== Middleware ====================
app.use(helmet({
  contentSecurityPolicy: false,
  hsts: IS_PRODUCTION,
  crossOriginResourcePolicy: { policy: "same-site" }
}));

const corsOptions = {
  origin: IS_PRODUCTION
    ? process.env.CORS_ALLOWED_ORIGINS?.split(',') || []
    : '*',
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
  credentials: true,
  maxAge: 86400
};
app.use(cors(corsOptions));
app.options('*', cors(corsOptions));

app.use(express.json({
  limit: '10kb',
  verify: (req, res, buf) => {
    try {
      JSON.parse(buf.toString());
    } catch (e) {
      res.status(400).json({ success: false, message: 'Invalid JSON payload' });
    }
  }
}));
app.use(express.urlencoded({ extended: true, limit: '10kb' }));

// ==================== Logging ====================
const logDirectory = path.join(__dirname, 'logs');
if (!fs.existsSync(logDirectory)) fs.mkdirSync(logDirectory);

const accessLogStream = fs.createWriteStream(
  path.join(logDirectory, `access-${format(new Date(), 'yyyy-MM-dd')}.log`),
  { flags: 'a' }
);

app.use(morgan(IS_PRODUCTION ? 'combined' : 'dev', {
  stream: IS_PRODUCTION ? accessLogStream : process.stdout,
  skip: (req) => req.path === '/health'
}));

// ==================== Rate Limiting ====================
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: IS_PRODUCTION ? 100 : 1000,
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => req.path.startsWith('/health'),
  handler: (req, res) => {
    res.status(429).json({
      success: false,
      message: 'Too many requests, please try again later'
    });
  }
});
app.use('/api', apiLimiter);

// ==================== Enhanced Route Loading ====================
const loadRoutes = () => {
  console.log('🔍 Loading routes...');
  
  // Load user routes first with debug logging
  const userRouter = require('./routes/userRoutes');
  app.use('/api/users', userRouter);
  console.log('✅ User routes loaded. Registered endpoints:');
  userRouter.stack.forEach(layer => {
    if (layer.route) {
      const methods = Object.keys(layer.route.methods).map(m => m.toUpperCase()).join(', ');
      console.log(`  ${methods.padEnd(6)} ${layer.route.path}`);
    }
  });

  // Load other routes
  const routes = [
    { path: '/api/health', file: './routes/healthRoutes' },
    { path: '/api/auth', file: './routes/authRoutes' },
    { path: '/api/chat', file: './routes/chatRoutes' },
    { path: '/api/matches', file: './routes/matchRoutes' },
    { path: '/api/messages', file: './routes/messageRoutes' },
    { path: '/api/payments', file: './routes/paymentRoutes' },
    { path: '/api/photos', file: './routes/photoRoutes' },
    { path: '/api/notifications', file: './routes/notificationRoutes' }
  ];

  routes.forEach(route => {
    try {
      // Skip userRoutes as we already loaded them
      if (route.path === '/api/users') return;
      
      const router = require(route.file);
      app.use(route.path, router);
      console.log(`✅ Route loaded: ${route.path}`);
    } catch (err) {
      console.error(`❌ Failed to load route ${route.path}:`, err);
      if (IS_PRODUCTION && !route.path.startsWith('/api/health')) {
        process.exit(1);
      }
    }
  });
};

// ==================== Database Initialization ====================
const initializeDatabase = async () => {
  console.log('🔄 Connecting to MongoDB...');
  try {
    await mongoose.connect(process.env.MONGODB_URI, {
      serverSelectionTimeoutMS: 5000,
      socketTimeoutMS: 45000,
      connectTimeoutMS: 10000
    });

    console.log('✅ MongoDB connected successfully');
    console.log(`📊 Database: ${mongoose.connection.db.databaseName}`);
    console.log(`📚 Collections: ${(await mongoose.connection.db.listCollections().toArray()).map(c => c.name).join(', ')}`);

    mongoose.connection.on('error', err => {
      console.error('❌ MongoDB connection error:', err);
    });

    mongoose.connection.on('disconnected', () => {
      console.warn('⚠️ MongoDB disconnected');
    });

    return true;
  } catch (err) {
    console.error('❌ Initial connection failed:', err);
    return false;
  }
};

// ==================== Server Initialization ====================
const startServer = async () => {
  try {
    console.log('🚀 Starting server initialization...');
    console.log(`⏳ Environment: ${process.env.NODE_ENV || 'development'}`);

    const dbConnected = await initializeDatabase();
    if (!dbConnected && IS_PRODUCTION) {
      console.error('❌ Critical: Failed to connect to database in production');
      process.exit(1);
    }

    loadRoutes();

    // Health check endpoint
    app.get('/health', (req, res) => {
      res.json({
        status: 'ok',
        timestamp: new Date().toISOString(),
        environment: process.env.NODE_ENV || 'development',
        dbStatus: mongoose.connection?.readyState === 1 ? 'connected' : 'disconnected',
        uptime: process.uptime(),
        memoryUsage: process.memoryUsage()
      });
    });

    // 404 Handler
    app.use((req, res) => {
      console.warn(`⚠️ 404: ${req.method} ${req.path}`);
      res.status(404).json({
        success: false,
        message: 'Endpoint not found',
        path: req.path,
        suggestion: 'Check /health for available services'
      });
    });

    // Error handler
    app.use((err, req, res, next) => {
      const statusCode = err.status || 500;
      console.error(`❌ ${statusCode} ${req.method} ${req.path}`, err);
      
      res.status(statusCode).json({
        success: false,
        message: err.message || 'Internal server error',
        timestamp: new Date().toISOString(),
        path: req.path,
        ...(!IS_PRODUCTION && { stack: err.stack })
      });
    });

    server.listen(PORT, HOST, () => {
      console.log(`
███████╗███████╗██████╗ ██╗   ██╗███████╗██████╗ 
██╔════╝██╔════╝██╔══██╗██║   ██║██╔════╝██╔══██╗
███████╗█████╗  ██████╔╝██║   ██║█████╗  ██████╔╝
╚════██║██╔══╝  ██╔══██╗╚██╗ ██╔╝██╔══╝  ██╔══██╗
███████║███████╗██║  ██║ ╚████╔╝ ███████╗██║  ██║
╚══════╝╚══════╝╚═╝  ╚═╝  ╚═══╝  ╚══════╝╚═╝  ╚═╝
                                                  
✅ Server running at ${API_BASE_URL}
🔌 MongoDB: ${mongoose.connection?.readyState === 1 ? 'connected' : 'disconnected'}
📡 Socket.IO: ${io ? 'enabled' : 'disabled'}
📊 Environment: ${process.env.NODE_ENV || 'development'}
      `);
    });

  } catch (err) {
    console.error('❌ Server initialization failed:', err);
    process.exit(1);
  }
};

// ==================== Graceful Shutdown ====================
const shutdown = async () => {
  console.log('🛑 Received shutdown signal');
  try {
    console.log('Closing HTTP server...');
    await new Promise(resolve => server.close(resolve));

    console.log('Closing database connections...');
    await mongoose.disconnect();

    console.log('Closing Socket.IO...');
    io.close();

    console.log('✅ Server shutdown complete');
    process.exit(0);
  } catch (err) {
    console.error('⚠️ Error during shutdown:', err);
    process.exit(1);
  }
};

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);

// ==================== Start the Server ====================
startServer();