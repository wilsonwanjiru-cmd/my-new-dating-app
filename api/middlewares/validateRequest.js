const { validationResult, body, param } = require("express-validator");
const mongoose = require("mongoose");
const { logError } = require("../utils/errorLogger");

/**
 * Main validation middleware: Checks for validation errors and responds with 422 if any.
 */
const validateRequest = (req, res, next) => {
  try {
    const errors = validationResult(req);

    if (!errors.isEmpty()) {
      // Log detailed validation error info
      logError("Validation Error", new Error("Request validation failed"), {
        endpoint: req.originalUrl,
        method: req.method,
        validationErrors: errors.array(),
        user: req.user?._id || "anonymous"
      });

      // Send 422 for validation errors
      return res.status(422).json({
        success: false,
        code: "VALIDATION_FAILED",
        message: "Validation failed. Please fix the highlighted fields.",
        errors: errors.array().map((err) => ({
          field: err.param,
          message: err.msg,
          location: err.location,
          ...(process.env.NODE_ENV === "development" && { value: err.value })
        })),
        attemptedPath: req.originalUrl,
        timestamp: new Date().toISOString()
      });
    }

    // ✅ If no errors, move forward
    return next();
  } catch (error) {
    // Catch unexpected runtime errors in validation middleware
    logError("Unexpected Validation Middleware Error", error, {
      endpoint: req.originalUrl,
      method: req.method
    });

    return res.status(500).json({
      success: false,
      code: "VALIDATION_MIDDLEWARE_ERROR",
      message: "Unexpected validation middleware error occurred",
      ...(process.env.NODE_ENV === "development" && { error: error.message })
    });
  }
};

/**
 * ObjectId helper to validate MongoDB IDs properly.
 */
const isValidObjectId = (value) => {
  if (!value) return false;
  const strId = value.toString().trim();
  return mongoose.Types.ObjectId.isValid(strId) &&
    new mongoose.Types.ObjectId(strId).toString() === strId;
};

/**
 * Validate an ObjectId in route parameters.
 */
const validateObjectIdParam = (paramName) => [
  param(paramName)
    .trim()
    .notEmpty().withMessage(`${paramName} is required`)
    .custom(isValidObjectId).withMessage(`Invalid ${paramName} format`),
  validateRequest
];

/**
 * Validate ObjectId inside the request body.
 */
const validateBodyObjectId = (field) => [
  body(field)
    .trim()
    .notEmpty().withMessage(`${field} is required`)
    .custom(isValidObjectId).withMessage(`Invalid ${field} format`),
  validateRequest
];

/**
 * Subscription-specific phone number validation.
 */
const validateSubscriptionRequest = [
  body("phone")
    .trim()
    .notEmpty().withMessage("Phone number is required")
    .matches(/^\+?254[0-9]{9}$/).withMessage("Valid Kenyan phone number required (+254XXXXXXXXX)"),
  validateRequest
];

/**
 * Sanitize incoming inputs (body, params, query) to trim spaces.
 */
const sanitizeInput = (req, res, next) => {
  ["body", "params", "query"].forEach((location) => {
    if (req[location]) {
      Object.keys(req[location]).forEach((key) => {
        if (typeof req[location][key] === "string") {
          req[location][key] = req[location][key].trim();
        }
      });
    }
  });
  return next();
};

module.exports = {
  validateRequest,
  validateObjectIdParam,
  validateSubscriptionRequest,
  validateBodyObjectId,
  sanitizeInput,
  isValidObjectId
};

