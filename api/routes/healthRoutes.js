const express = require('express');
const router = express.Router();
const HealthController = require('../controllers/healthController');

// ==================== Security Headers Middleware ====================
router.use((req, res, next) => {
  res.set({
    'Cache-Control': 'no-store, no-cache, must-revalidate',
    'Pragma': 'no-cache',
    'X-Content-Type-Options': 'nosniff',
    'Strict-Transport-Security': 'max-age=31536000; includeSubDomains',
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
  message: 'Too many health check requests from this IP, please try again later'
});

// ==================== Health Endpoints ====================

/**
 * @swagger
 * /api/health:
 *   get:
 *     summary: Comprehensive health check
 *     description: Returns the complete health status of the application including database, services and system metrics
 *     tags: [Health]
 *     parameters:
 *       - in: query
 *         name: deep
 *         schema:
 *           type: boolean
 *         description: Whether to perform deep checks of external services
 *     responses:
 *       200:
 *         description: Application is healthy
 *       500:
 *         description: Application is unhealthy
 */
router.get('/', apiLimiter, HealthController.healthCheck);

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
 */
router.get('/liveness', HealthController.liveness);

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
router.get('/readiness', HealthController.readiness);

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
router.get('/ping', HealthController.ping);

/**
 * @swagger
 * /api/health/metrics:
 *   get:
 *     summary: Application metrics
 *     description: Returns Prometheus formatted metrics
 *     tags: [Health]
 *     responses:
 *       200:
 *         description: Metrics data
 *         content:
 *           text/plain:
 *             schema:
 *               type: string
 */
router.get('/metrics', HealthController.getMetrics);

/**
 * @swagger
 * /api/health/history:
 *   get:
 *     summary: Health check history
 *     description: Returns the last 10 health check results
 *     tags: [Health]
 *     responses:
 *       200:
 *         description: Health check history
 */
router.get('/history', HealthController.getHistory);

// ==================== Deep Check Endpoint ====================
router.get('/deep-check', apiLimiter, (req, res, next) => {
  req.query.deep = 'true';
  next();
}, HealthController.healthCheck);

module.exports = router;