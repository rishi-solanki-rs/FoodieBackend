const AdminSetting = require('../models/AdminSetting');

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Get or create singleton AdminSetting document */
const ensureSettings = async () => {
  const existing = await AdminSetting.findOne();
  if (existing) return existing;
  return AdminSetting.create({});
};

const toPublicPayload = (settings) => ({
  appName: settings.appName || 'Food Delivery',
  logoUrl: settings.logoUrl || '',
  contactEmail: settings.contactEmail || '',
  contactPhone: settings.contactPhone || '',
  termsUrl: settings.termsUrl || '',
  privacyUrl: settings.privacyUrl || '',
});

// ─── Branding / Public ───────────────────────────────────────────────────────

/** GET /api/settings — public app info */
exports.getPublicSettings = async (req, res) => {
  try {
    const settings = await ensureSettings();
    res.status(200).json(toPublicPayload(settings));
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

/** GET /api/admin/settings — full settings (admin only) */
exports.getAdminSettings = async (req, res) => {
  try {
    const settings = await ensureSettings();
    res.status(200).json({ success: true, settings });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

/** PUT /api/admin/settings — update branding fields */
exports.updateAdminSettings = async (req, res) => {
  try {
    const settings = await ensureSettings();
    const fields = ['appName', 'logoUrl', 'contactEmail', 'contactPhone', 'termsUrl', 'privacyUrl'];
    fields.forEach((f) => {
      if (typeof req.body[f] === 'string') settings[f] = req.body[f];
    });
    await settings.save();
    res.status(200).json({ success: true, settings });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// ─── Pricing Settings ────────────────────────────────────────────────────────

/**
 * GET /api/settings/pricing
 * Public — frontend uses this to show the full fee breakdown before checkout.
 */
exports.getPricingSettings = async (req, res) => {
  try {
    const settings = await ensureSettings();
    res.status(200).json({
      success: true,
      gst: {
        defaultGstPercent: settings.defaultGstPercent ?? 5,
        availableSlabs: [0, 5, 12, 18],
        platformFeeGstPercent: settings.platformFeeGstPercent ?? 18,
        deliveryChargeGstPercent: settings.deliveryChargeGstPercent ?? 18,
        adminCommissionGstPercent: settings.adminCommissionGstPercent ?? 18,
      },
      platformFee: settings.platformFee ?? 9,
      smallCartThreshold: settings.smallCartThreshold ?? 0,
      smallCartFee: settings.smallCartFee ?? 0,
      deliverySlabs: settings.deliverySlabs ?? {},
      payoutConfig: settings.payoutConfig ?? {},
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * PUT /api/settings/pricing
 * Admin only — update any or all pricing fields.
 *
 * Body (all fields optional, only provided fields are updated):
 * {
 *   defaultGstPercent: 5,             // 0 | 5 | 12 | 18
 *   platformFeeGstPercent: 18,        // 0..28
 *   deliveryChargeGstPercent: 18,     // 0..28
 *   adminCommissionGstPercent: 18,    // 0..28
 *   platformFee: 9,
 *   smallCartThreshold: 100,
 *   smallCartFee: 20,
 *   deliverySlabs: {
 *     firstSlabMaxKm: 5,  firstSlabRatePerKm: 3,
 *     secondSlabMaxKm: 10, secondSlabRatePerKm: 4,
 *     thirdSlabRatePerKm: 6
 *   },
 *   payoutConfig: {
 *     defaultRestaurantCommissionPercent: 10,
 *     riderBaseEarningPerDelivery: 30,
 *     riderPerKmRate: 5,
 *     riderBaseDistanceKm: 3
 *   }
 * }
 */
exports.updatePricingSettings = async (req, res) => {
  try {
    const settings = await ensureSettings();
    const {
      defaultGstPercent,
      platformFeeGstPercent,
      deliveryChargeGstPercent,
      adminCommissionGstPercent,
      platformFee,
      smallCartThreshold,
      smallCartFee,
      deliverySlabs,
      payoutConfig,
    } = req.body;

    // GST default
    if (defaultGstPercent !== undefined) {
      const v = Number(defaultGstPercent);
      if (![0, 5, 12, 18].includes(v)) {
        return res.status(400).json({ success: false, message: 'defaultGstPercent must be 0, 5, 12, or 18' });
      }
      settings.defaultGstPercent = v;
    }

    const validateGstPercent = (name, value) => {
      const v = Number(value);
      if (!Number.isFinite(v) || v < 0 || v > 28) {
        return `${name} must be between 0 and 28`;
      }
      return null;
    };

    if (platformFeeGstPercent !== undefined) {
      const err = validateGstPercent('platformFeeGstPercent', platformFeeGstPercent);
      if (err) return res.status(400).json({ success: false, message: err });
      settings.platformFeeGstPercent = Number(platformFeeGstPercent);
    }

    if (deliveryChargeGstPercent !== undefined) {
      const err = validateGstPercent('deliveryChargeGstPercent', deliveryChargeGstPercent);
      if (err) return res.status(400).json({ success: false, message: err });
      settings.deliveryChargeGstPercent = Number(deliveryChargeGstPercent);
    }

    if (adminCommissionGstPercent !== undefined) {
      const err = validateGstPercent('adminCommissionGstPercent', adminCommissionGstPercent);
      if (err) return res.status(400).json({ success: false, message: err });
      settings.adminCommissionGstPercent = Number(adminCommissionGstPercent);
    }

    // Platform fee
    if (platformFee !== undefined) {
      const v = Number(platformFee);
      if (isNaN(v) || v < 0) return res.status(400).json({ success: false, message: 'platformFee must be ≥ 0' });
      settings.platformFee = v;
    }

    // Small cart
    if (smallCartThreshold !== undefined) settings.smallCartThreshold = Math.max(0, Number(smallCartThreshold));
    if (smallCartFee !== undefined) settings.smallCartFee = Math.max(0, Number(smallCartFee));

    // Delivery slabs
    if (deliverySlabs && typeof deliverySlabs === 'object') {
      const cur = settings.deliverySlabs || {};
      settings.deliverySlabs = {
        baseDeliveryFee: Number(deliverySlabs.baseDeliveryFee ?? cur.baseDeliveryFee ?? 0),
        firstSlabMaxKm: Number(deliverySlabs.firstSlabMaxKm ?? cur.firstSlabMaxKm ?? 5),
        firstSlabRatePerKm: Number(deliverySlabs.firstSlabRatePerKm ?? cur.firstSlabRatePerKm ?? 3),
        secondSlabMaxKm: Number(deliverySlabs.secondSlabMaxKm ?? cur.secondSlabMaxKm ?? 10),
        secondSlabRatePerKm: Number(deliverySlabs.secondSlabRatePerKm ?? cur.secondSlabRatePerKm ?? 4),
        thirdSlabRatePerKm: Number(deliverySlabs.thirdSlabRatePerKm ?? cur.thirdSlabRatePerKm ?? 6),
      };
    }

    // Payout / commission config
    if (payoutConfig && typeof payoutConfig === 'object') {
      const cur = settings.payoutConfig || {};
      const clamp = (v, min, max) => Math.min(max, Math.max(min, Number(v)));
      settings.payoutConfig = {
        defaultRestaurantCommissionPercent: payoutConfig.defaultRestaurantCommissionPercent !== undefined
          ? clamp(payoutConfig.defaultRestaurantCommissionPercent, 0, 100)
          : (cur.defaultRestaurantCommissionPercent ?? 10),
        riderBaseEarningPerDelivery: payoutConfig.riderBaseEarningPerDelivery !== undefined
          ? Math.max(0, Number(payoutConfig.riderBaseEarningPerDelivery))
          : (cur.riderBaseEarningPerDelivery ?? 30),
        riderPerKmRate: payoutConfig.riderPerKmRate !== undefined
          ? Math.max(0, Number(payoutConfig.riderPerKmRate))
          : (cur.riderPerKmRate ?? 5),
        riderBaseDistanceKm: payoutConfig.riderBaseDistanceKm !== undefined
          ? Math.max(0, Number(payoutConfig.riderBaseDistanceKm))
          : (cur.riderBaseDistanceKm ?? 3),
        riderIncentivePercent: payoutConfig.riderIncentivePercent !== undefined
          ? clamp(payoutConfig.riderIncentivePercent, 0, 100)
          : (cur.riderIncentivePercent ?? 5),
      };
    }

    await settings.save();
    res.status(200).json({
      success: true,
      message: 'Pricing settings updated',
      settings: {
        defaultGstPercent: settings.defaultGstPercent,
        platformFeeGstPercent: settings.platformFeeGstPercent,
        deliveryChargeGstPercent: settings.deliveryChargeGstPercent,
        adminCommissionGstPercent: settings.adminCommissionGstPercent,
        platformFee: settings.platformFee,
        smallCartThreshold: settings.smallCartThreshold,
        smallCartFee: settings.smallCartFee,
        deliverySlabs: settings.deliverySlabs,
        payoutConfig: settings.payoutConfig,
      },
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// ─── GST-only shortcut ────────────────────────────────────────────────────────

/**
 * GET /api/settings/gst
 * Public — returns the active default GST slab and available options.
 */
exports.getGstSettings = async (req, res) => {
  try {
    const settings = await ensureSettings();
    res.status(200).json({
      success: true,
      defaultGstPercent: settings.defaultGstPercent ?? 5,
      availableSlabs: [0, 5, 12, 18],
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * PUT /api/settings/gst
 * Admin only — update just the default GST percent.
 * Body: { defaultGstPercent: 12 }
 */
exports.updateGstSettings = async (req, res) => {
  try {
    const settings = await ensureSettings();
    const v = Number(req.body.defaultGstPercent);
    if (![0, 5, 12, 18].includes(v)) {
      return res.status(400).json({ success: false, message: 'defaultGstPercent must be 0, 5, 12, or 18' });
    }
    settings.defaultGstPercent = v;
    await settings.save();
    res.status(200).json({ success: true, message: 'GST setting updated', defaultGstPercent: v });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// ─── Payout-only shortcut ─────────────────────────────────────────────────────

/**
 * GET /api/settings/payout
 * Admin only — get payout/commission config.
 */
exports.getPayoutSettings = async (req, res) => {
  try {
    const settings = await ensureSettings();
    res.status(200).json({ success: true, payoutConfig: settings.payoutConfig ?? {} });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * PUT /api/settings/payout
 * Admin only — update payout/commission config.
 */
exports.updatePayoutSettings = async (req, res) => {
  try {
    const settings = await ensureSettings();
    const cur = settings.payoutConfig || {};
    const b = req.body;
    const clamp = (v, min, max) => Math.min(max, Math.max(min, Number(v)));

    settings.payoutConfig = {
      defaultRestaurantCommissionPercent: b.defaultRestaurantCommissionPercent !== undefined
        ? clamp(b.defaultRestaurantCommissionPercent, 0, 100)
        : (cur.defaultRestaurantCommissionPercent ?? 10),
      riderBaseEarningPerDelivery: b.riderBaseEarningPerDelivery !== undefined
        ? Math.max(0, Number(b.riderBaseEarningPerDelivery))
        : (cur.riderBaseEarningPerDelivery ?? 30),
      riderPerKmRate: b.riderPerKmRate !== undefined
        ? Math.max(0, Number(b.riderPerKmRate))
        : (cur.riderPerKmRate ?? 5),
      riderBaseDistanceKm: b.riderBaseDistanceKm !== undefined
        ? Math.max(0, Number(b.riderBaseDistanceKm))
        : (cur.riderBaseDistanceKm ?? 3),
      riderIncentivePercent: b.riderIncentivePercent !== undefined
        ? clamp(b.riderIncentivePercent, 0, 100)
        : (cur.riderIncentivePercent ?? 5),
    };

    await settings.save();
    res.status(200).json({ success: true, message: 'Payout settings updated', payoutConfig: settings.payoutConfig });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};
