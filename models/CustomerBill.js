/**
 * CustomerBill
 * -----------
 * A permanent receipt for every delivered (or paid wallet/online) order.
 * Stores what the customer was charged, split into line items and GST components.
 * Generated once per order by billingService.generateBills(); cannot be re-created.
 *
 * CGST = SGST = total GST / 2  (standard intrastate Indian GST)
 */
const mongoose = require('mongoose');

const gstBreakdownSchema = {
  percent: { type: Number, default: 0 }, // GST rate applied
  base:    { type: Number, default: 0 }, // Amount on which GST is calculated
  total:   { type: Number, default: 0 }, // = base × percent / 100
  cgst:    { type: Number, default: 0 }, // = total / 2
  sgst:    { type: Number, default: 0 }, // = total / 2
};

const customerBillSchema = new mongoose.Schema(
  {
    order:      { type: mongoose.Schema.Types.ObjectId, ref: 'Order',      required: true, unique: true },
    customer:   { type: mongoose.Schema.Types.ObjectId, ref: 'User',       required: true, index: true },
    restaurant: { type: mongoose.Schema.Types.ObjectId, ref: 'Restaurant', required: true, index: true },

    // ── Food ─────────────────────────────────────────────────────────────────
    itemsTotal:         { type: Number, default: 0 }, // Sum of (price × qty) across all items (pre-GST)
    restaurantDiscount: { type: Number, default: 0 }, // Discount offered by the restaurant
    platformDiscount:   { type: Number, default: 0 }, // Coupon / Foodier discount
    discountTotal:      { type: Number, default: 0 }, // restaurantDiscount + platformDiscount

    gstOnFood: { type: gstBreakdownSchema, default: () => ({}) }, // GST on (itemsTotal - discount)

    // ── Packaging ─────────────────────────────────────────────────────────────
    packagingCharge: { type: Number, default: 0 },
    gstOnPackaging:  { type: gstBreakdownSchema, default: () => ({}) },

    // ── Platform fee ──────────────────────────────────────────────────────────
    platformFee:    { type: Number, default: 0 },
    gstOnPlatform:  { type: gstBreakdownSchema, default: () => ({}) },

    // ── Delivery ──────────────────────────────────────────────────────────────
    deliveryCharge:    { type: Number, default: 0 },
    gstOnDelivery:     { type: gstBreakdownSchema, default: () => ({}) },

    // ── Tip ───────────────────────────────────────────────────────────────────
    tip: { type: Number, default: 0 }, // No GST on tips

    // ── Totals ────────────────────────────────────────────────────────────────
    totalGst: {
      cgst:  { type: Number, default: 0 },
      sgst:  { type: Number, default: 0 },
      total: { type: Number, default: 0 },
    },
    finalPayableAmount: { type: Number, default: 0 }, // = what customer paid

    // ── Payment meta ──────────────────────────────────────────────────────────
    paymentMethod: { type: String, enum: ['wallet', 'online', 'cod'] },
    paymentStatus: { type: String },
    couponCode:    { type: String },
    generatedAt:   { type: Date, default: Date.now },
  },
  { timestamps: true },
);

customerBillSchema.index({ customer: 1, createdAt: -1 });
customerBillSchema.index({ restaurant: 1, createdAt: -1 });

module.exports = mongoose.model('CustomerBill', customerBillSchema);
