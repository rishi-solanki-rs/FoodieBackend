const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/authMiddleware'); // Ensure you have this
const { upload } = require('../utils/upload');
const {getMyRefunds} = require('../controllers/refundController');
const {
    getProfile,
    updateProfile,
    verifyProfileUpdateOTP,
    resendProfileUpdateOTP,
    changePassword,
    addAddress,
    getAddresses,
    updateAddress,
    deleteAddress,
    addPaymentMethod,
    getPaymentMethods,
    deleteAccount,
    toggleFavoriteRestaurant,
    getFavoriteRestaurants,
    toggleFavoriteProduct,
    getFavoriteProducts,
    saveFCMToken,
    removeFCMToken,
    getNotificationStatus
} = require('../controllers/userController');
router.get('/profile', protect, getProfile);
router.put('/profile', protect, upload.single('profilePic'), updateProfile);
router.post('/profile/verify-otp', protect, verifyProfileUpdateOTP);
router.post('/profile/resend-otp', protect, resendProfileUpdateOTP);
router.put('/change-password', protect, changePassword);
router.get('/address', protect, getAddresses);
router.post('/address', protect, addAddress);
router.put('/address/:id', protect, updateAddress);
router.delete('/address/:id', protect, deleteAddress);
router.get('/payment-methods', protect, getPaymentMethods);
router.post('/payment-method', protect, addPaymentMethod);
router.delete('/account', protect, deleteAccount);
router.get('/refunds', protect, getMyRefunds);
router.get('/favorites/restaurants', protect, getFavoriteRestaurants);
router.post('/favorites/restaurants/:id', protect, toggleFavoriteRestaurant);
router.get('/favorites/products', protect, getFavoriteProducts);
router.post('/favorites/products/:id', protect, toggleFavoriteProduct);
router.post('/fcm-token', protect, saveFCMToken);
router.delete('/fcm-token', protect, removeFCMToken);
router.get('/notification-status', protect, getNotificationStatus);
module.exports = router;
