/**
 * RestaurantBill
 * --------------
 * Per-order earnings breakdown for the restaurant.
 * Shows what the restaurant is owed after the platform deducts its commission.
 *
 * Earnings formula:
 *   restaurantGross = (discountedFoodBase + packagingCharge)
 *   restaurantNetEarning = restaurantGross
 *                          - adminCommissionAmount
 *                          - gstOnAdminCommission.total
 *
 * Generated once per order by billingService.generateBills() on delivery.
 */
const mongoose = require('mongoose');

const gstBreakdownSchema = {
  percent: { type: Number, default: 0 },
  base:    { type: Number, default: 0 },
  total:   { type: Number, default: 0 },
  cgst:    { type: Number, default: 0 },
  sgst:    { type: Number, default: 0 },
};

const restaurantBillSchema = new mongoose.Schema(
  {
    order:      { type: mongoose.Schema.Types.ObjectId, ref: 'Order',      required: true, unique: true },
    restaurant: { type: mongoose.Schema.Types.ObjectId, ref: 'Restaurant', required: true, index: true },
    customer:   { type: mongoose.Schema.Types.ObjectId, ref: 'User',       required: true },

    // ── Food ─────────────────────────────────────────────────────────────────
    itemsTotal:         { type: Number, default: 0 }, // Food total before restaurant discount (pre-GST)
    gstOnFood:          { type: gstBreakdownSchema, default: () => ({}) }, // GST collected on food (passed through)
    restaurantDiscount: { type: Number, default: 0 }, // Discount borne by restaurant (if any)

    // ── Packaging ─────────────────────────────────────────────────────────────
    packagingCharge: { type: Number, default: 0 },
    gstOnPackaging:  { type: gstBreakdownSchema, default: () => ({}) },

    // ── Admin commission ──────────────────────────────────────────────────────
    adminCommissionPercent: { type: Number, default: 0 },
    adminCommissionAmount:  { type: Number, default: 0 },
    // Platform charges GST on its commission (input tax credit for restaurant)
    gstOnAdminCommission:   { type: gstBreakdownSchema, default: () => ({}) },

    // ── Net ───────────────────────────────────────────────────────────────────
    restaurantNetEarning: { type: Number, default: 0 }, // (discounted food + packaging) - commission - commission GST

    generatedAt: { type: Date, default: Date.now },
  },
  { timestamps: true },
);

restaurantBillSchema.index({ restaurant: 1, createdAt: -1 });

module.exports = mongoose.model('RestaurantBill', restaurantBillSchema);
