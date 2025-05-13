const express = require('express');
const router = express.Router();
const healthController = require('../controllers/healthController');

// Health check endpoint
router.get('/health', healthController.healthCheck);

// Ping endpoint
router.get('/ping', healthController.ping);

module.exports = router;