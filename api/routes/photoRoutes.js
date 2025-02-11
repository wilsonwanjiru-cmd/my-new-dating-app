// routes/photoRoutes.js
const express = require('express');
const validateSubscription = require('../middlewares/validateSubscription');
const photoController = require('../controllers/photoController');
const router = express.Router();

router.get('/all', validateSubscription, photoController.getAllPhotos);
router.get('/free', photoController.getFreePhotos);

module.exports = router;