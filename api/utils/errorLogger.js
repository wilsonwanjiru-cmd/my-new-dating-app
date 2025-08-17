// utils/errorLogger.js
const winston = require('winston');
const { format } = require('date-fns');
const path = require('path');
const fs = require('fs');

// ======================
// CONFIGURATION
// ======================
const LOGS_DIR = path.join(__dirname, '../logs');
const isProduction = process.env.NODE_ENV === 'production';

// Ensure logs directory exists
if (!fs.existsSync(LOGS_DIR)) {
  fs.mkdirSync(LOGS_DIR, { recursive: true });
}

// ======================
// WINSTON LOGGER
// ======================
const logger = winston.createLogger({
  level: 'error',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.json()
  ),
  transports: [
    new winston.transports.File({ 
      filename: path.join(LOGS_DIR, 'error.log'),
      level: 'error'
    }),
    new winston.transports.Console({
      format: winston.format.combine(
        winston.format.colorize(),
        winston.format.simple()
      )
    })
  ]
});

// ======================
// ENHANCED ERROR LOGGER
// ======================
const logError = (message, error, context = {}) => {
  try {
    const errorDetails = error ? {
      name: error.name,
      message: error.message,
      stack: error.stack,
      code: error.code
    } : null;

    logger.error(message, {
      error: errorDetails,
      context: {
        ...context,
        environment: process.env.NODE_ENV || 'development',
        pid: process.pid
      }
    });
  } catch (logError) {
    console.error('Failed to log error:', logError);
  }
};

// ======================
// REQUEST LOGGER MIDDLEWARE
// ======================
const logRequestError = (err, req) => {
  const context = {
    request: {
      method: req.method,
      url: req.originalUrl,
      headers: {
        'user-agent': req.headers['user-agent'],
        referer: req.headers['referer']
      },
      params: req.params,
      query: req.query
    },
    user: req.user ? { _id: req.user._id } : null
  };

  logError('Request error', err, context);
};

// ======================
// EXPORTS
// ======================
module.exports = {
  error: logError,
  logRequestError
};