'use strict';

const { logger } = require('../utils/logger');

const r2 = (n) => Math.round((Number(n) || 0) * 100) / 100;
const nearlyEqual = (a, b, tol = 0.02) => Math.abs(r2(a) - r2(b)) <= tol;

function validateOrderFinancialIntegrity(orderLike) {
  const order = orderLike || {};
  const pb = order.paymentBreakdown || {};
  const issues = [];

  // 1) GST split integrity at item level
  if (Array.isArray(order.items)) {
    for (const item of order.items) {
      const itemGstAmount = Number(item?.itemGstAmount || 0);
      const cgst = Number(item?.cgst || 0);
      const sgst = Number(item?.sgst || 0);
      if (!nearlyEqual(cgst + sgst, itemGstAmount)) {
        issues.push('item GST split mismatch: cgst + sgst != itemGstAmount');
        break;
      }
    }
  }

  // 2) Platform bill integrity
  const platformBillExpected = r2((pb.taxablePlatformAmount || 0) + (pb.gstOnPlatform || 0));
  if (!nearlyEqual(pb.platformBillTotal || 0, platformBillExpected)) {
    issues.push('platformBillTotal mismatch: taxablePlatformAmount + gstOnPlatform');
  }

  // 3) Rider earnings integrity (canonical fields only)
  const re = order.riderEarnings || {};
  const riderExpected = r2((re.deliveryCharge || 0) + (re.platformFee || 0) + (re.incentive || 0));
  if (!nearlyEqual(re.totalRiderEarning || 0, riderExpected)) {
    issues.push('rider earnings mismatch: deliveryCharge + platformFee + incentive != totalRiderEarning');
  }

  // 4) Item-level restaurant earning aggregation
  if (Array.isArray(order.items) && order.items.length > 0) {
    const itemRestaurantSum = r2(order.items.reduce((sum, item) => sum + (Number(item?.restaurantEarningAmount || 0)), 0));
    if (!nearlyEqual(order.restaurantEarning || 0, itemRestaurantSum)) {
      issues.push('restaurant earning mismatch: sum(items.restaurantEarningAmount) != order.restaurantEarning');
    }
  }

  // 5) Canonical payment breakdown consistency
  if (pb.restaurantNet !== undefined && !nearlyEqual(pb.restaurantNet || 0, order.restaurantEarning || 0)) {
    issues.push('paymentBreakdown.restaurantNet mismatch with order.restaurantEarning');
  }

  if (issues.length > 0) {
    logger.error('Financial integrity error', {
      event: 'FINANCIAL_INTEGRITY_ERROR',
      orderId: String(order._id || order.id || 'unknown'),
      issues,
      snapshot: {
        restaurantEarning: Number(order.restaurantEarning || 0),
        adminCommission: Number(order.adminCommission || 0),
        adminCommissionGst: Number(pb.adminCommissionGst || 0),
        platformBillTotal: Number(pb.platformBillTotal || 0),
        riderEarnings: {
          deliveryCharge: Number(re.deliveryCharge || 0),
          platformFee: Number(re.platformFee || 0),
          incentive: Number(re.incentive || 0),
          totalRiderEarning: Number(re.totalRiderEarning || 0),
        },
      },
    });
  }

  return {
    valid: issues.length === 0,
    issues,
  };
}

module.exports = {
  validateOrderFinancialIntegrity,
};
