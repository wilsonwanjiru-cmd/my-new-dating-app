require('dotenv').config({ path: __dirname + '/.env' });
const express = require('express');
const mongoose = require('mongoose');
const http = require('http');
const morgan = require('morgan');
const { Server } = require('socket.io');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const compression = require('compression');
const hpp = require('hpp');
const mongoSanitize = require('express-mongo-sanitize');
const xss = require('xss-clean');
const cloudinary = require('cloudinary').v2;
const cluster = require('cluster');
const os = require('os');

const app = express();
const server = http.createServer(app);

const PORT = process.env.PORT || 5000;
const HOST = process.env.HOST || '0.0.0.0';
const isProduction = process.env.NODE_ENV === 'production';
const debugRoutes = process.env.DEBUG_ROUTES === 'true';
const API_BASE_URL = process.env.API_BASE_URL || `http://${HOST}:${PORT}`;
const numCPUs = os.cpus().length;

// ==================== CLUSTER MODE (PRODUCTION ONLY) ====================
if (isProduction && cluster.isPrimary) {
  console.log(`📦 Production mode: Launching ${numCPUs} workers`);
  for (let i = 0; i < numCPUs; i++) cluster.fork();
  cluster.on('exit', (worker, code, signal) => {
    console.error(`❌ Worker ${worker.process.pid} died (${signal || code}) — restarting`);
    cluster.fork();
  });
  return; // only workers run below
}

// ==================== ENV VAR VALIDATION ====================
const requiredEnvVars = [
  'MONGODB_URI',
  'JWT_SECRET',
  'CLOUDINARY_CLOUD_NAME',
  'CLOUDINARY_API_KEY',
  'CLOUDINARY_API_SECRET'
];
const missingVars = requiredEnvVars.filter(v => !process.env[v]);
if (missingVars.length) {
  console.error(`❌ Critical environment variables missing: ${missingVars.join(', ')}`);
  process.exit(1);
}

// ==================== SECURITY MIDDLEWARE ====================
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'", 'https://apis.google.com'],
      styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
      fontSrc: ["'self'", 'https://fonts.gstatic.com'],
      imgSrc: ["'self'", 'data:', 'blob:', 'https://res.cloudinary.com'],
      connectSrc: [
        "'self'",
        API_BASE_URL,
        'https://api.safaricom.co.ke',
        'https://res.cloudinary.com',
        'ws://localhost:3000'
      ],
      frameSrc: ["'self'", 'https://www.google.com'],
      objectSrc: ["'none'"]
    }
  },
  crossOriginResourcePolicy: { policy: "cross-origin" },
  crossOriginEmbedderPolicy: false
}));

app.use(cors({
  origin: isProduction
    ? [process.env.CLIENT_URL, process.env.ADMIN_URL]
    : ['http://localhost:3000', 'http://localhost:8081'],
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
  credentials: true,
  maxAge: 86400
}));

// ==================== RATE LIMITING ====================
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: isProduction ? 300 : 1000,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    code: 'RATE_LIMITED',
    message: 'Too many requests, please try again later'
  }
});
app.use(apiLimiter);

// ==================== PERFORMANCE & SANITIZATION ====================
app.use(compression());
app.use(express.json({ limit: '10kb' }));
app.use(express.urlencoded({ extended: true, limit: '10kb' }));
app.use(mongoSanitize());
app.use(xss());
app.use(hpp());

// ==================== LOGGING ====================
const logFormat = isProduction
  ? ':remote-addr - :remote-user [:date[clf]] ":method :url HTTP/:http-version" :status :res[content-length] ":referrer" ":user-agent"'
  : 'dev';

const accessLogStream = isProduction
  ? fs.createWriteStream(path.join(__dirname, 'access.log'), { flags: 'a' })
  : null;

app.use(morgan(isProduction ? logFormat : 'dev', {
  stream: isProduction ? accessLogStream : process.stdout,
  skip: (req) => req.url === '/api/health'
}));

// ==================== CLOUDINARY CONFIG ====================
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
  secure: true
});
console.log(`🔐 Cloudinary configured (${isProduction ? 'Production-ready' : 'Dev mode'})`);

// ==================== ROUTE REGISTRATION ====================
console.log('\n🔍 Registering routes:\n');
const routeLoadOrder = [
  { name: 'authRoutes', prefix: '/api/auth' },
  { name: 'healthRoutes', prefix: '/api/health' },
  { name: 'paymentRoutes', prefix: '/api/payments' },
  { name: 'notificationRoutes', prefix: '/api/notifications' },
  { name: 'likeRoutes', prefix: '/api/likes' },
  { name: 'userRoutes', prefix: '/api/users' },
  { name: 'photoRoutes', prefix: '/api/photos' },
  { name: 'chatRoutes', prefix: '/api/chats' },
  { name: 'matchRoutes', prefix: '/api/matches' }
];

const logRouteEndpoints = (router, prefix) => {
  if (!router || !router.stack) return;
  router.stack.forEach(layer => {
    if (layer.route) {
      const methods = Object.keys(layer.route.methods).map(m => m.toUpperCase()).join(', ');
      console.log(`  ${methods.padEnd(8)} ${prefix}${layer.route.path}`);
    } else if (layer.handle && layer.handle.stack) {
      logRouteEndpoints(layer.handle, prefix); // nested router
    }
  });
};

routeLoadOrder.forEach(route => {
  try {
    const routeFile = path.join(__dirname, 'routes', `${route.name}.js`);
    if (!fs.existsSync(routeFile)) {
      console.log(`⏩ ${route.name} not found, skipping`);
      return;
    }
    if (!isProduction) delete require.cache[require.resolve(routeFile)];

    const exported = require(routeFile);
    const isMiddlewareFn = typeof exported === 'function';
    const isRouterObj = typeof exported === 'object' && exported !== null && typeof exported.use === 'function';

    if (!(isMiddlewareFn || isRouterObj)) {
      throw new Error(`Invalid export from ${route.name}. Expected an Express router or middleware function but got ${typeof exported}`);
    }

    app.use(route.prefix, exported);
    console.log(`✅ Mounted ${route.prefix}`);

    if (debugRoutes) { // Changed from !isProduction && debugRoutes to just debugRoutes
      console.log(`🔍 ${route.name} Endpoints:`);
      logRouteEndpoints(exported, route.prefix);
    }
  } catch (err) {
    console.error(`❌ Failed to load ${route.name}: ${err.message}`);
    console.error(err.stack);
  }
});

if (debugRoutes) { // Changed from !isProduction && debugRoutes to just debugRoutes
  console.log('\n🔍 Final Route Stack:');
  app._router.stack.forEach(layer => {
    if (layer.name === 'router' && layer.handle) {
      const prefix = layer.regexp.toString()
        .replace(/^\/\^/, '')
        .replace(/\\\//g, '/')
        .replace(/\$\//, '')
        .replace(/\/i/, '');
      console.log(`\n✅ Mounted at: ${prefix}`);
      logRouteEndpoints(layer.handle, prefix);
    }
  });
}
console.log('✅ All routes registered');

// ==================== DEBUG ENDPOINT FOR ROUTES ====================
// Add a debug endpoint to list all registered routes
app.get('/api/debug/routes', (req, res) => {
  const routes = [];
  
  app._router.stack.forEach(layer => {
    if (layer.name === 'router' && layer.handle) {
      const prefix = layer.regexp.toString()
        .replace(/^\/\^/, '')
        .replace(/\\\//g, '/')
        .replace(/\$\//, '')
        .replace(/\/i/, '');
      
      layer.handle.stack.forEach(routeLayer => {
        if (routeLayer.route) {
          const methods = Object.keys(routeLayer.route.methods).join(', ').toUpperCase();
          routes.push({
            path: prefix + routeLayer.route.path,
            methods: methods
          });
        }
      });
    }
  });
  
  res.json({
    success: true,
    message: 'Registered routes',
    routes: routes
  });
});

// ==================== SOCKET.IO SETUP ====================
const io = new Server(server, {
  cors: {
    origin: isProduction
      ? [process.env.CLIENT_URL, process.env.ADMIN_URL]
      : ['http://localhost:3000', 'http://localhost:8081'],
    methods: ['GET', 'POST']
  },
  pingTimeout: 60000,
  pingInterval: 25000,
  transports: ['websocket', 'polling'],
  path: '/socket.io',
  serveClient: false
});
app.set('io', io);

io.on('connection', (socket) => {
  console.log(`🔌 Socket connected: ${socket.id} (Worker: ${process.pid})`);
  ['statusSocket', 'chatSocket', 'notificationSocket'].forEach(handler => {
    try {
      require(`./sockets/${handler}`)(io, socket);
      console.log(`⚡ Loaded ${handler}`);
    } catch (err) {
      console.error(`❌ Failed to load ${handler}: ${err.message}`);
    }
  });
  socket.on('disconnect', reason => {
    console.log(`❌ Socket disconnected: ${socket.id} (${reason})`);
  });
});

// ==================== DATABASE CONNECTION ====================
const connectDB = async () => {
  try {
    mongoose.set('strictQuery', false);
    await mongoose.connect(process.env.MONGODB_URI, {
      serverSelectionTimeoutMS: 5000,
      maxPoolSize: 100,
      minPoolSize: 10,
      socketTimeoutMS: 45000,
      family: 4
    });
    console.log('✅ MongoDB connected');
  } catch (err) {
    console.error('❌ MongoDB connection error:', err.message);
    process.exit(1);
  }
};
connectDB();

// ==================== HEALTH CHECK ====================
app.get('/api/health', (req, res) => {
  res.json({
    status: 'UP',
    uptime: process.uptime(),
    timestamp: new Date(),
    db: mongoose.connection.readyState === 1 ? 'CONNECTED' : 'DISCONNECTED',
    worker: process.pid,
    environment: process.env.NODE_ENV || 'development',
    endpoints: [
      '/api/auth/select-gender',
      '/api/auth/register',
      '/api/auth/login',
      '/api/auth/me',
      '/api/payments/mpesa',
      '/api/photos/upload',
      '/api/photos/feed',
      '/api/likes/:photoId',
      '/api/chats/initiate',
      '/api/chats/:chatId/messages'
    ]
  });
});

// ==================== ERROR HANDLING ====================
app.use((req, res) => {
  res.status(404).json({
    success: false,
    code: 'ROUTE_NOT_FOUND',
    message: `Route ${req.method} ${req.originalUrl} not found`,
    suggestion: 'Check /api/health for available services'
  });
});
app.use((err, req, res, next) => {
  console.error('⚠️ Server error:', err);
  res.status(err.status || 500).json({
    success: false,
    code: err.code || 'SERVER_ERROR',
    message: isProduction ? 'Internal server error' : err.message
  });
});

// ==================== SERVER START ====================
server.listen(PORT, HOST, () => {
  console.log(`\n🚀 Server ${isProduction ? `(Worker ${process.pid})` : ''} running at ${API_BASE_URL}`);
  console.log(`🔧 Debug mode: ${debugRoutes ? 'ENABLED' : 'DISABLED'}`);
  console.log(`🌐 Environment: ${isProduction ? 'Production' : 'Development'}`);
});

// ==================== GRACEFUL SHUTDOWN ====================
const shutdown = async (signal) => {
  console.log(`\n🔴 Received ${signal}, shutting down...`);
  try {
    server.close(() => console.log('✅ HTTP server closed'));
    await mongoose.connection.close();
    io.close(() => console.log('✅ Socket.IO closed'));
    setTimeout(() => process.exit(0), 1000);
  } catch (err) {
    console.error('❌ Shutdown error:', err);
    process.exit(1);
  }
};
['SIGINT', 'SIGTERM'].forEach(sig => process.on(sig, () => shutdown(sig)));
process.on('uncaughtException', err => {
  console.error('💥 Uncaught Exception:', err);
  shutdown('uncaughtException');
});
process.on('unhandledRejection', (reason, promise) => {
  console.error('💥 Unhandled Rejection:', reason);
});