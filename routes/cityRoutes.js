const express = require('express');
const router = express.Router();
const { getPublicCities } = require('../controllers/cityController');
router.get('/', getPublicCities);
module.exports = router;
