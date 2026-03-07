const express = require('express');
const router = express.Router();
const {
  confirmCODCollection,
  getRiderWallet,
  getRiderWalletByAdmin,
  riderDepositCash,
  setRiderCashLimit,
  getFrozenRiders,
  getRestaurantWallet,
  getRestaurantWalletByAdmin,
  getAdminSummary,
  triggerWeeklyPayout,
  calculateDeliveryFee,
  getAllTransactions,
  getAllRestaurantWallets,
  getAllRiderWallets,
} = require('../controllers/paymentSystemController');
const { protect, admin, rider, restaurantOwner } = require('../middleware/authMiddleware');
router.post('/calculate-delivery-fee', protect, calculateDeliveryFee);
router.post('/cod/confirm', protect, rider, confirmCODCollection);
router.get('/rider/wallet', protect, rider, getRiderWallet);
router.get('/restaurant/wallet', protect, restaurantOwner, getRestaurantWallet);
router.post('/rider/deposit', protect, admin, riderDepositCash);
router.post('/rider/cash-limit', protect, admin, setRiderCashLimit);
router.get('/rider/wallet/:riderId', protect, admin, getRiderWalletByAdmin);
router.get('/rider/frozen-riders', protect, admin, getFrozenRiders);
router.get('/restaurant/wallet/:restaurantId', protect, admin, getRestaurantWalletByAdmin);
router.get('/admin/summary', protect, admin, getAdminSummary);
router.post('/admin/weekly-payout', protect, admin, triggerWeeklyPayout);
router.get('/admin/transactions', protect, admin, getAllTransactions);
router.get('/restaurants/wallets', protect, admin, getAllRestaurantWallets);
router.get('/riders/wallets', protect, admin, getAllRiderWallets);
module.exports = router;
