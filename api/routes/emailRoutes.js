const express = require("express");
const { verifyEmail } = require("../controllers/emailController");

const router = express.Router();

// Route for verifying email via token
router.get("/verify/:token", verifyEmail);

module.exports = router;