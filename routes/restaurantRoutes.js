const express = require('express');
const router = express.Router();
const { protect, admin, restaurantOwner } = require('../middleware/authMiddleware');
const { upload } = require('../utils/upload');
const {
  getAllRestaurants,
  getRestaurantById,
  applyForRestaurant,
  adminCreateRestaurant,
  getPendingRestaurants,
  approveRestaurant,
  rejectRestaurant,
  updateRestaurant,
  requestRestaurantProfileUpdate,
  verifyRestaurantProfileUpdate,
  getAllRestaurantsForAdmin,
  getAllRestaurantsNameForAdmin,
  deleteRestaurant,
  getActiveRestaurantsForAdmin,
  toggleFavorite,
  updateDocuments,
  updateBankDetails,
  getMyRestaurant,
  getDashboard,
  getAnalyticsDashboard,
  updateSettings,
  financeSummary,
  bestSellers,
  settlementReport,
  getOrderInvoice,
  verifyRestaurantDocuments,
  getAllApprovedRestaurantsForAdmin,
  getRestaurantProductById,
  getRestaurantByIdAdmin,
  getRestaurantWalletEarnings
} = require('../controllers/restaurantController');
const {
  createOwnerPromocode,
  getOwnerPromocodes,
  getOwnerPromocodeById,
  updateOwnerPromocode,
  deleteOwnerPromocode
} = require('../controllers/promocodeController');
router.get('/', getAllRestaurants);
router.get('/:id/details', protect, getRestaurantProductById);
router.post('/apply', protect, upload.fields([
  { name: 'image', maxCount: 1 },
  { name: 'bannerImage', maxCount: 1 },
  { name: 'images', maxCount: 6 },
  { name: 'licenseFrontImage', maxCount: 1 },
  { name: 'licenseBackImage', maxCount: 1 },
  { name: 'panImage', maxCount: 1 },
  { name: 'gstImage', maxCount: 1 },
  { name: 'tradeLicenseImage', maxCount: 1 },
  { name: 'vatImage', maxCount: 1 }
]), applyForRestaurant);
router.get('/profile', protect, restaurantOwner, getMyRestaurant);
router.put('/:id', protect, restaurantOwner, upload.fields([
  { name: 'image', maxCount: 1 },
  { name: 'bannerImage', maxCount: 1 },
  { name: 'images', maxCount: 6 }
]), updateRestaurant);
router.post('/:id/request-update', protect, restaurantOwner, requestRestaurantProfileUpdate);
router.post('/:id/verify-update', protect, restaurantOwner, verifyRestaurantProfileUpdate);
router.put('/:id/documents', protect, restaurantOwner, upload.fields([
  { name: 'licenseFrontImage', maxCount: 1 },
  { name: 'licenseBackImage', maxCount: 1 },
  { name: 'panImage', maxCount: 1 },
  { name: 'gstImage', maxCount: 1 },
  { name: 'tradeLicenseImage', maxCount: 1 },
  { name: 'vatImage', maxCount: 1 }
]), updateDocuments);
router.put('/:id/bank', protect, restaurantOwner, updateBankDetails);
router.get('/dashboard', protect, restaurantOwner, getDashboard);
router.get('/dashboard/analytics', protect, restaurantOwner, getAnalyticsDashboard);
router.put('/:id/settings', protect, restaurantOwner, updateSettings);
router.get('/finance/summary', protect, restaurantOwner, financeSummary);
router.get('/finance/wallet', protect, restaurantOwner, getRestaurantWalletEarnings);
router.get('/finance/bestsellers', protect, restaurantOwner, bestSellers);
router.get('/finance/settlement', protect, restaurantOwner, settlementReport);
router.get('/finance/order/:orderId/invoice', protect, restaurantOwner, getOrderInvoice);
router.post('/promocode', protect, restaurantOwner, upload.single('image'), createOwnerPromocode);
router.get('/promocode', protect, restaurantOwner, getOwnerPromocodes);
router.get('/promocode/:id', protect, restaurantOwner, getOwnerPromocodeById);
router.put('/promocode/:id', protect, restaurantOwner, upload.single('image'), updateOwnerPromocode);
router.delete('/promocode/:id', protect, restaurantOwner, deleteOwnerPromocode);
router.post('/admin/create', protect, admin, upload.fields([
  { name: 'image', maxCount: 1 },
  { name: 'bannerImage', maxCount: 1 },
  { name: 'images', maxCount: 6 },
  { name: 'licenseFrontImage', maxCount: 1 },
  { name: 'licenseBackImage', maxCount: 1 },
  { name: 'panImage', maxCount: 1 },
  { name: 'gstImage', maxCount: 1 },
  { name: 'tradeLicenseImage', maxCount: 1 },
  { name: 'vatImage', maxCount: 1 }
]), adminCreateRestaurant);
router.get('/admin/pending', protect, admin, getPendingRestaurants);
router.put('/admin/:id/bank', protect, admin, updateBankDetails);
router.put('/admin/:id', protect, admin, upload.fields([
  { name: 'image', maxCount: 1 },
  { name: 'bannerImage', maxCount: 1 },
  { name: 'images', maxCount: 6 }
]), updateRestaurant);
router.put('/admin/:id/documents', protect, admin, upload.fields([
  { name: 'licenseFrontImage', maxCount: 1 },
  { name: 'licenseBackImage', maxCount: 1 },
  { name: 'panImage', maxCount: 1 },
  { name: 'gstImage', maxCount: 1 },
  { name: 'tradeLicenseImage', maxCount: 1 },
  { name: 'vatImage', maxCount: 1 }
]), updateDocuments);
router.put('/admin/approve/:id', protect, admin, approveRestaurant);
router.put('/admin/reject/:id', protect, admin, rejectRestaurant);
router.get('/admin/list', protect, admin, getAllRestaurantsForAdmin);
router.get('/admin/approvedlist', protect, admin, getAllApprovedRestaurantsForAdmin);
router.get('/admin/listName', protect, admin, getAllRestaurantsNameForAdmin);
router.get('/admin/list/active', protect, admin, getActiveRestaurantsForAdmin);
router.put('/admin/verify/:id', protect, admin, verifyRestaurantDocuments);
router.get('/admin/:id', protect, admin, getRestaurantByIdAdmin);
router.get('/:id', getRestaurantById);
router.post('/:id/favorite', protect, toggleFavorite);
router.delete('/:id', protect, admin, deleteRestaurant);
module.exports = router;
