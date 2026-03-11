/**
 * RiderBill
 * ---------
 * Per-order earnings record for the rider.
 *
 * Earnings formula:
 *   riderTotalEarning = deliveryCharge + platformFeeCredit + incentive + tip
 *
 * Generated once per order by billingService.generateBills() on delivery.
 */
const mongoose = require('mongoose');

const riderBillSchema = new mongoose.Schema(
  {
    order:      { type: mongoose.Schema.Types.ObjectId, ref: 'Order',      required: true, unique: true },
    rider:      { type: mongoose.Schema.Types.ObjectId, ref: 'Rider',      required: true, index: true },
    restaurant: { type: mongoose.Schema.Types.ObjectId, ref: 'Restaurant', required: true },
    customer:   { type: mongoose.Schema.Types.ObjectId, ref: 'User',       required: true },

    // ── Earnings components ───────────────────────────────────────────────────
    deliveryCharge:   { type: Number, default: 0 }, // Base delivery fee allocated to rider
    platformFeeCredit:{ type: Number, default: 0 }, // Any share of platform fee passed to rider (may be 0)
    incentive:        { type: Number, default: 0 }, // Performance bonus (% of item subtotal)
    incentivePercent: { type: Number, default: 0 }, // Incentive % used (snapshot for audit)
    tip:              { type: Number, default: 0 }, // Customer tip

    riderTotalEarning: { type: Number, default: 0 }, // deliveryCharge + platformFeeCredit + incentive + tip

    // ── COD details ───────────────────────────────────────────────────────────
    paymentMethod: { type: String, enum: ['wallet', 'online', 'cod'] },
    cashCollected: { type: Number, default: 0 }, // COD cash collected from customer

    generatedAt: { type: Date, default: Date.now },
  },
  { timestamps: true },
);

riderBillSchema.index({ rider: 1, createdAt: -1 });

module.exports = mongoose.model('RiderBill', riderBillSchema);
