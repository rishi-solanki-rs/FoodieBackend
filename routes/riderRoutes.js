const express = require("express");
const router = express.Router();
const { protect, rider, admin } = require("../middleware/authMiddleware");
const { upload } = require("../utils/upload");
const {
  updateRiderProfile,
  requestRiderProfileUpdate,
  verifyRiderProfileUpdate,
  getRiderProfile,
  getRiderStatus,
  onboardRider,
  toggleStatus,
  updateLocation,
  createRiderByAdmin,
  getAllRiders,
  getPendingRiders,
  getRiderDetails,
  updateRiderByAdmin,
  verifyRider,
  rejectRider,
  deleteRider,
  toggleBreak,
  getEarningsSummary,
  getEarningsHistory,
  requestWithdrawal,
  getWithdrawals,
  createTicket,
  getTickets,
  getTrainingMaterials,
  getRiderDashboard,
  getCompletedOrdersForRider,
  triggerSOS,
  clearSOS,
  riderSettlementReport,
  updateDocuments,
  updateVehicle,
  updateRiderBankDetails,
  verifyRiderVehicle,
  verifyRiderBankDetails,
  sendSOS,
  resolveSOS,
  respondToRideRequest,
  verifyPickup,
  verifyDelivery,
  riderArrivedRestaurant,
  riderArrivedCustomer,
  riderCollectCash,
  getAvailableOrders,
  acceptOrder,
  rejectOrder,
  getMyActiveOrder,
  resendPickupOTP,
  resendDeliveryOTP,
  getActiveRidersWithLocations,
  getRiderLiveTracking,
} = require("../controllers/riderController");
router.get("/profile", protect, rider, getRiderProfile);
router.get("/dashboard", protect, rider, getRiderDashboard);
router.get("/status", protect, rider, getRiderStatus);
router.patch("/profile", protect, rider, upload.single('profilePic'), updateRiderProfile);
router.post("/profile/request-update", protect, rider, requestRiderProfileUpdate);
router.post("/profile/verify-update", protect, rider, verifyRiderProfileUpdate);
router.post("/onboard", protect, rider, upload.fields([
  { name: 'licenseFrontImage', maxCount: 1 },
  { name: 'licenseBackImage', maxCount: 1 },
  { name: 'rcImage', maxCount: 1 },
  { name: 'insuranceImage', maxCount: 1 },
  { name: 'panCardImage', maxCount: 1 },
  { name: 'aadharCardImage', maxCount: 1 },
  { name: 'medicalCertificate', maxCount: 1 },
  { name: 'policyVerification', maxCount: 1 }
]), onboardRider);
router.patch("/status", protect, rider, toggleStatus);
router.patch("/break", protect, rider, toggleBreak);
router.patch("/location", protect, rider, updateLocation);
router.get("/earnings", protect, rider, getEarningsSummary);
router.get("/earnings/history", protect, rider, getEarningsHistory);
router.post("/withdraw", protect, rider, requestWithdrawal);
router.get("/withdrawals", protect, rider, getWithdrawals);
router.post("/tickets", protect, rider, createTicket);
router.get("/tickets", protect, rider, getTickets);
router.get("/training", getTrainingMaterials);
router.post("/sos", protect, rider, sendSOS);
router.post("/sos/resolve", protect, rider, resolveSOS);
router.patch("/sos/clear", protect, rider, clearSOS);
router.post("/requests/:requestId/:action", protect, rider, respondToRideRequest);
router.get("/orders/available", protect, rider, getAvailableOrders);
router.get("/orders/my-active", protect, rider, getMyActiveOrder);
router.get("/orders/completed", protect, rider, getCompletedOrdersForRider);
router.post("/orders/:id/accept", protect, rider, acceptOrder);
router.post("/orders/:id/reject", protect, rider, rejectOrder);
router.post("/orders/verify-pickup", protect, rider, verifyPickup);
router.post("/orders/verify-delivery", protect, rider, verifyDelivery);
router.post("/orders/:id/resend-pickup-otp", protect, rider, resendPickupOTP);
router.post("/orders/:id/resend-delivery-otp", protect, rider, resendDeliveryOTP);
router.put("/orders/:id/arrive-restaurant", protect, rider, riderArrivedRestaurant);
router.put("/orders/:id/arrive-customer", protect, rider, riderArrivedCustomer);
router.put("/orders/:id/collect-cash", protect, rider, riderCollectCash);
router.get("/settlements", protect, rider, riderSettlementReport);
router.put('/documents', protect, rider, upload.fields([
  { name: 'licenseFrontImage', maxCount: 1 },
  { name: 'licenseBackImage', maxCount: 1 },
  { name: 'rcImage', maxCount: 1 },
  { name: 'insuranceImage', maxCount: 1 },
  { name: 'panCardImage', maxCount: 1 },
  { name: 'aadharCardImage', maxCount: 1 },
  { name: 'medicalCertificate', maxCount: 1 },
  { name: 'policyVerification', maxCount: 1 }
]), updateDocuments);
router.patch('/documents', protect, rider, upload.fields([
  { name: 'licenseFrontImage', maxCount: 1 },
  { name: 'licenseBackImage', maxCount: 1 },
  { name: 'rcImage', maxCount: 1 },
  { name: 'insuranceImage', maxCount: 1 },
  { name: 'panCardImage', maxCount: 1 },
  { name: 'aadharCardImage', maxCount: 1 },
  { name: 'medicalCertificate', maxCount: 1 },
  { name: 'policyVerification', maxCount: 1 }
]), updateDocuments);
router.put('/vehicle', protect, rider, updateVehicle);
router.patch('/vehicle', protect, rider, updateVehicle);
router.put('/bank', protect, rider, updateRiderBankDetails);
router.patch('/bank', protect, rider, updateRiderBankDetails);
router.put('/bank-details', protect, rider, updateRiderBankDetails);
router.patch('/bank-details', protect, rider, updateRiderBankDetails);
router.post("/admin/create", protect, admin, upload.fields([
  { name: 'profilePic', maxCount: 1 },
  { name: 'licenseFrontImage', maxCount: 1 },
  { name: 'licenseBackImage', maxCount: 1 },
  { name: 'rcImage', maxCount: 1 },
  { name: 'insuranceImage', maxCount: 1 },
  { name: 'panCardImage', maxCount: 1 },
  { name: 'aadharCardImage', maxCount: 1 },
  { name: 'medicalCertificate', maxCount: 1 },
  { name: 'policyVerification', maxCount: 1 }
]), createRiderByAdmin);
router.get("/admin/all", protect, admin, getAllRiders);
router.get("/admin/pending", protect, admin, getPendingRiders);
router.get("/admin/tracking/active", protect, admin, getActiveRidersWithLocations);
router.get("/admin/tracking/:riderId", protect, admin, getRiderLiveTracking);
router.get("/admin/:id", protect, admin, getRiderDetails);
router.put("/admin/update/:id", protect, admin, upload.fields([
  { name: 'profilePic', maxCount: 1 },
  { name: 'licenseFrontImage', maxCount: 1 },
  { name: 'licenseBackImage', maxCount: 1 },
  { name: 'rcImage', maxCount: 1 },
  { name: 'insuranceImage', maxCount: 1 },
  { name: 'panCardImage', maxCount: 1 },
  { name: 'aadharCardImage', maxCount: 1 },
  { name: 'medicalCertificate', maxCount: 1 },
  { name: 'policyVerification', maxCount: 1 }
]),updateRiderByAdmin);
router.put("/admin/verify/:id", protect, admin, verifyRider);
router.put("/admin/reject/:id", protect, admin, rejectRider);
router.put("/admin/vehicle-verify/:id", protect, admin, verifyRiderVehicle);
router.put("/admin/bank-verify/:id", protect, admin, verifyRiderBankDetails);
router.delete("/admin/delete/:id", protect, admin, deleteRider);
module.exports = router;
