const rateLimit = require('express-rate-limit');

module.exports = (windowTitle, max, windowMs) => {
  return rateLimit({
    windowMs: windowMs,
    max: max,
    message: {
      success: false,
      code: 'RATE_LIMITED',
      message: `Too many requests. ${windowTitle}`
    },
    standardHeaders: true,
    legacyHeaders: false
  });
};