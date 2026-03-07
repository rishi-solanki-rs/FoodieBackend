const express = require('express');
const router = express.Router();
const { protect, admin } = require('../middleware/authMiddleware');
const {
    getWalletDetails,
    getWalletDetailsByUserId,
    addMoneyToWallet,
    getAllWallets,
    createWallet,
    updateWalletBalance,
    deleteTransaction,
    getTransactionHistory,
    getRiderWallet,
    getAllRidersWallets,
    getRestaurantWallet,
    getAllRestaurantsWallets,
} = require('../controllers/walletController');
router.get('/admin/all', protect, admin, getAllWallets);
router.get('/admin/riders/all', protect, admin, getAllRidersWallets);
router.get('/admin/rider/:riderId', protect, admin, getRiderWallet);
router.get('/admin/restaurants/all', protect, admin, getAllRestaurantsWallets);
router.get('/admin/restaurant/:restaurantId', protect, admin, getRestaurantWallet);
router.post('/admin/create', protect, admin, createWallet);
router.put('/admin/update-balance', protect, admin, updateWalletBalance);
router.delete('/admin/transaction/:transactionId', protect, admin, deleteTransaction);
router.get('/', protect, getWalletDetails);
router.post('/add/money', protect, addMoneyToWallet);
router.get('/:userId/transactions', protect, getTransactionHistory);
router.get('/:userId', protect, getWalletDetailsByUserId);
module.exports = router;
