'use strict';

/**
 * settlementValidator.js
 *
 * Validates that an order's stored earnings fields are internally consistent
 * after settlement has been processed. Intended for use in reconciliation
 * scripts and audit tooling — NOT called in the hot payment path.
 *
 * Formula reference (canonical):
 *   restaurantNet    = itemTotal − adminCommission − gstOnFood − adminCommissionGst
 *   riderEarning     = deliveryCharge + platformFee + incentive
 */

const Order = require('../models/Order');
const Restaurant = require('../models/Restaurant');

const TOLERANCE = 0.02; // ±₹0.02 rounding tolerance

/**
 * Returns true if |a - b| <= TOLERANCE.
 */
function nearlyEqual(a, b) {
  return Math.abs(a - b) <= TOLERANCE;
}

/**
 * Validates the settlement figures stored on a single order.
 *
 * @param {string|mongoose.Types.ObjectId} orderId
 * @returns {Promise<{
 *   valid: boolean,
 *   orderId: string,
 *   issues: string[],
 *   snapshot: object
 * }>}
 */
async function validateSettlement(orderId) {
  const issues = [];

  const order = await Order.findById(orderId)
    .populate('restaurant', 'adminCommission')
    .lean();

  if (!order) {
    return { valid: false, orderId: String(orderId), issues: ['Order not found'], snapshot: {} };
  }

  const pb = order.paymentBreakdown || {};

  // ── Source values ──────────────────────────────────────────────────────────
  const itemTotal = Number(pb.itemTotal || order.itemTotal || 0);
  const gstOnFood = Number(pb.gstOnFood || 0);
  const adminCommission = Number(order.adminCommission || 0);
  const adminCommissionGst = Number(pb.adminCommissionGst || 0);

  const deliveryCharge = Number(order.riderEarnings?.deliveryCharge || 0);
  const platformFee = Number(order.riderEarnings?.platformFee || 0);
  const riderIncentive = Number(order.riderEarnings?.incentive || 0);
  const riderTip = Number((order.riderEarnings?.tip ?? order.tip) || 0);

  // ── Expected values ────────────────────────────────────────────────────────
  const expectedRestaurantNet = Math.max(0, Math.round((itemTotal - adminCommission - adminCommissionGst) * 100) / 100);
  const expectedRiderEarning = Math.max(0, Math.round((deliveryCharge + platformFee + riderIncentive + riderTip) * 100) / 100);

  // ── Stored values ──────────────────────────────────────────────────────────
  const storedRestaurantNet = Number(order.restaurantEarning || 0);
  const storedAdminCommission = Number(order.adminCommission || 0);
  const storedRiderBaseEarning = Number(order.riderEarnings?.totalRiderEarning || 0);

  // ── Checks ─────────────────────────────────────────────────────────────────

  // 1. Restaurant net
  if (!nearlyEqual(storedRestaurantNet, expectedRestaurantNet)) {
    issues.push(
      `restaurantNet mismatch: stored=${storedRestaurantNet.toFixed(2)}, expected=${expectedRestaurantNet.toFixed(2)} ` +
      `(itemTotal=${itemTotal}, adminCommission=${adminCommission}, gstOnFood=${gstOnFood}, adminCommissionGst=${adminCommissionGst})`
    );
  }

  // 2. Rider earning
  if (!nearlyEqual(storedRiderBaseEarning, expectedRiderEarning)) {
    issues.push(
      `riderEarning (base) mismatch: stored=${storedRiderBaseEarning.toFixed(2)}, ` +
      `expected=${expectedRiderEarning.toFixed(2)} ` +
      `(deliveryCharge=${deliveryCharge}, platformFee=${platformFee}, incentive=${riderIncentive}, tip=${riderTip})`
    );
  }

  // 3. Consistency: paymentBreakdown.restaurantNet must match order.restaurantEarning
  const pbRestaurantNet = Number(order.paymentBreakdown?.restaurantNet ?? storedRestaurantNet);
  if (!nearlyEqual(pbRestaurantNet, storedRestaurantNet)) {
    issues.push(
      `paymentBreakdown.restaurantNet mismatch: pb=${pbRestaurantNet.toFixed(2)}, order=${storedRestaurantNet.toFixed(2)}`
    );
  }

  // 4. Item-level aggregation should match order.restaurantEarning
  const itemRestaurantSum = Array.isArray(order.items)
    ? Math.round(order.items.reduce((sum, item) => sum + (Number(item.restaurantEarningAmount || 0)), 0) * 100) / 100
    : 0;
  if (itemRestaurantSum > 0 && !nearlyEqual(itemRestaurantSum, storedRestaurantNet)) {
    issues.push(`item restaurant earning sum mismatch: items=${itemRestaurantSum.toFixed(2)}, order=${storedRestaurantNet.toFixed(2)}`);
  }

  const snapshot = {
    itemTotal,
    gstOnFood,
    adminCommission,
    adminCommissionGst,
    expectedRestaurantNet,
    deliveryCharge,
    platformFee,
    riderIncentive,
    expectedRiderEarning,
    storedRestaurantNet,
    storedAdminCommission,
    storedRiderBaseEarning,
  };

  return {
    valid: issues.length === 0,
    orderId: String(orderId),
    issues,
    snapshot,
  };
}

/**
 * Validates a batch of orders and returns a summary.
 *
 * @param {string[]|mongoose.Types.ObjectId[]} orderIds
 * @returns {Promise<{ passed: number, failed: number, results: object[] }>}
 */
async function validateSettlementBatch(orderIds) {
  const results = await Promise.all(orderIds.map(validateSettlement));
  const failed = results.filter((r) => !r.valid);
  const passed = results.length - failed.length;
  return { passed, failed: failed.length, results };
}

module.exports = { validateSettlement, validateSettlementBatch };
