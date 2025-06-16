const express = require('express');
const router = express.Router();

router.post('/register', (req, res) => {
  // Registration logic
});

router.post('/login', (req, res) => {
  // Login logic
});

module.exports = router; // ✅ Export the router directly (NOT as { router })
