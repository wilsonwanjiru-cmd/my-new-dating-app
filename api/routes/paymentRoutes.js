const express = require("express");
const {
  initiatePayment,
  handleCallback,
  validateMpesaRequest,
  confirmPayment,
} = require("../controllers/paymentController");

const router = express.Router();

// Middleware for logging incoming requests
const logRoute = (label) => (req, res, next) => {
  console.log(`${label} Endpoint Hit at ${new Date().toISOString()}`);
  next();
};

// Route to initiate payment
router.post("/pay", logRoute("Initiate Payment"), initiatePayment);

// Route to handle M-Pesa callback
router.post("/callback", logRoute("Callback"), handleCallback);

// Route to validate M-Pesa payment request
router.post("/validate", logRoute("Validation"), validateMpesaRequest);

// Route to confirm M-Pesa payment
router.post("/confirm", logRoute("Confirmation"), confirmPayment);

// 404 handler for unmatched routes
router.use((req, res) => {
  res.status(404).json({ message: "Payment endpoint not found" });
});

module.exports = router;
