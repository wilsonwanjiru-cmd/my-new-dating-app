const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const os = require('os');
const path = require('path');
const fs = require('fs');

// ==================== Utility Functions ====================
const formatBytes = (bytes) => {
  if (!bytes) return '0 Bytes';
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return parseFloat((bytes / Math.pow(1024, i)).toFixed(2)) + ' ' + sizes[i];
};

// ==================== DEBUG ENDPOINT FOR ROUTES ====================
// Add a debug endpoint to list all registered routes
router.get('/debug/routes', (req, res) => {
  const routes = [];
  
  // Get the main app from the request
  const app = req.app;
  
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

// ==================== DEBUG ENDPOINT FOR ENVIRONMENT ====================
router.get('/debug/env', (req, res) => {
  // Filter out sensitive environment variables
  const envVars = {};
  Object.keys(process.env).forEach(key => {
    if (!key.toLowerCase().includes('secret') && 
        !key.toLowerCase().includes('key') && 
        !key.toLowerCase().includes('password') &&
        !key.toLowerCase().includes('token')) {
      envVars[key] = process.env[key];
    }
  });
  
  res.json({
    success: true,
    environment: process.env.NODE_ENV || 'development',
    envVars: envVars
  });
});

// ==================== /api/health ====================
/**
 * @swagger
 * /api/health:
 *   get:
 *     summary: Comprehensive health check
 *     description: Returns application health status
 *     tags: [Health]
 *     responses:
 *       200:
 *         description: Application status
 */
router.get('/', async (req, res) => {
  try {
    let dbPing = false;
    try {
      await mongoose.connection.db.admin().ping();
      dbPing = true;
    } catch (pingError) {
      console.warn('MongoDB ping failed:', pingError.message);
    }

    const memoryUsage = process.memoryUsage();
    const cpuInfo = os.cpus();

    const healthData = {
      status: dbPing ? 'healthy' : 'degraded',
      timestamp: new Date().toISOString(),
      uptime: `${Math.floor(process.uptime())}s`,
      environment: process.env.NODE_ENV || 'development',
      database: {
        connectionState: mongoose.STATES[mongoose.connection.readyState] || 'disconnected',
        ping: dbPing,
        dbName: mongoose.connection.db?.databaseName || 'N/A'
      },
      system: {
        memory: {
          rss: formatBytes(memoryUsage.rss),
          heapTotal: formatBytes(memoryUsage.heapTotal),
          heapUsed: formatBytes(memoryUsage.heapUsed),
        },
        cpu: {
          count: cpuInfo.length,
          model: cpuInfo[0]?.model,
          speed: `${cpuInfo[0]?.speed} MHz`
        },
        platform: os.platform(),
        loadAverage: os.loadavg().map(l => l.toFixed(2))
      },
      process: {
        pid: process.pid,
        node: process.version
      },
      // Add information about available endpoints
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
    };

    res.status(200).json(healthData);
  } catch (error) {
    console.error('Health check error:', error);
    res.status(200).json({
      status: 'degraded',
      message: 'Health check partially failed',
      timestamp: new Date().toISOString()
    });
  }
});

// ==================== /api/health/liveness ====================
/**
 * @swagger
 * /api/health/liveness:
 *   get:
 *     summary: Liveness probe
 *     description: Simple check if application is running
 *     tags: [Health]
 *     responses:
 *       200:
 *         description: Application is alive
 */
router.get('/liveness', (req, res) => {
  res.status(200).json({
    status: 'alive',
    timestamp: new Date().toISOString(),
    processId: process.pid
  });
});

// ==================== /api/health/readiness ====================
/**
 * @swagger
 * /api/health/readiness:
 *   get:
 *     summary: Readiness probe
 *     description: Check if application can handle requests
 *     tags: [Health]
 *     responses:
 *       200:
 *         description: Application is ready
 *       503:
 *         description: Application not ready
 */
router.get('/readiness', async (req, res) => {
  try {
    let dbReady = false;
    try {
      await mongoose.connection.db.admin().ping();
      dbReady = true;
    } catch (err) {
      console.warn('Readiness ping failed:', err.message);
    }

    const ready = dbReady && mongoose.connection.readyState === 1;

    res.status(ready ? 200 : 503).json({
      status: ready ? 'ready' : 'not ready',
      timestamp: new Date().toISOString(),
      database: {
        connectionState: mongoose.STATES[mongoose.connection.readyState] || 'disconnected',
        ping: dbReady
      }
    });
  } catch (error) {
    console.error('Readiness check error:', error);
    res.status(503).json({
      status: 'not ready',
      message: 'Readiness check failed',
      timestamp: new Date().toISOString()
    });
  }
});

// ==================== /api/health/ping ====================
/**
 * @swagger
 * /api/health/ping:
 *   get:
 *     summary: Simple ping
 *     description: Returns pong response
 *     tags: [Health]
 *     responses:
 *       200:
 *         description: Pong response
 */
router.get('/ping', (req, res) => {
  res.status(200).json({
    status: 'success',
    message: 'pong',
    timestamp: new Date().toISOString()
  });
});

module.exports = router;
