const express = require('express');
const {
    getPublicSettings,
    getPricingSettings,
    updatePricingSettings,
    getGstSettings,
    updateGstSettings,
    getPayoutSettings,
    updatePayoutSettings,
} = require('../controllers/adminSettingsController');
const { protect, admin } = require('../middleware/authMiddleware');
const router = express.Router();

// ── Public ──────────────────────────────────────────────────────────────────
router.get('/', getPublicSettings);

// Full pricing summary (platform fee + delivery slabs + GST + payout)
router.get('/pricing', getPricingSettings);

// GST info (used by restaurant product form to show available slabs)
router.get('/gst', getGstSettings);

// ── Admin only ───────────────────────────────────────────────────────────────
// Update everything in one shot
router.put('/pricing', protect, admin, updatePricingSettings);

// Update just the default GST
router.put('/gst', protect, admin, updateGstSettings);

// Get / update payout / commission settings
router.get('/payout', protect, admin, getPayoutSettings);
router.put('/payout', protect, admin, updatePayoutSettings);

module.exports = router;
