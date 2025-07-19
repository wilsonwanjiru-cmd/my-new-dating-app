const { validationResult } = require("express-validator");
const mongoose = require("mongoose");
const { ObjectId } = mongoose.Types;

// Unified error response helper
const sendValidationError = (res, message, errors) => {
  return res.status(400).json({
    success: false,
    message,
    errors,
  });
};

// Validate express-validator results
function validateRequest(req, res, next) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return sendValidationError(
      res,
      "Validation failed",
      errors.array().map((err) => ({
        param: err.param,
        message: err.msg,
        location: err.location,
        ...(process.env.NODE_ENV === "development" && { value: err.value }),
      }))
    );
  }
  next();
}

// Generic ObjectId validator
const isValidObjectId = (id) => ObjectId.isValid(id?.toString().trim());

// Validate MongoDB ObjectId in params
function validateObjectId(req, res, next) {
  const fields = ["userId", "id"];
  const errors = [];

  fields.forEach((field) => {
    const value = req.params[field]?.toString().trim();
    if (value && !isValidObjectId(value)) {
      errors.push({
        param: field,
        message: "Invalid ID format",
        location: "params",
        ...(process.env.NODE_ENV === "development" && { value }),
      });
    }
  });

  if (errors.length > 0) {
    return sendValidationError(res, "Validation failed", errors);
  }

  next();
}

// Validate ObjectId in body
const validateBodyObjectId = (fields = []) => (req, res, next) => {
  const errors = [];

  fields.forEach((field) => {
    const value = req.body[field]?.toString().trim();
    if (!value) {
      errors.push({ param: field, message: "Field is required", location: "body" });
    } else if (!isValidObjectId(value)) {
      errors.push({
        param: field,
        message: "Invalid ID format",
        location: "body",
        ...(process.env.NODE_ENV === "development" && { value }),
      });
    } else {
      req.body[field] = value;
    }
  });

  if (errors.length > 0) {
    return sendValidationError(res, "Validation failed", errors);
  }

  next();
};

// Validate ObjectId in query
const validateQueryObjectId = (field) => (req, res, next) => {
  const value = req.query[field]?.toString().trim();

  if (!value) {
    return sendValidationError(res, `${field} is required`, [
      { param: field, message: "Query parameter is required", location: "query" },
    ]);
  }

  if (!isValidObjectId(value)) {
    return sendValidationError(res, `Invalid ${field} format`, [
      {
        param: field,
        message: "Invalid ID format",
        location: "query",
        ...(process.env.NODE_ENV === "development" && { value }),
      },
    ]);
  }

  req.query[field] = value;
  next();
};

// Sanitize all string inputs
function sanitizeInput(req, res, next) {
  ["body", "params", "query"].forEach((part) => {
    if (req[part]) {
      Object.keys(req[part]).forEach((key) => {
        if (typeof req[part][key] === "string") {
          req[part][key] = req[part][key].trim();
        }
      });
    }
  });
  next();
}

// Validate pagination
function validatePagination(req, res, next) {
  const { limit = "10", page = "1" } = req.query;
  const errors = [];

  const limitNum = parseInt(limit);
  const pageNum = parseInt(page);

  if (isNaN(limitNum) || limitNum < 1 || limitNum > 100) {
    errors.push({
      param: "limit",
      message: "limit must be a number between 1 and 100",
      location: "query",
    });
  }

  if (isNaN(pageNum) || pageNum < 1) {
    errors.push({
      param: "page",
      message: "page must be at least 1",
      location: "query",
    });
  }

  if (errors.length > 0) {
    return sendValidationError(res, "Invalid pagination parameters", errors);
  }

  req.query.limit = limitNum;
  req.query.page = pageNum;
  next();
}

// Validate description
function validateDescriptionUpdate(req, res, next) {
  const desc = req.body.description;
  if (!desc || typeof desc !== "string" || !desc.trim()) {
    return sendValidationError(res, "Invalid description", [
      { param: "description", message: "Must be a non-empty string", location: "body" },
    ]);
  }
  next();
}

// Validate gender
function validateGenderUpdate(req, res, next) {
  const allowed = ["male", "female", "other"];
  const gender = req.body.gender?.toLowerCase();
  if (!allowed.includes(gender)) {
    return sendValidationError(res, "Invalid gender", [
      { param: "gender", message: "Must be 'male', 'female', or 'other'", location: "body" },
    ]);
  }
  next();
}

// Validate preferences
function validateUserPreferences(req, res, next) {
  const prefs = req.body.preferences;
  const errors = [];

  if (!prefs || typeof prefs !== "object") {
    return sendValidationError(res, "Preferences must be provided", [
      { param: "preferences", message: "Must be a valid object", location: "body" },
    ]);
  }

  const { minAge, maxAge, distanceKm, gender } = prefs;

  if (typeof minAge !== "number" || minAge < 18 || minAge > 99) {
    errors.push({ param: "minAge", message: "Must be between 18 and 99" });
  }

  if (typeof maxAge !== "number" || maxAge < minAge || maxAge > 99) {
    errors.push({ param: "maxAge", message: "Must be ≥ minAge and ≤ 99" });
  }

  if (typeof distanceKm !== "number" || distanceKm < 1 || distanceKm > 500) {
    errors.push({ param: "distanceKm", message: "Must be between 1 and 500" });
  }

  const validGenders = ["male", "female", "other", "any"];
  if (gender && !validGenders.includes(gender.toLowerCase())) {
    errors.push({ param: "gender", message: "Must be 'male', 'female', 'other', or 'any'" });
  }

  if (errors.length > 0) {
    return sendValidationError(res, "Invalid user preferences", errors);
  }

  next();
}

// Validate turnOn
function validateTurnOnInput(req, res, next) {
  const turnOn = req.body.turnOn;

  if (!turnOn || (typeof turnOn !== "string" && !Array.isArray(turnOn))) {
    return sendValidationError(res, "Invalid turnOn value", [
      {
        param: "turnOn",
        message: "Must be a non-empty string or array of strings",
        location: "body",
      },
    ]);
  }

  if (Array.isArray(turnOn) && !turnOn.every((item) => typeof item === "string")) {
    return sendValidationError(res, "Invalid turnOn array", [
      {
        param: "turnOn",
        message: "All items in the array must be strings",
        location: "body",
      },
    ]);
  }

  next();
}

// Validate crushId
function validateCrushId(req, res, next) {
  const { crushId } = req.body;

  if (!crushId || !isValidObjectId(crushId)) {
    return sendValidationError(res, "Invalid crushId", [
      {
        param: "crushId",
        message: "Must be a valid MongoDB ObjectId",
        location: "body",
      },
    ]);
  }

  req.body.crushId = crushId.toString().trim();
  next();
}

// Validate profileImages
function validateProfileImages(req, res, next) {
  const images = req.body.profileImages;

  if (!Array.isArray(images) || images.length === 0) {
    return sendValidationError(res, "Invalid profileImages", [
      {
        param: "profileImages",
        message: "Must be a non-empty array of image URLs",
        location: "body",
      },
    ]);
  }

  const isValidURL = (url) => {
    try {
      new URL(url);
      return /^https?:\/\//i.test(url);
    } catch {
      return false;
    }
  };

  const invalid = images.filter((url) => !isValidURL(url));
  if (invalid.length > 0) {
    return sendValidationError(res, "Invalid profile image URLs", [
      {
        param: "profileImages",
        message: "Some image URLs are invalid",
        location: "body",
        ...(process.env.NODE_ENV === "development" && { invalid }),
      },
    ]);
  }

  next();
}

// Export all
module.exports = {
  validateRequest,
  validateObjectId,
  validateBodyObjectId,
  validateQueryObjectId,
  sanitizeInput,
  validatePagination,
  validateDescriptionUpdate,
  validateGenderUpdate,
  validateUserPreferences,
  validateTurnOnInput,
  validateCrushId,
  validateProfileImages,
};
