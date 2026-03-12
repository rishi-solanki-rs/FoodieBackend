const express = require('express');
const router = express.Router();
const { protect, admin } = require('../middleware/authMiddleware');
const {
    getWalletDetails,
    getWalletDetailsByUserId,
    getAllWallets,
    createWallet,
    updateWalletBalance,
    deleteTransaction,
    getTransactionHistory,
    getRiderWallet,
    getAllRidersWallets,
    getRestaurantWallet,
    getAllRestaurantsWallets,
    // Razorpay wallet recharge
    createWalletRechargeOrder,
    verifyWalletRechargePayment,
} = require('../controllers/walletController');

// ── Admin routes ──────────────────────────────────────────────────────────────
router.get('/admin/all', protect, admin, getAllWallets);
router.get('/admin/riders/all', protect, admin, getAllRidersWallets);
router.get('/admin/rider/:riderId', protect, admin, getRiderWallet);
router.get('/admin/restaurants/all', protect, admin, getAllRestaurantsWallets);
router.get('/admin/restaurant/:restaurantId', protect, admin, getRestaurantWallet);
router.post('/admin/create', protect, admin, createWallet);
router.put('/admin/update-balance', protect, admin, updateWalletBalance);
router.delete('/admin/transaction/:transactionId', protect, admin, deleteTransaction);

// ── Customer wallet recharge (Razorpay-backed) ────────────────────────────────
// Step 1: create a Razorpay order — frontend opens checkout pop-up with the returned details
router.post('/create-recharge-order', protect, createWalletRechargeOrder);
// Step 2: verify HMAC signature & credit wallet
router.post('/verify-payment', protect, verifyWalletRechargePayment);

// ── Customer read routes ───────────────────────────────────────────────────────
router.get('/', protect, getWalletDetails);
router.get('/:userId/transactions', protect, getTransactionHistory);
router.get('/:userId', protect, getWalletDetailsByUserId);

module.exports = router;

