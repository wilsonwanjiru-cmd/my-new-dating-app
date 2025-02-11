const express = require("express");
const {
  initiatePayment,
  handleCallback,
  validateMpesaRequest,
  confirmPayment,
} = require("../controllers/paymentController");

const router = express.Router();

// Route to initiate payment
router.post("/pay", (req, res, next) => {
  console.log("Initiate Payment Endpoint Hit");
  next();
}, initiatePayment);

// Route to handle M-Pesa callback
router.post("/callback", (req, res, next) => {
  console.log("Callback Endpoint Hit");
  next();
}, handleCallback);

// Route to validate M-Pesa payment
router.post("/validate", (req, res, next) => {
  console.log("Validation Endpoint Hit");
  next();
}, validateMpesaRequest);

// Route to confirm M-Pesa payment
router.post("/confirm", (req, res, next) => {
  console.log("Confirmation Endpoint Hit");
  next();
}, confirmPayment);

// 404 handler for unmatched payment routes
router.use((req, res) => {
  res.status(404).json({ message: "Payment endpoint not found" });
});

module.exports = router;
