const express = require('express');
const { protect, admin } = require('../middleware/authMiddleware');
const {
    getRestaurantReport,
    getRiderReport,
    getOrderReport,
    getTopUsersReport,
    getWalletReport,
    getProfitLossReport,
    exportReport
} = require('../controllers/reportController');
const router = express.Router();
router.use(protect);
router.use(admin);
router.get('/restaurants', getRestaurantReport);
router.get('/riders', getRiderReport);
router.get('/orders', getOrderReport);
router.get('/top-users', getTopUsersReport);
router.get('/wallet', getWalletReport);
router.get('/profit-loss', getProfitLossReport);
router.get('/export/:reportType', exportReport);
module.exports = router;
