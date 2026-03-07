const express = require('express');
const router = express.Router();
const { protect, rider } = require('../middleware/authMiddleware');
const {
    getEarningsSummary,
    getEarningsOrders,
    getSingleOrderEarnings,
    getPayoutHistory,
} = require('../controllers/riderEarningsController');

// All routes require the rider to be authenticated
router.use(protect, rider);

/**
 * GET /api/rider/earnings/summary
 * Overall stats: total orders, today/week/month/all-time earnings + wallet balance.
 */
router.get('/summary', getEarningsSummary);

/**
 * GET /api/rider/earnings/orders
 * Paginated list of delivered orders with per-order earnings.
 * Query: page, limit, from (ISO date), to (ISO date)
 */
router.get('/orders', getEarningsOrders);

/**
 * GET /api/rider/earnings/orders/:orderId
 * Full earnings breakdown for one specific order.
 */
router.get('/orders/:orderId', getSingleOrderEarnings);

/**
 * GET /api/rider/earnings/payouts
 * Wallet / payout history.
 */
router.get('/payouts', getPayoutHistory);

module.exports = router;
