const express = require("express");
const router = express.Router();
const { protect } = require("../middleware/authMiddleware");
const {
    createRazorpayOrder,
    verifyRazorpayPayment,
} = require("../controllers/paymentController");

// Create a Razorpay order (call this before showing the Razorpay checkout popup on the frontend)
router.post("/create-order", protect, createRazorpayOrder);

// Verify payment after user completes Razorpay checkout (called by frontend with signature)
router.post("/verify-payment", protect, verifyRazorpayPayment);

module.exports = router;
