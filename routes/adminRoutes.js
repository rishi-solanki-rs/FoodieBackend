const express = require("express");
const router = express.Router();
const { protect, admin } = require("../middleware/authMiddleware");
const { upload } = require("../utils/upload");
const {
  addMasterCategory,
  getAllMasterCategories,
  getMasterCategoryById,
  updateMasterCategory,
  deleteMasterCategory,
  addUnit,
  getAllUnits,
  getUnitById,
  updateUnit,
  deleteUnit,
  addTag,
  getAllTags,
  getTagById,
  updateTag,
  deleteTag,
  addAddon,
  getAllAddons,
  getAddonById,
  updateAddon,
  deleteAddon,
  addBrand,
  getAllBrands,
  getBrandById,
  updateBrand,
  deleteBrand,
  addCuisine,
  getAllCuisines,
  getCuisineById,
  updateCuisine,
  deleteCuisine,
  addDocumentType,
  getAllDocumentTypes,
  getDocumentTypeById,
  updateDocumentType,
  deleteDocumentType,
  addCancellationReason,
  getAllCancellationReasons,
  getCancellationReasonById,
  updateCancellationReason,
  deleteCancellationReason,
  addBanner,
  getAllBanners,
  getBannerById,
  updateBanner,
  deleteBanner,
  getAllRestaurantCategories,
  getRestaurantCategoryById,
  updateRestaurantCategory,
  deleteRestaurantCategory,
} = require("../controllers/adminContentController");
const adminController = require("../controllers/adminController");
const dashboardController = require("../controllers/dashboardController");
const {
  getAdminSettings,
  updateAdminSettings,
} = require("../controllers/adminSettingsController");
const {
  addPromocode,
  getAllPromocodes,
  getPromocodeById,
  updatePromocode,
  deletePromocode,
} = require("../controllers/promocodeController");
const {
  addVehicle,
  getAllVehicles,
  getVehicleById,
  updateVehicle,
  deleteVehicle,
} = require('../controllers/vehicleController');
const {
  addCity,
  getAllCitiesAdmin,
  getCityById,
  updateCity,
  deleteCity,
  addZone,
  getZonesByCityAdmin,
  getZoneById,
  updateZone,
  deleteZone,
} = require('../controllers/cityController');
const {
  verifyRestaurantDocuments,
} = require("../controllers/restaurantController");
const {
  getAllWithdrawals,
  approveWithdrawal,
  rejectWithdrawal,
} = require("../controllers/withdrawalController");
const {
  getAllTickets,
  updateTicket,
} = require("../controllers/supportController");
const {
  addMaterial,
  deleteMaterial,
} = require("../controllers/trainingController");
const {
  adminRiderSettlements,
  adminGetActiveSOS,
  adminClearSOS,
} = require("../controllers/riderController");
const {
  createIncentive,
  getAllIncentivesAdmin,
  updateIncentive,
  deleteIncentive,
  assignIncentive,
} = require("../controllers/incentiveController");
const {
  addGroup,
  getAllGroups,
  getGroupById,
  updateGroup,
  deleteGroup,
} = require('../controllers/groupController');
const {
  addGroupTag,
  getAllGroupTags,
  getGroupTagById,
  updateGroupTag,
  deleteGroupTag,
} = require('../controllers/groupTagController');
const {
  addFilterCategory,
  getAllFilterCategories,
  getFilterCategoryById,
  updateFilterCategory,
  deleteFilterCategory,
  addSubcategory,
  searchSubcategories,
} = require('../controllers/filterController');
const foodQuantityController = require('../controllers/foodQuantityController');
const {
  getAllRefundsAdmin,
  approveRefund,
  rejectRefund,
} = require("../controllers/refundController");
router.post("/master-category", protect, admin, upload.single('image'), addMasterCategory);
router.get("/master-category", protect, admin, getAllMasterCategories);
router.get("/master-category/:id", protect, admin, getMasterCategoryById);
router.put("/master-category/:id", protect, admin, upload.single('image'), updateMasterCategory);
router.delete("/master-category/:id", protect, admin, deleteMasterCategory);

// Restaurant Categories (all categories from all restaurants)
router.get("/restaurant-categories", protect, admin, getAllRestaurantCategories);
router.get("/restaurant-categories/:id", protect, admin, getRestaurantCategoryById);
router.put("/restaurant-categories/:id", protect, admin, upload.single('image'), updateRestaurantCategory);
router.delete("/restaurant-categories/:id", protect, admin, deleteRestaurantCategory); router.post("/unit", protect, admin, addUnit);
router.get("/unit", protect, admin, getAllUnits);
router.get("/unit/:id", protect, admin, getUnitById);
router.put("/unit/:id", protect, admin, updateUnit);
router.delete("/unit/:id", protect, admin, deleteUnit);
router.post("/tag", protect, admin, upload.single('image'), addTag);
router.get("/tag", protect, admin, getAllTags);
router.get("/tag/:id", protect, admin, getTagById);
router.put("/tag/:id", protect, admin, upload.single('image'), updateTag);
router.delete("/tag/:id", protect, admin, deleteTag);
router.post("/addon", protect, admin, addAddon);
router.get("/addon", protect, admin, getAllAddons);
router.get("/addon/:id", protect, admin, getAddonById);
router.put("/addon/:id", protect, admin, updateAddon);
router.delete("/addon/:id", protect, admin, deleteAddon);
router.post("/brand", protect, admin, addBrand);
router.get("/brand", protect, admin, getAllBrands);
router.get("/brand/:id", protect, admin, getBrandById);
router.put("/brand/:id", protect, admin, updateBrand);
router.delete("/brand/:id", protect, admin, deleteBrand);
router.post("/cuisine", protect, admin, addCuisine);
router.get("/cuisine", protect, admin, getAllCuisines);
router.get("/cuisine/:id", protect, admin, getCuisineById);
router.put("/cuisine/:id", protect, admin, updateCuisine);
router.delete("/cuisine/:id", protect, admin, deleteCuisine);
router.post("/document-type", protect, admin, addDocumentType);
router.get("/document-type", protect, admin, getAllDocumentTypes);
router.get("/document-type/:id", protect, admin, getDocumentTypeById);
router.put("/document-type/:id", protect, admin, updateDocumentType);
router.delete("/document-type/:id", protect, admin, deleteDocumentType);
router.get("/settings", protect, admin, getAdminSettings);
router.put("/settings", protect, admin, updateAdminSettings);
router.post("/cancellation-reason", protect, admin, addCancellationReason);
router.get("/cancellation-reason", protect, admin, getAllCancellationReasons);
router.get("/cancellation-reason/:id", protect, admin, getCancellationReasonById);
router.put("/cancellation-reason/:id", protect, admin, updateCancellationReason);
router.delete("/cancellation-reason/:id", protect, admin, deleteCancellationReason);
router.post("/promocode", protect, admin, upload.single('image'), addPromocode);
router.get("/promocode", protect, admin, getAllPromocodes);
router.get("/promocode/:id", protect, admin, getPromocodeById);
router.put("/promocode/:id", protect, admin, upload.single('image'), updatePromocode);
router.delete("/promocode/:id", protect, admin, deletePromocode);
router.get(
  "/restaurants/pending-verification",
  protect,
  admin,
  adminController.getPendingVerificationRestaurants
);
router.put(
  "/restaurants/verify/:id",
  protect,
  admin,
  verifyRestaurantDocuments
);
router.get("/withdrawals", protect, admin, getAllWithdrawals);
router.put("/withdrawals/:id/approve", protect, admin, approveWithdrawal);
router.put("/withdrawals/:id/reject", protect, admin, rejectWithdrawal);
router.get("/tickets", protect, admin, getAllTickets);
router.put("/tickets/:id", protect, admin, updateTicket);
router.post("/training", protect, admin, addMaterial);
router.delete("/training/:id", protect, admin, deleteMaterial);
router.get("/riders/settlements", protect, admin, adminRiderSettlements);
router.get("/riders/transactions", protect, admin, adminController.getRiderTransactions);
router.get("/riders/sos-active", protect, admin, adminGetActiveSOS);
router.put("/riders/sos/:id/clear", protect, admin, adminClearSOS);
router.get("/dashboard", protect, admin, adminController.getDashboard);
router.get("/dashboard/overview", protect, admin, dashboardController.getOverview);
router.get('/orders/dashboard', protect, admin, adminController.getOrdersDashboard);
router.get('/order-dashboard', protect, admin, adminController.getOrdersDashboard);
router.get("/users", protect, admin, adminController.getAllUsers);
router.get("/users/:id", protect, admin, adminController.getUserById);
router.put("/users/:id/block", protect, admin, adminController.blockUser);
router.put("/users/:id/cod", protect, admin, adminController.toggleUserCOD);
router.post(
  "/users/:id/wallet-adjust",
  protect,
  admin,
  adminController.adjustWallet
);
router.get(
  "/reports/revenue",
  protect,
  admin,
  adminController.getRevenueReport
);
router.get(
  "/reports/commission",
  protect,
  admin,
  adminController.getCommissionReport
);
router.get(
  "/reports/cancellations",
  protect,
  admin,
  adminController.getCancellationReport
);
router.get(
  "/reports/success-ratio",
  protect,
  admin,
  adminController.getOrderSuccessRatio
);
router.get(
  "/pending-menus",
  protect,
  admin,
  adminController.getAllPendingMenuItems
);
router.get(
  "/pending-menus/by-restaurant",
  protect,
  admin,
  adminController.getPendingMenusByRestaurant
);
router.get(
  "/menu-stats",
  protect,
  admin,
  adminController.getMenuApprovalStats
);
router.get(
  "/menu/:restaurantId",
  protect,
  admin,
  adminController.getRestaurantMenuAdmin
);
router.put(
  "/restaurants/:id/approve-menu",
  protect,
  admin,
  adminController.approveRestaurantMenu
);
router.patch(
  "/restaurants/:id/approve-menu",
  protect,
  admin,
  adminController.approveRestaurantMenu
);
router.put(
  "/products/:id/approve",
  protect,
  admin,
  adminController.approveProduct
);
router.put(
  "/products/:id/reject",
  protect,
  admin,
  adminController.rejectProduct
);
router.put(
  "/products/:id/discount",
  protect,
  admin,
  adminController.setProductDiscount
);
router.put(
  "/products/:id/commission",
  protect,
  admin,
  adminController.setProductCommission
);

router.put(
  "/menu/:id",
  protect,
  admin,
  upload.single('image'),
  adminController.updateMenuItemAdmin
);
router.delete(
  "/menu/:id",
  protect,
  admin,
  adminController.deleteMenuItemAdmin
);
router.post("/banner", protect, admin, upload.single('image'), addBanner);
router.get("/banner", protect, admin, getAllBanners);
router.get("/banner/:id", protect, admin, getBannerById);
router.put("/banner/:id", protect, admin, upload.single('image'), updateBanner);
router.delete("/banner/:id", protect, admin, deleteBanner);
router.post('/vehicles', protect, admin, upload.fields([
  { name: 'vehicleImage', maxCount: 1 },
  { name: 'rcImage', maxCount: 1 },
  { name: 'insuranceImage', maxCount: 1 }
]), addVehicle);
router.get('/vehicles', protect, admin, getAllVehicles);
router.get('/vehicles/:id', protect, admin, getVehicleById);
router.put('/vehicles/:id', protect, admin, upload.fields([
  { name: 'vehicleImage', maxCount: 1 },
  { name: 'rcImage', maxCount: 1 },
  { name: 'insuranceImage', maxCount: 1 }
]), updateVehicle);
router.delete('/vehicles/:id', protect, admin, deleteVehicle);
router.post('/cities', protect, admin, addCity);
router.get('/cities', protect, admin, getAllCitiesAdmin);
router.get('/cities/:id', protect, admin, getCityById);
router.put('/cities/:id', protect, admin, updateCity);
router.delete('/cities/:id', protect, admin, deleteCity);
router.post('/cities/:cityId/zones', protect, admin, addZone);
router.get('/cities/:cityId/zones', protect, admin, getZonesByCityAdmin);
router.get('/zones/:id', protect, admin, getZoneById);
router.put('/zones/:id', protect, admin, updateZone);
router.delete('/zones/:id', protect, admin, deleteZone);
router.get("/refunds", protect, admin, getAllRefundsAdmin);
router.post("/refunds/:id/approve", protect, admin, approveRefund);
router.post("/refunds/:id/reject", protect, admin, rejectRefund);
router.post("/incentives", protect, admin, createIncentive);
router.get("/incentives", protect, admin, getAllIncentivesAdmin);
router.put("/incentives/:id", protect, admin, updateIncentive);
router.delete("/incentives/:id", protect, admin, deleteIncentive);
router.post("/incentives/:id/assign", protect, admin, assignIncentive);
router.post('/groups', protect, admin, upload.single('image'), addGroup);
router.get('/groups', protect, admin, getAllGroups);
router.get('/groups/:id', protect, admin, getGroupById);
router.put('/groups/:id', protect, admin, upload.single('image'), updateGroup);
router.delete('/groups/:id', protect, admin, deleteGroup);
router.post('/groups/tags', protect, admin, upload.single('image'), addGroupTag);
router.get('/groups/tags', protect, admin, getAllGroupTags);
router.get('/groups/tags/:id', protect, admin, getGroupTagById);
router.put('/groups/tags/:id', protect, admin, upload.single('image'), updateGroupTag);
router.delete('/groups/tags/:id', protect, admin, deleteGroupTag);
router.post('/filters', protect, admin, addFilterCategory);
router.get('/filters', protect, admin, getAllFilterCategories);
router.get('/filters/:id', protect, admin, getFilterCategoryById);
router.put('/filters/:id', protect, admin, updateFilterCategory);
router.delete('/filters/:id', protect, admin, deleteFilterCategory);
router.post('/filters/:id/subcategories', protect, admin, addSubcategory);
router.get('/filters/subcategories', protect, admin, searchSubcategories);
router.post('/food-quantities', protect, admin, foodQuantityController.addFoodQuantity);
router.get('/food-quantities', protect, admin, foodQuantityController.getAllFoodQuantities);
router.get('/food-quantities/:id', protect, admin, foodQuantityController.getFoodQuantityById);
router.put('/food-quantities/:id', protect, admin, foodQuantityController.updateFoodQuantity);
router.delete('/food-quantities/:id', protect, admin, foodQuantityController.deleteFoodQuantity);
// Commission & Payout Routes
router.get('/commission-details', protect, admin, adminController.getAdminCommissionDetails);
router.post('/process-payout', protect, admin, adminController.processAdminPayout);

// Manual Restaurant & Rider Payouts
router.post('/restaurant/:restaurantId/payout', protect, admin, adminController.processRestaurantPayout);
router.post('/rider/:riderId/payout', protect, admin, adminController.processRiderPayout);

module.exports = router;
