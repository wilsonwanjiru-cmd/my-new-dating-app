const express = require("express");
const {
  initiatePayment,
  handleCallback,
  validateMpesaRequest,
  confirmPayment,
} = require("../controllers/paymentController");

const router = express.Router();

// Middleware to log requests for debugging and monitoring
const logRoute = (label) => (req, res, next) => {
  console.log(`[${new Date().toISOString()}] ${label} endpoint hit`);
  next();
};

// @route   POST /api/payments/pay
// @desc    Initiate STK Push payment request
router.post("/pay", logRoute("Initiate Payment"), initiatePayment);

// @route   POST /api/payments/callback
// @desc    Handle asynchronous callback from Safaricom
router.post("/callback", logRoute("Callback"), handleCallback);

// @route   POST /api/payments/validate
// @desc    Validate incoming M-Pesa payment request
router.post("/validate", logRoute("Validation"), validateMpesaRequest);

// @route   POST /api/payments/confirm
// @desc    Confirm completed M-Pesa payment
router.post("/confirm", logRoute("Confirmation"), confirmPayment);

// Handle unmatched payment routes
router.use("*", (req, res) => {
  console.warn(`[${new Date().toISOString()}] Unknown payment route: ${req.originalUrl}`);
  res.status(404).json({ message: "Payment endpoint not found" });
});

module.exports = router;
