const jwt = require('jsonwebtoken');
const User = require('../models/user');

module.exports = {
  authenticate: async (req, res, next) => {
    try {
      console.log('\n=== AUTHENTICATION STARTED ===');
      console.log('Request headers:', req.headers);

      // 1. Get Authorization header (case-insensitive check)
      const authHeader = req.headers.authorization || req.headers.Authorization;
      
      if (!authHeader) {
        console.log('❌ No Authorization header found');
        return res.status(401).json({
          success: false,
          message: "Authentication required",
          systemCode: "AUTH_REQUIRED",
          docs: "https://your-api-docs.com/errors/AUTH_REQUIRED"
        });
      }

      // 2. Check Bearer token format
      if (!authHeader.startsWith('Bearer ') && !authHeader.startsWith('bearer ')) {
        console.log('❌ Invalid token format - missing Bearer prefix');
        return res.status(401).json({
          success: false,
          message: "Invalid token format",
          systemCode: "INVALID_TOKEN_FORMAT"
        });
      }

      // 3. Extract token (case-insensitive)
      const token = authHeader.split(' ')[1];
      console.log('Extracted token:', token);

      if (!token) {
        console.log('❌ Token not found after Bearer prefix');
        return res.status(401).json({
          success: false,
          message: "Token missing",
          systemCode: "TOKEN_MISSING"
        });
      }

      // 4. Verify token
      console.log('Verifying token with secret:', process.env.JWT_SECRET ? '✅ Secret exists' : '❌ Secret missing');
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      console.log('Decoded token:', decoded);

      // 5. Find user in database
      const user = await User.findOne({
        _id: decoded.userId || decoded._id
      });

      if (!user) {
        console.log('❌ User not found for ID:', decoded.userId || decoded._id);
        return res.status(401).json({
          success: false,
          message: "User not found",
          systemCode: "USER_NOT_FOUND"
        });
      }

      // 6. Authentication successful
      console.log('✅ Authenticated user:', user._id);
      req.user = user;
      req.token = token;
      next();
    } catch (error) {
      console.error('❌ Authentication error:', error.message);

      if (error.name === 'TokenExpiredError') {
        return res.status(401).json({
          success: false,
          message: "Token expired",
          systemCode: "TOKEN_EXPIRED"
        });
      }

      if (error.name === 'JsonWebTokenError') {
        return res.status(401).json({
          success: false,
          message: "Invalid token",
          systemCode: "INVALID_TOKEN"
        });
      }

      res.status(401).json({
        success: false,
        message: "Authentication failed",
        systemCode: "AUTH_FAILED",
        details: process.env.NODE_ENV === 'development' ? error.message : undefined
      });
    }
  }
};