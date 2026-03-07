const express = require('express');
const router = express.Router();
const { getPublicZones, lookupZoneByPoint } = require('../controllers/cityController');
router.get('/', getPublicZones);
router.post('/lookup', lookupZoneByPoint);
module.exports = router;
