const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/authMiddleware');
const incentiveController = require('../controllers/incentiveController');
router.get('/my', protect, incentiveController.getMyIncentives);
module.exports = router;
