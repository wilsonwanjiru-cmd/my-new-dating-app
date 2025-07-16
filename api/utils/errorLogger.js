// utils/errorLogger.js
const fs = require('fs');
const path = require('path');

exports.logError = (message, error, context = {}) => {
  const logEntry = {
    timestamp: new Date().toISOString(),
    message,
    error: error ? {
      name: error.name,
      message: error.message,
      stack: error.stack
    } : null,
    context
  };

  const logPath = path.join(__dirname, '../logs/errors.log');
  fs.appendFileSync(logPath, JSON.stringify(logEntry) + '\n');
  
  // Also log to console in development
  if (process.env.NODE_ENV === 'development') {
    console.error(logEntry);
  }
};