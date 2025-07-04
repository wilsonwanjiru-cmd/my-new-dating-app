const express = require('express');
const router = express.Router();
const HealthController = require('../controllers/healthController');

// ==================== Security Headers Middleware ====================
router.use((req, res, next) => {
  res.set({
    'Cache-Control': 'no-store, no-cache, must-revalidate',
    'Pragma': 'no-cache',
    'X-Content-Type-Options': 'nosniff',
    'Strict-Transport-Security': process.env.NODE_ENV === 'production' ? 'max-age=31536000; includeSubDomains' : '',
    'X-Frame-Options': 'DENY',
    'X-XSS-Protection': '1; mode=block'
  });
  next();
});

// ==================== Rate Limiting ====================
const rateLimit = require('express-rate-limit');
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // limit each IP to 100 requests per windowMs
  handler: (req, res) => {
    res.status(429).json({
      success: false,
      message: 'Too many health check requests from this IP, please try again later'
    });
  }
});

// ==================== Health Endpoints ====================

/**
 * @swagger
 * /api/health:
 *   get:
 *     summary: Comprehensive health check
 *     description: Returns the complete health status of the application including database, services and system metrics
 *     tags: [Health]
 *     responses:
 *       200:
 *         description: Application is healthy
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 message:
 *                   type: string
 *                 data:
 *                   type: object
 *       500:
 *         description: Application is unhealthy
 */
router.get('/', apiLimiter, async (req, res, next) => {
  try {
    await HealthController.healthCheck(req, res, next);
  } catch (error) {
    console.error('Health check error:', error);
    res.status(500).json({
      success: false,
      message: 'Health check failed',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

/**
 * @swagger
 * /api/health/liveness:
 *   get:
 *     summary: Liveness probe
 *     description: Simple check if the application is running
 *     tags: [Health]
 *     responses:
 *       200:
 *         description: Application is alive
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 message:
 *                   type: string
 */
router.get('/liveness', (req, res) => {
  try {
    HealthController.liveness(req, res);
  } catch (error) {
    console.error('Liveness check error:', error);
    res.status(200).json({  // Liveness should always return 200 if process is running
      success: true,
      message: 'Process is running but encountered an error'
    });
  }
});

/**
 * @swagger
 * /api/health/readiness:
 *   get:
 *     summary: Readiness probe
 *     description: Check if the application is ready to handle traffic
 *     tags: [Health]
 *     responses:
 *       200:
 *         description: Application is ready
 *       503:
 *         description: Application is not ready
 */
router.get('/readiness', async (req, res) => {
  try {
    await HealthController.readiness(req, res);
  } catch (error) {
    console.error('Readiness check error:', error);
    res.status(503).json({
      success: false,
      message: 'Service not ready',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

/**
 * @swagger
 * /api/health/ping:
 *   get:
 *     summary: Simple ping
 *     description: Returns a simple pong response
 *     tags: [Health]
 *     responses:
 *       200:
 *         description: Successful ping response
 */
router.get('/ping', (req, res) => {
  res.status(200).json({
    success: true,
    message: 'pong',
    timestamp: new Date().toISOString()
  });
});

// ==================== Error Handling Middleware ====================
router.use((err, req, res, next) => {
  console.error('Health route error:', err);
  res.status(500).json({
    success: false,
    message: 'Internal health check error',
    error: process.env.NODE_ENV === 'development' ? err.message : undefined
  });
});

module.exports = router;