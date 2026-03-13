/**
 * billingService.js
 * -----------------
 * Generates CustomerBill, RestaurantBill, and RiderBill for a delivered order.
 *
 * Rules:
 *  - Called by paymentService after a successful settlement transaction.
 *  - Fully idempotent: if CustomerBill already exists for the order, returns early.
 *  - CGST = SGST = total GST / 2  (intrastate Indian GST)
 *  - GST rates for platform fee, delivery, and commission come from AdminSetting.
 */

'use strict';

const mongoose    = require('mongoose');
const Order       = require('../models/Order');
const AdminSetting = require('../models/AdminSetting');
const CustomerBill = require('../models/CustomerBill');
const RestaurantBill = require('../models/RestaurantBill');
const RiderBill   = require('../models/RiderBill');

// ─── Helpers ──────────────────────────────────────────────────────────────────

const r2 = (n) => {
  const numeric = Number(n);
  if (!Number.isFinite(numeric)) return 0;
  return Number(numeric.toFixed(5));
};

/**
 * Build a GST breakdown object.
 * @param {number} base      Amount on which GST is applied
 * @param {number} percent   GST rate (e.g. 18)
 */
function makeGstBlock(base, percent) {
  const total = r2(base * (percent / 100));
  const half  = r2(total / 2);
  return {
    percent,
    base:  r2(base),
    total,
    cgst: half,
    sgst: half,
  };
}

/** Load admin settings once and cache within a single call to generateBills. */
async function loadGstRates() {
  const s = await AdminSetting.findOne().lean();
  return {
    platformFeeGstPercent:      s?.platformFeeGstPercent      ?? 18,
    deliveryChargeGstPercent:   s?.deliveryChargeGstPercent   ?? 18,
    adminCommissionGstPercent:  s?.adminCommissionGstPercent  ?? 18,
  };
}

// ─── Main export ──────────────────────────────────────────────────────────────

/**
 * generateBills
 * Generates (or skips if already generated) CustomerBill, RestaurantBill, RiderBill.
 *
 * @param {string|mongoose.Types.ObjectId} orderId
 * @returns {object}  { alreadyGenerated, customerBill, restaurantBill, riderBill }
 */
async function generateBills(orderId) {
  // ── 1. Idempotency guard ───────────────────────────────────────────────────
  const existing = await CustomerBill.findOne({ order: orderId }).select('_id').lean();
  if (existing) {
    return { alreadyGenerated: true };
  }

  // ── 2. Load the full order ─────────────────────────────────────────────────
  const order = await Order.findById(orderId).lean();
  if (!order) throw new Error(`billingService: Order ${orderId} not found`);

  const gstRates = await loadGstRates();

  const pb = order.paymentBreakdown || {};

  // Raw amounts from order (set at order-creation time by priceCalculator)
  const itemsTotal         = r2(pb.itemTotal           ?? order.itemTotal     ?? 0);
  const restaurantDiscount = r2(pb.restaurantDiscount  ?? 0);
  const platformDiscount   = r2(pb.foodierDiscount     ?? order.discount      ?? 0);
  const discountTotal      = r2(restaurantDiscount + platformDiscount);
  const rawGstOnFood       = r2(pb.gstOnFood           ?? 0);
  const packagingCharge    = r2(pb.packagingCharge      ?? order.packaging    ?? 0);
  const rawPackagingGst    = r2(pb.packagingGST         ?? 0);
  const platformFee        = r2(pb.taxablePlatformAmount ?? order.platformFee ?? 0);
  const deliveryCharge     = r2(order.deliveryFee       ?? 0);
  const tip                = r2(order.tip               ?? 0);

  // Settled commission / earnings (written by paymentService after delivery)
  const adminCommissionAmount  = r2(order.adminCommission   ?? 0);
  const adminCommissionPercent = (() => {
    if (Number.isFinite(Number(order.adminCommission)) && itemsTotal > 0) {
      // Back-calculate or use the stored item-level first commission percent
      const sumItemPercent = Array.isArray(order.items)
        ? order.items.reduce((s, i) => s + (Number(i.commissionPercent) || 0), 0)
        : 0;
      return r2(sumItemPercent / Math.max(order.items?.length || 1, 1));
    }
    return 0;
  })();
  const restaurantNetEarning   = r2(order.restaurantEarning ?? pb.restaurantNet ?? 0);
  const riderDeliveryCharge    = r2(order.riderEarnings?.deliveryCharge ?? 0);
  const riderPlatformFeeCredit = r2(order.riderEarnings?.platformFee ?? 0);
  const riderIncentive         = r2(order.riderEarnings?.incentive ?? 0);
  const riderIncentivePct      = r2(order.riderEarnings?.incentivePercentAtCompletion ?? 0);
  const riderTotalEarning      = r2(order.riderEarnings?.totalRiderEarning ?? 0);

  // ── 3. Compute GST breakdowns ──────────────────────────────────────────────

  // Food GST: use stored value and split CGST/SGST
  const gstOnFood = {
    percent: rawGstOnFood > 0 && itemsTotal > 0
      ? r2((rawGstOnFood / itemsTotal) * 100)
      : 0,
    base:  r2(itemsTotal - restaurantDiscount),
    total: rawGstOnFood,
    cgst:  r2(rawGstOnFood / 2),
    sgst:  r2(rawGstOnFood / 2),
  };

  // Packaging GST
  const gstOnPackaging = {
    percent: rawPackagingGst > 0 && packagingCharge > 0
      ? r2((rawPackagingGst / packagingCharge) * 100)
      : 0,
    base:  packagingCharge,
    total: rawPackagingGst,
    cgst:  r2(rawPackagingGst / 2),
    sgst:  r2(rawPackagingGst / 2),
  };

  // Platform fee GST (18% by default, admin-configurable)
  const gstOnPlatform = {
    percent: r2(pb.gstPercentOnPlatform ?? gstRates.platformFeeGstPercent),
    base: r2(pb.taxablePlatformAmount ?? platformFee),
    total: r2(pb.gstOnPlatform ?? 0),
    cgst: r2(pb.cgstPlatform ?? ((pb.gstOnPlatform || 0) / 2)),
    sgst: r2(pb.sgstPlatform ?? ((pb.gstOnPlatform || 0) / 2)),
  };

  // Delivery charge GST (18% by default, admin-configurable)
  const gstOnDelivery = {
    percent: r2(pb.deliveryChargeGstPercent ?? gstRates.deliveryChargeGstPercent),
    base: r2(deliveryCharge),
    total: r2(pb.deliveryGst ?? (deliveryCharge * ((pb.deliveryChargeGstPercent ?? gstRates.deliveryChargeGstPercent) / 100))),
    cgst: r2(pb.cgstDelivery ?? ((pb.deliveryGst ?? (deliveryCharge * ((pb.deliveryChargeGstPercent ?? gstRates.deliveryChargeGstPercent) / 100))) / 2)),
    sgst: r2(pb.sgstDelivery ?? ((pb.deliveryGst ?? (deliveryCharge * ((pb.deliveryChargeGstPercent ?? gstRates.deliveryChargeGstPercent) / 100))) / 2)),
  };

  // Admin commission GST (18%, the platform charges this to the restaurant)
  const gstOnAdminCommission = makeGstBlock(adminCommissionAmount, gstRates.adminCommissionGstPercent);

  // Total GST for customer bill
  const totalGstAmount = r2(
    gstOnFood.total +
    gstOnPackaging.total +
    gstOnPlatform.total +
    gstOnDelivery.total,
  );
  const totalGst = {
    cgst:  r2(totalGstAmount / 2),
    sgst:  r2(totalGstAmount / 2),
    total: totalGstAmount,
  };

  const finalPayableAmount = r2(order.totalAmount ?? 0);

  // ── 4. Create bills ────────────────────────────────────────────────────────
  const billPromises = [];

  // CustomerBill
  billPromises.push(
    CustomerBill.create({
      order:              order._id,
      customer:           order.customer,
      restaurant:         order.restaurant,
      itemsTotal,
      restaurantDiscount,
      platformDiscount,
      discountTotal,
      gstOnFood,
      packagingCharge,
      gstOnPackaging,
      platformFee,
      gstOnPlatform,
      deliveryCharge,
      gstOnDelivery,
      tip,
      totalGst,
      finalPayableAmount,
      paymentMethod: order.paymentMethod,
      paymentStatus: order.paymentStatus,
      couponCode:    order.couponCode || null,
      generatedAt:   new Date(),
    }),
  );

  // RestaurantBill
  billPromises.push(
    RestaurantBill.create({
      order:                  order._id,
      restaurant:             order.restaurant,
      customer:               order.customer,
      itemsTotal,
      gstOnFood,
      restaurantDiscount,
      packagingCharge,
      gstOnPackaging,
      adminCommissionPercent,
      adminCommissionAmount,
      gstOnAdminCommission,
      restaurantNetEarning,
      generatedAt: new Date(),
    }),
  );

  // RiderBill — only if a rider is assigned
  if (order.rider) {
    billPromises.push(
      RiderBill.create({
        order:              order._id,
        rider:              order.rider,
        restaurant:         order.restaurant,
        customer:           order.customer,
        deliveryCharge:     Math.max(0, riderDeliveryCharge),
        platformFeeCredit:  Math.max(0, riderPlatformFeeCredit),
        incentive:          riderIncentive,
        incentivePercent:   riderIncentivePct,
        tip,
        riderTotalEarning:  r2(riderTotalEarning),
        paymentMethod:      order.paymentMethod,
        generatedAt:        new Date(),
      }),
    );
  }

  const [customerBill, restaurantBill, riderBill] = await Promise.all(billPromises);

  return {
    alreadyGenerated: false,
    customerBill,
    restaurantBill,
    riderBill: riderBill || null,
  };
}

module.exports = { generateBills };
