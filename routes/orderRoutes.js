const express = require("express");
const router = express.Router();
const rateLimit = require("express-rate-limit");
const {
  protect,
  customer,
  restaurantOwner,
  rider,
  admin,
} = require("../middleware/authMiddleware");
const { checkServiceAvailability } = require("../middleware/checkServiceAvailability");
const {
  validatePlaceOrder,
  validateOrderStatus,
  validateCancelOrder,
  validateRateRider,
  handleValidationErrors,
} = require("../middleware/validateOrder");
const placeOrderLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 20, // 20 orders per minute max
  message: "Too many orders placed. Please try again later.",
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => req.user?.role === "admin", // Skip for admins
});
const generalOrderLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // 100 requests per 15 minutes
  message: "Too many requests. Please try again later.",
  standardHeaders: true,
  legacyHeaders: false,
});
const {
  placeOrder,
  getRestaurantOrders,
  getRestaurantOrderDetails,
  getPendingOrdersForRestaurant,
  getCompletedOrdersForRestaurant,
  updateOrderStatus,
  markOrderReady,
  riderPickupOrder,
  riderCompleteOrder,
  getMyOrders,
  getOrderDetails,
  getOrderDetailsCustomer,   // ✅ NEW
  getOrderDetailsRestaurant, // ✅ NEW
  getOrderDetailsRider,      // ✅ NEW
  trackOrder,
  reorder,
  reportIssue,
  getAllOrdersAdmin,
  getOrderDetailsAdmin,
  adminAssignRider,
  adminUpdateStatus,
  adminCancelOrder,
  getFailedOrdersAdmin,
  ownerRejectOrder,
  ownerCancelOrder,
  ownerDelayOrder,
  riderArrivedRestaurant,
  riderArrivedCustomer,
  riderCollectCash,
  adminRetryPayment,
  adminResolveFailedOrder,
  customerCancelOrder,       
  getOrderTimeline,        
  rateRider,                 
  rateRiderByRestaurant,
  resendOTP,                
  resendPickupOTPByRestaurant,
  searchRidersForOrder,
  // Billing
  getCustomerBill,
  getRestaurantBill,
  getRiderBill,
  getAdminBills,
  getRestaurantBillingHistory,
  getRiderBillingHistory,
} = require("../controllers/orderController");
router.post("/place", protect, checkServiceAvailability, validatePlaceOrder, handleValidationErrors, placeOrderLimiter, placeOrder);
router.get("/my-orders", protect, generalOrderLimiter, getMyOrders);
router.get("/:id/details", protect, generalOrderLimiter, getOrderDetails);
router.get("/:id/customer", protect, customer, generalOrderLimiter, getOrderDetailsCustomer); // ✅ Explicit customer route
router.post("/:id/cancel", protect, customer, validateCancelOrder, handleValidationErrors, generalOrderLimiter, customerCancelOrder);
router.get("/:id/timeline", protect, generalOrderLimiter, getOrderTimeline);
router.post("/:id/rate-rider", protect, customer, validateRateRider, handleValidationErrors, generalOrderLimiter, rateRider);
router.post("/restaurant/:id/rate-rider", protect, restaurantOwner, validateRateRider, handleValidationErrors, generalOrderLimiter, rateRiderByRestaurant);
router.post("/:id/resend-otp", protect, generalOrderLimiter, resendOTP);
router.get("/restaurant", protect, restaurantOwner, getRestaurantOrders);
router.get("/restaurant/:id/details", protect, restaurantOwner, getRestaurantOrderDetails);
router.get("/restaurant/:id", protect, restaurantOwner, generalOrderLimiter, getOrderDetailsRestaurant); // ✅ Explicit restaurant detail route
router.get("/restaurant/pending", protect, restaurantOwner, getPendingOrdersForRestaurant);
router.get("/restaurant/completed", protect, restaurantOwner, getCompletedOrdersForRestaurant);
router.put("/:id/status", protect, restaurantOwner, updateOrderStatus);
router.put("/:id/ready", protect, restaurantOwner, markOrderReady);
router.post("/:id/pickup-otp", protect, restaurantOwner, resendPickupOTPByRestaurant);
router.post("/:id/search-riders", protect, restaurantOwner, searchRidersForOrder);
router.put('/:id/reject', protect, restaurantOwner, ownerRejectOrder);
router.put('/:id/owner-cancel', protect, restaurantOwner, ownerCancelOrder);
router.put('/:id/delay', protect, restaurantOwner, ownerDelayOrder);
router.get("/:id/rider", protect, rider, generalOrderLimiter, getOrderDetailsRider); // ✅ Explicit rider route
router.put("/:id/status", protect, rider, updateOrderStatus); // Protected, typically for Rider/Rest/Admin
router.get("/:id/track", protect, trackOrder);
router.post("/:id/reorder", protect, reorder);
router.post("/:id/report", protect, reportIssue);
router.get("/admin/all", protect, admin, getAllOrdersAdmin);
router.get("/admin/failed", protect, admin, getFailedOrdersAdmin);
router.get("/admin/:id", protect, admin, getOrderDetailsAdmin);
router.put("/admin/:id/assign", protect, admin, adminAssignRider);
router.put("/admin/:id/status", protect, admin, adminUpdateStatus);
router.put("/admin/:id/cancel", protect, admin, adminCancelOrder);
router.post('/admin/:id/retry-payment', protect, admin, adminRetryPayment);
router.put('/admin/:id/resolve', protect, admin, adminResolveFailedOrder);

// ── Billing routes ────────────────────────────────────────────────────────────
// History routes must come BEFORE /:id routes to avoid param conflicts
router.get('/billing/restaurant-history', protect, restaurantOwner, generalOrderLimiter, getRestaurantBillingHistory);
router.get('/billing/rider-history',      protect, rider,           generalOrderLimiter, getRiderBillingHistory);
// Per-order bill routes
router.get('/:id/customer-bill',  protect, customer,        generalOrderLimiter, getCustomerBill);
router.get('/:id/restaurant-bill',protect, restaurantOwner, generalOrderLimiter, getRestaurantBill);
router.get('/:id/rider-bill',     protect, rider,           generalOrderLimiter, getRiderBill);
router.get('/:id/bills',          protect, admin,           generalOrderLimiter, getAdminBills);

module.exports = router;
