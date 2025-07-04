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

// ==================== Configuration ====================
const IS_PRODUCTION = process.env.NODE_ENV === 'production';
const PORT = parseInt(process.env.PORT) || 5000;
const HOST = process.env.HOST || '0.0.0.0';

// ==================== Error Handling Setup ====================
process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
});

process.on('uncaughtException', (err) => {
  console.error('Uncaught Exception:', err);
  if (!IS_PRODUCTION) process.exit(1);
});

// ==================== DB Connection ====================
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

const logDirectory = path.join(__dirname, 'logs');
if (!fs.existsSync(logDirectory)) fs.mkdirSync(logDirectory);
const accessLogStream = fs.createWriteStream(path.join(logDirectory, 'access.log'), { flags: 'a' });
app.use(morgan(IS_PRODUCTION ? 'combined' : 'dev', {
  stream: IS_PRODUCTION ? accessLogStream : process.stdout,
  skip: (req) => req.path.startsWith('/health')
}));

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

// ==================== Load Routes ====================
const loadRoutes = async () => {
  try {
    // ✅ Mount health route correctly under /api/health
    const healthRouter = require('./routes/healthRoutes');
    app.use('/api/health', healthRouter);

    const routes = [
      { path: '/api/auth', router: require('./routes/authRoutes') },
      { path: '/api/users', router: require('./routes/userRoutes') },
      { path: '/api/chat', router: require('./routes/chatRoutes') },
      { path: '/api/match', router: require('./routes/matchRoutes') },
      { path: '/api/message', router: require('./routes/messageRoutes') },
      { path: '/api/payments', router: require('./routes/paymentRoutes') },
      { path: '/api/photos', router: require('./routes/photoRoutes') }
    ];

    routes.forEach(({ path, router }) => {
      app.use(path, router);
      console.log(`✅ Route ${path} loaded`);
    });

  } catch (err) {
    console.error('❌ Route loading failed:', err);
  }
};

// ==================== Database Initialization ====================
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

    await loadRoutes();

    app.get('/', (req, res) => {
      res.json({
        status: 'ok',
        timestamp: new Date().toISOString(),
        environment: process.env.NODE_ENV || 'development',
        dbStatus: mongoose.connection?.readyState === 1 ? 'connected' : 'disconnected'
      });
    });

    app.get('/favicon.ico', (req, res) => res.sendStatus(204));

    app.use((req, res) => {
      res.status(404).json({
        success: false,
        message: 'Endpoint not found'
      });
    });

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
✅ Server running on port ${PORT}
Environment: ${process.env.NODE_ENV || 'development'}
MongoDB: ${mongoose.connection?.readyState === 1 ? 'connected' : 'disconnected'}
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

// ==================== Start Application ====================
startServer();
