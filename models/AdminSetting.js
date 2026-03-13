const mongoose = require('mongoose');

const AdminSettingSchema = new mongoose.Schema(
  {
    // ─── App Branding ──────────────────────────────────────────────────────────
    appName: { type: String, trim: true, default: 'Food Delivery' },
    logoUrl: { type: String, trim: true, default: '' },
    contactEmail: { type: String, trim: true, default: '' },
    contactPhone: { type: String, trim: true, default: '' },
    termsUrl: { type: String, trim: true, default: '' },
    privacyUrl: { type: String, trim: true, default: '' },

    // ─── GST Settings ─────────────────────────────────────────────────────────
    // Default GST slab applied to a product if the restaurant doesn't pick one.
    // Must be one of the valid Indian GST slabs: 0, 5, 12, 18.
    defaultGstPercent: {
      type: Number,
      enum: [0, 5, 12, 18],
      default: 5,
    },

    // GST charged on the platform fee (service tax — standard 18% in India)
    platformFeeGstPercent: { type: Number, default: 18, min: 0, max: 28 },

    // GST charged on the delivery fee (standard 18% in India)
    deliveryChargeGstPercent: { type: Number, default: 18, min: 0, max: 28 },

    // GST charged on admin commission billed to the restaurant (18% in India)
    adminCommissionGstPercent: { type: Number, default: 18, min: 0, max: 28 },

    // ─── Platform Pricing ─────────────────────────────────────────────────────
    // Platform fee charged to customer on every order (flat ₹ amount)
    platformFee: { type: Number, default: 9, min: 0 },

    // Small cart surcharge: if itemTotal < smallCartThreshold, add smallCartFee
    smallCartThreshold: { type: Number, default: 0, min: 0 }, // 0 = disabled
    smallCartFee: { type: Number, default: 0, min: 0 },

    // ─── Delivery Charge Slabs (₹ per km) ────────────────────────────────────
    deliverySlabs: {
      baseDeliveryFee: { type: Number, default: 0, min: 0 }, // flat base charge per order
      firstSlabMaxKm: { type: Number, default: 5 }, //  0 – 5 km
      firstSlabRatePerKm: { type: Number, default: 3 },
      secondSlabMaxKm: { type: Number, default: 10 }, //  5 – 10 km
      secondSlabRatePerKm: { type: Number, default: 4 },
      thirdSlabRatePerKm: { type: Number, default: 6 }, // >10 km
    },

    // ─── Payout / Commission Settings ─────────────────────────────────────────
    payoutConfig: {
      // Admin commission charged on restaurant earnings (% of order total)
      defaultRestaurantCommissionPercent: { type: Number, default: 10, min: 0, max: 100 },

      // Rider base earning per delivery (₹). Restaurants may add tip on top.
      riderBaseEarningPerDelivery: { type: Number, default: 30, min: 0 },

      // Rider earning per km beyond base distance (₹/km)
      riderPerKmRate: { type: Number, default: 5, min: 0 },

      // Base distance included in rider earnings (km)
      riderBaseDistanceKm: { type: Number, default: 3, min: 0 },

      // Rider incentive: % of item subtotal (before GST/fees) given to rider per order
      riderIncentivePercent: { type: Number, default: 5, min: 0, max: 100 },
    },

  },
  { timestamps: true }
);

module.exports = mongoose.model('AdminSetting', AdminSettingSchema);
