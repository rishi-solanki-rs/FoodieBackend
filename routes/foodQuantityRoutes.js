const express = require('express');
const router = express.Router();
const { getPublicFoodQuantities } = require('../controllers/foodQuantityController');
router.get('/', getPublicFoodQuantities);
module.exports = router;
