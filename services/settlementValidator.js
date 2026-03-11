'use strict';

/**
 * settlementValidator.js
 *
 * Validates that an order's stored earnings fields are internally consistent
 * after settlement has been processed. Intended for use in reconciliation
 * scripts and audit tooling — NOT called in the hot payment path.
 *
 * Formula reference (settlement-v2):
 *   restaurantGross  = itemTotal + packagingCharge
 *   adminCommission  = restaurantGross × commissionPercent / 100
 *   restaurantNet    = restaurantGross − adminCommission
 *   riderEarning     = deliveryFee + riderPlatformFeeShare + riderIncentive
 *   riderTotalCredit = riderEarning + tip
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
  const packagingCharge = Number(pb.packagingCharge || order.packaging || 0);
  const commissionPercent = Number(order.restaurant?.adminCommission || 10);
  const deliveryFee = Number(order.deliveryFee || 0);
  const tipAmount = Number(order.tip || 0);
  const platformFee = Number(order.platformFee || 0);

  // ── Expected values ────────────────────────────────────────────────────────
  const expectedRestaurantGross = Math.round((itemTotal + packagingCharge) * 100) / 100;
  const expectedAdminCommission = Math.round((expectedRestaurantGross * commissionPercent / 100) * 100) / 100;
  const expectedRestaurantNet = Math.max(0, Math.round((expectedRestaurantGross - expectedAdminCommission) * 100) / 100);

  // riderIncentive — prefer structured object, fallback to legacy field
  const storedRiderIncentive = Number(
    order.riderEarnings?.incentive ??
    order.riderIncentive ??
    0
  );

  const expectedRiderEarning = Math.max(0, Math.round((deliveryFee + platformFee + storedRiderIncentive) * 100) / 100);
  const expectedRiderTotalCredit = Math.round((expectedRiderEarning + tipAmount) * 100) / 100;

  // ── Stored values ──────────────────────────────────────────────────────────
  const storedRestaurantNet = Number(order.restaurantEarning ?? order.restaurantCommission ?? 0);
  const storedAdminCommission = Number(order.adminCommissionAtOrder ?? order.adminCommission ?? 0);
  const storedRiderTotalCredit = Number(order.riderEarnings?.totalRiderEarning ?? order.riderEarning ?? 0);

  // ── Checks ─────────────────────────────────────────────────────────────────

  // 1. Restaurant net
  if (!nearlyEqual(storedRestaurantNet, expectedRestaurantNet)) {
    issues.push(
      `restaurantNet mismatch: stored=${storedRestaurantNet.toFixed(2)}, expected=${expectedRestaurantNet.toFixed(2)} ` +
      `(itemTotal=${itemTotal}, packaging=${packagingCharge}, commission%=${commissionPercent})`
    );
  }

  // 2. Admin commission
  if (!nearlyEqual(storedAdminCommission, expectedAdminCommission)) {
    issues.push(
      `adminCommission mismatch: stored=${storedAdminCommission.toFixed(2)}, expected=${expectedAdminCommission.toFixed(2)}`
    );
  }

  // 3. Rider earning (excluding tip)
  const storedRiderBaseEarning = Number(order.riderEarnings?.totalRiderEarning ?? order.riderEarning ?? 0);
  if (!nearlyEqual(storedRiderBaseEarning, expectedRiderEarning)) {
    issues.push(
      `riderEarning (base) mismatch: stored=${storedRiderBaseEarning.toFixed(2)}, ` +
      `expected=${expectedRiderEarning.toFixed(2)} ` +
      `(deliveryFee=${deliveryFee}, platformFee=${platformFee}, incentive=${storedRiderIncentive})`
    );
  }

  // 4. Consistency: restaurantNet + adminCommission should equal restaurantGross
  const netPlusCommission = Math.round((storedRestaurantNet + storedAdminCommission) * 100) / 100;
  if (!nearlyEqual(netPlusCommission, expectedRestaurantGross)) {
    issues.push(
      `restaurantGross split inconsistency: restaurantNet(${storedRestaurantNet}) + adminCommission(${storedAdminCommission}) ` +
      `= ${netPlusCommission.toFixed(2)}, expected gross=${expectedRestaurantGross.toFixed(2)}`
    );
  }

  // 5. Item-level commission aggregation (if items have itemCommissionRate)
  if (Array.isArray(order.items) && order.items.length > 0) {
    let itemLevelTotal = 0;
    for (const item of order.items) {
      if (item.itemCommissionRate != null) {
        const itemSubtotal = Number(item.price || 0) * Number(item.quantity || 1);
        itemLevelTotal += Math.round((itemSubtotal * Number(item.itemCommissionRate) / 100) * 100) / 100;
      }
    }
    if (itemLevelTotal > 0 && !nearlyEqual(itemLevelTotal, storedAdminCommission)) {
      issues.push(
        `item-level commission sum (${itemLevelTotal.toFixed(2)}) does not match ` +
        `stored adminCommission (${storedAdminCommission.toFixed(2)}). ` +
        `Consider using order-level commissionPercent (${commissionPercent}%) instead.`
      );
    }
  }

  const snapshot = {
    itemTotal,
    packagingCharge,
    restaurantGross: expectedRestaurantGross,
    commissionPercent,
    expectedAdminCommission,
    expectedRestaurantNet,
    deliveryFee,
    platformFee,
    storedRiderIncentive,
    tipAmount,
    expectedRiderEarning,
    expectedRiderTotalCredit,
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
