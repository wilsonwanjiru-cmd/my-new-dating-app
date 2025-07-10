const { validationResult } = require('express-validator');
const mongoose = require('mongoose');
const { ObjectId } = mongoose.Types;

class ValidateRequest {
  // Validates express-validator results
  static validateRequest(req, res, next) {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: 'Validation failed',
        errors: errors.array().map(err => ({
          param: err.param,
          message: err.msg,
          location: err.location,
          ...(process.env.NODE_ENV === 'development' && { value: err.value })
        }))
      });
    }
    next();
  }

  // Validates MongoDB ObjectId in params
  static validateObjectId(req, res, next) {
    const idFields = [
      { field: 'userId', location: 'params' },
      { field: 'id', location: 'params' }
    ];

    const errors = [];

    idFields.forEach(({ field, location }) => {
      if (req[location][field]) {
        const value = req[location][field]?.toString().trim();
        req[location][field] = value;
        if (!ObjectId.isValid(value)) {
          errors.push({
            param: field,
            message: 'Invalid ID format',
            location,
            value: process.env.NODE_ENV === 'development' ? value : undefined
          });
        }
      }
    });

    if (errors.length > 0) {
      return res.status(400).json({
        success: false,
        message: 'Validation failed',
        errors
      });
    }

    next();
  }

  // Validates MongoDB ObjectId in body
  static validateBodyObjectId(fields = []) {
    return (req, res, next) => {
      const errors = [];

      fields.forEach(field => {
        if (req.body[field]) {
          const value = req.body[field]?.toString().trim();
          req.body[field] = value;
          if (!ObjectId.isValid(value)) {
            errors.push({
              param: field,
              message: 'Invalid ID format',
              location: 'body',
              value: process.env.NODE_ENV === 'development' ? value : undefined
            });
          }
        } else {
          errors.push({
            param: field,
            message: 'Field is required',
            location: 'body'
          });
        }
      });

      if (errors.length > 0) {
        return res.status(400).json({
          success: false,
          message: 'Validation failed',
          errors
        });
      }

      next();
    };
  }

  // Validates MongoDB ObjectId in query
  static validateQueryObjectId(field) {
    return (req, res, next) => {
      const value = req.query[field]?.toString().trim();

      if (!value) {
        return res.status(400).json({
          success: false,
          message: `${field} query parameter is required`,
          errors: [{
            param: field,
            message: 'Query parameter is required',
            location: 'query'
          }]
        });
      }

      if (!ObjectId.isValid(value)) {
        return res.status(400).json({
          success: false,
          message: `Invalid ${field} format`,
          errors: [{
            param: field,
            message: 'Invalid ID format',
            location: 'query',
            value: process.env.NODE_ENV === 'development' ? value : undefined
          }]
        });
      }

      req.query[field] = value;
      next();
    };
  }

  // Sanitizes input
  static sanitizeInput(req, res, next) {
    if (req.body) {
      Object.keys(req.body).forEach(key => {
        if (typeof req.body[key] === 'string') {
          req.body[key] = req.body[key].trim();
        }
      });
    }

    if (req.params) {
      Object.keys(req.params).forEach(key => {
        if (typeof req.params[key] === 'string') {
          req.params[key] = req.params[key].trim();
        }
      });
    }

    if (req.query) {
      Object.keys(req.query).forEach(key => {
        if (typeof req.query[key] === 'string') {
          req.query[key] = req.query[key].trim();
        }
      });
    }

    next();
  }

  // Validates pagination query parameters
  static validatePagination(req, res, next) {
    const { limit = '10', page = '1' } = req.query;
    const errors = [];

    const limitNum = parseInt(limit);
    if (isNaN(limitNum)) {
      errors.push({
        param: 'limit',
        message: 'Must be a number',
        location: 'query'
      });
    } else if (limitNum < 1 || limitNum > 100) {
      errors.push({
        param: 'limit',
        message: 'Must be between 1 and 100',
        location: 'query'
      });
    }

    const pageNum = parseInt(page);
    if (isNaN(pageNum)) {
      errors.push({
        param: 'page',
        message: 'Must be a number',
        location: 'query'
      });
    } else if (pageNum < 1) {
      errors.push({
        param: 'page',
        message: 'Must be at least 1',
        location: 'query'
      });
    }

    if (errors.length > 0) {
      return res.status(400).json({
        success: false,
        message: 'Invalid pagination parameters',
        errors
      });
    }

    req.query.limit = limitNum;
    req.query.page = pageNum;
    next();
  }

  // Validates description input
  static validateDescriptionUpdate(req, res, next) {
    const desc = req.body.description;
    if (!desc || typeof desc !== 'string' || desc.trim().length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Description is required and must be a non-empty string'
      });
    }
    next();
  }

  // Validates gender input
  static validateGenderUpdate(req, res, next) {
    const allowed = ['male', 'female', 'other'];
    const gender = req.body.gender?.toLowerCase();
    if (!gender || !allowed.includes(gender)) {
      return res.status(400).json({
        success: false,
        message: "Gender must be 'male', 'female', or 'other'"
      });
    }
    next();
  }
    // Validates user preferences object
  static validateUserPreferences(req, res, next) {
    const prefs = req.body.preferences;

    if (!prefs || typeof prefs !== 'object') {
      return res.status(400).json({
        success: false,
        message: 'Preferences must be provided and must be an object'
      });
    }

    const { minAge, maxAge, distanceKm, gender } = prefs;
    const errors = [];

    if (typeof minAge !== 'number' || minAge < 18 || minAge > 99) {
      errors.push({ param: 'minAge', message: 'minAge must be a number between 18 and 99' });
    }

    if (typeof maxAge !== 'number' || maxAge < minAge || maxAge > 99) {
      errors.push({ param: 'maxAge', message: 'maxAge must be a number ≥ minAge and ≤ 99' });
    }

    if (typeof distanceKm !== 'number' || distanceKm < 1 || distanceKm > 500) {
      errors.push({ param: 'distanceKm', message: 'distanceKm must be a number between 1 and 500' });
    }

    const validGenders = ['male', 'female', 'other', 'any'];
    if (gender && !validGenders.includes(gender.toLowerCase())) {
      errors.push({ param: 'gender', message: 'gender must be one of: male, female, other, any' });
    }

    if (errors.length > 0) {
      return res.status(400).json({
        success: false,
        message: 'Invalid user preferences',
        errors
      });
    }

    next();
  }

  // Validates turnOn field (expects a string or array of strings)
  static validateTurnOnInput(req, res, next) {
    const turnOn = req.body.turnOn;

    if (!turnOn || (typeof turnOn !== 'string' && !Array.isArray(turnOn))) {
      return res.status(400).json({
        success: false,
        message: 'turnOn must be a non-empty string or an array of strings'
      });
    }

    if (Array.isArray(turnOn) && !turnOn.every(item => typeof item === 'string')) {
      return res.status(400).json({
        success: false,
        message: 'Each turnOn item must be a string'
      });
    }

    next();
  }

  // Validates crushId in body
  static validateCrushId(req, res, next) {
    const { crushId } = req.body;

    if (!crushId || !ObjectId.isValid(crushId)) {
      return res.status(400).json({
        success: false,
        message: 'crushId must be a valid MongoDB ObjectId'
      });
    }

    req.body.crushId = crushId.toString().trim();
    next();
  }

  // Validates profileImages (expects an array of image URLs)
  static validateProfileImages(req, res, next) {
    const images = req.body.profileImages;

    if (!Array.isArray(images) || images.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'profileImages must be a non-empty array of image URLs'
      });
    }

    const isValidURL = url =>
      typeof url === 'string' && /^https?:\/\/.+\.(jpg|jpeg|png|webp|avif|gif|svg)$/.test(url);

    const invalid = images.filter(url => !isValidURL(url));
    if (invalid.length > 0) {
      return res.status(400).json({
        success: false,
        message: 'One or more profile image URLs are invalid',
        invalidImages: invalid
      });
    }

    next();
  }

}

module.exports = ValidateRequest;
