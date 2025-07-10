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

const app = express();
const server = http.createServer(app);

// ==================== Config ====================
const IS_PRODUCTION = process.env.NODE_ENV === 'production';
const PORT = parseInt(process.env.PORT) || 5000;
const HOST = process.env.HOST || '0.0.0.0';

// ==================== Error Handlers ====================
process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
});

process.on('uncaughtException', (err) => {
  console.error('Uncaught Exception:', err);
  if (!IS_PRODUCTION) process.exit(1);
});

// ==================== DB Connect ====================
const { connectDB } = require('./config/db');

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
  allowedHeaders: ['Content-Type', 'Authorization'],
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
const accessLogStream = fs.createWriteStream(path.join(logDirectory, 'access.log'), { flags: 'a' });

app.use(morgan(IS_PRODUCTION ? 'combined' : 'dev', {
  stream: IS_PRODUCTION ? accessLogStream : process.stdout,
  skip: (req) => req.path.startsWith('/health')
}));

// ==================== Rate Limiting ====================
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  handler: (req, res) => {
    res.status(429).json({
      success: false,
      message: 'Too many requests, please try again later'
    });
  }
});
app.use('/api', apiLimiter);

// ==================== Enhanced Route Loader ====================
const loadRoutesSafely = async () => {
  const routePaths = {
    '/api/health': './routes/healthRoutes',
    '/api/auth': './routes/authRoutes',
    '/api/users': './routes/userRoutes',
    '/api/chat': './routes/chatRoutes',
    '/api/match': './routes/matchRoutes',
    '/api/message': './routes/messageRoutes',
    '/api/payments': './routes/paymentRoutes',
    '/api/photos': './routes/photoRoutes'
  };

  for (const [path, routePath] of Object.entries(routePaths)) {
    try {
      const route = require(routePath);
      app.use(path, route);
      console.log(`✅ Route loaded: ${path}`);
    } catch (err) {
      console.error(`❌ Failed to load route ${path}:`, err);
      if (IS_PRODUCTION) {
        // In production, fail fast if routes don't load
        throw new Error(`Critical route failed to load: ${path}`);
      }
    }
  }
};

// ==================== DB Init ====================
const initializeDatabase = async () => {
  try {
    console.log('🔄 Connecting to MongoDB...');
    await connectDB();

    mongoose.connection.on('connected', () => {
      console.log('✅ MongoDB connected');
    });

    mongoose.connection.on('error', (err) => {
      console.error('❌ MongoDB connection error:', err);
    });

    mongoose.connection.on('disconnected', () => {
      console.warn('⚠️ MongoDB disconnected');
    });

    await mongoose.connection.db.admin().ping();
    return true;
  } catch (err) {
    console.error('❌ MongoDB connection failed:', err);
    return false;
  }
};

// ==================== Start Server ====================
const startServer = async () => {
  try {
    console.log('🚀 Starting server initialization...');

    const dbConnected = await initializeDatabase();
    if (!dbConnected) {
      console.warn('⚠️ Starting with degraded functionality - database not connected');
    }

    await loadRoutesSafely();

    // ✅ Basic health check
    app.get('/', (req, res) => {
      res.json({
        status: 'ok',
        timestamp: new Date().toISOString(),
        environment: process.env.NODE_ENV || 'development',
        dbStatus: mongoose.connection?.readyState === 1 ? 'connected' : 'disconnected'
      });
    });

    // ✅ Favicon block
    app.get('/favicon.ico', (req, res) => res.sendStatus(204));

    // ✅ 404 Fallback
    app.use((req, res) => {
      res.status(404).json({
        success: false,
        message: 'Endpoint not found'
      });
    });

    // ✅ Global error handler
    app.use((err, req, res, next) => {
      const statusCode = err.status || 500;
      console.error(`[${statusCode}] ${req.method} ${req.url}`, err);
      res.status(statusCode).json({
        success: false,
        message: err.message || 'Something went wrong',
        ...(!IS_PRODUCTION && { stack: err.stack })
      });
    });

    server.listen(PORT, HOST, () => {
      console.log(`
✅ Server running at http://${HOST}:${PORT}
Environment: ${process.env.NODE_ENV || 'development'}
MongoDB: ${mongoose.connection?.readyState === 1 ? 'connected' : 'disconnected'}
      `);
    });

  } catch (err) {
    console.error('❌ Server initialization failed:', err);
    process.exit(1);
  }
};

// ==================== Shutdown Hook ====================
const shutdown = async () => {
  console.log('🛑 Received shutdown signal');
  try {
    await new Promise(resolve => server.close(resolve));
    await mongoose.disconnect();
    console.log('✅ Server shutdown complete');
    process.exit(0);
  } catch (err) {
    console.error('⚠️ Error during shutdown:', err);
    process.exit(1);
  }
};

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);

// ==================== Start ====================
startServer();