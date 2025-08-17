const User = require('../models/user');
const Photo = require('../models/photo');

module.exports = {
  /**
   * Ensures user has completed gender setup before accessing critical features
   * Aligns with: 🔐 Authentication Flow in blueprint
   */
  ensureGenderSetup: (req, res, next) => {
    const user = req.user;
    
    // Bypass for health checks and non-critical routes
    if (req.path.startsWith('/api/health') || 
        req.path.startsWith('/api/auth')) {
      return next();
    }

    // Critical actions that require full profile setup
    const criticalActions = [
      '/api/likes',
      '/api/users',
      '/api/photos/feed',
      '/api/chats'
    ];
    
    const isCriticalAction = criticalActions.some(path => req.path.startsWith(path));
    
    if (isCriticalAction && (!user.gender || !user.genderPreference || user.genderPreference.length === 0)) {
      return res.status(403).json({
        success: false,
        code: "GENDER_REQUIRED",
        message: "Please complete your gender selection to continue",
        redirectTo: "/api/auth/select-gender",
        requiredFields: {
          gender: !user.gender,
          genderPreference: !user.genderPreference || user.genderPreference.length === 0
        }
      });
    }
    
    next();
  },

  /**
   * Checks gender compatibility for user-to-user interactions
   * Aligns with: 🎯 Core Concept - Gender-based filtering in blueprint
   */
  checkGenderCompatibility: async (req, res, next) => {
    try {
      const currentUser = req.user;
      
      // Skip for routes that don't involve user-to-user interaction
      if (req.path.includes('/photos/feed') || 
          req.path.includes('/upload')) {
        return next();
      }

      let targetUser;
      
      // Handle different parameter types
      if (req.params.userId) {
        // For profile actions
        targetUser = await User.findById(req.params.userId);
      } else if (req.params.photoId) {
        // For photo actions - get photo owner
        const photo = await Photo.findById(req.params.photoId);
        if (!photo) return res.status(404).json({ message: 'Photo not found' });
        targetUser = await User.findById(photo.user);
      } else if (req.body.targetUserId) {
        // For body-based requests (e.g., chat initiation)
        targetUser = await User.findById(req.body.targetUserId);
      } else {
        return next(); // Skip check if no target
      }

      if (!targetUser) {
        return res.status(404).json({ message: 'Target user not found' });
      }

      // Check gender compatibility
      const isCompatible = 
        currentUser.genderPreference.includes(targetUser.gender) &&
        targetUser.genderPreference.includes(currentUser.gender);

      if (!isCompatible) {
        return res.status(403).json({
          success: false,
          code: 'GENDER_PREFERENCE_MISMATCH',
          message: "This action doesn't match your gender preferences"
        });
      }

      // Attach target user to request for downstream use
      req.targetUser = targetUser;
      next();
    } catch (error) {
      console.error('Gender compatibility check error:', error);
      res.status(500).json({ 
        success: false,
        code: "SERVER_ERROR",
        message: "Error checking gender compatibility"
      });
    }
  },
  
  /**
   * Middleware to enforce gender-based access rules
   * Aligns with: 🖼️ Bio (Photo Feed) in blueprint
   */
  enforceGenderAccess: (req, res, next) => {
    const user = req.user;
    
    // Block access to core features without gender setup
    // FIXED: Removed extra opening parenthesis
    if (req.path.startsWith('/api/photos/feed') || 
        req.path.startsWith('/api/users') || 
        req.path.startsWith('/api/likes')) {
      
      if (!user.gender || !user.genderPreference || user.genderPreference.length === 0) {
        return res.status(403).json({
          success: false,
          code: "GENDER_SETUP_REQUIRED",
          message: "Complete gender setup to access this feature"
        });
      }
    }
    
    next();
  }
};