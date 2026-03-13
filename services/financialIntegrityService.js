'use strict';

const { logger } = require('../utils/logger');

const r2 = (n) => Math.round((Number(n) || 0) * 100) / 100;
const nearlyEqual = (a, b, tol = 0.02) => Math.abs(r2(a) - r2(b)) <= tol;

function validateOrderFinancialIntegrity(orderLike) {
  const order = orderLike || {};
  const pb = order.paymentBreakdown || {};
  const items = Array.isArray(order.items) ? order.items : [];
  const issues = [];

  // 1) itemTotal must equal sum(items.lineTotal)
  if (items.length > 0) {
    const summedItemTotal = r2(items.reduce((sum, item) => sum + Number(item?.lineTotal || 0), 0));
    const orderItemTotal = r2(pb.itemTotal ?? order.itemTotal ?? 0);
    if (!nearlyEqual(orderItemTotal, summedItemTotal)) {
      issues.push('item total mismatch: sum(items.lineTotal) != order itemTotal');
    }
  }

  // 2) GST split integrity at item level
  if (items.length > 0) {
    for (const item of items) {
      const itemGstAmount = Number(item?.itemGstAmount || 0);
      const cgst = Number(item?.cgst || 0);
      const sgst = Number(item?.sgst || 0);
      if (!nearlyEqual(cgst + sgst, itemGstAmount)) {
        issues.push('item GST split mismatch: cgst + sgst != itemGstAmount');
        break;
      }
    }
  }

  // 3) gstOnFood must equal sum(items.itemGstAmount)
  if (items.length > 0) {
    const summedFoodGst = r2(items.reduce((sum, item) => sum + Number(item?.itemGstAmount || 0), 0));
    if (!nearlyEqual(pb.gstOnFood || 0, summedFoodGst)) {
      issues.push('gstOnFood mismatch: sum(items.itemGstAmount) != paymentBreakdown.gstOnFood');
    }
  }

  // 4) Platform bill integrity
  const platformBillExpected = r2((pb.taxablePlatformAmount || 0) + (pb.gstOnPlatform || 0));
  if (!nearlyEqual(pb.platformBillTotal || 0, platformBillExpected)) {
    issues.push('platformBillTotal mismatch: taxablePlatformAmount + gstOnPlatform');
  }

  // 5) Discount distribution integrity
  if (!nearlyEqual(
    (pb.platformDiscountUsed || 0) + (pb.restaurantDiscountUsed || 0),
    pb.foodierDiscount || 0,
  )) {
    issues.push('discount distribution mismatch: platformDiscountUsed + restaurantDiscountUsed != foodierDiscount');
  }

  // 6) Rider earnings integrity (canonical fields only)
  const re = order.riderEarnings || {};
  const riderExpected = r2((re.deliveryCharge || 0) + (re.platformFee || 0) + (re.incentive || 0) + ((re.tip ?? order.tip) || 0));
  if (!nearlyEqual(re.totalRiderEarning || 0, riderExpected)) {
    issues.push('rider earnings mismatch: deliveryCharge + platformFee + incentive + tip != totalRiderEarning');
  }

  // 7) Item-level restaurant earning aggregation
  if (items.length > 0) {
    const itemRestaurantSum = r2(items.reduce((sum, item) => sum + Number(item?.restaurantEarningAmount || 0), 0));
    if (!nearlyEqual(order.restaurantEarning || 0, itemRestaurantSum)) {
      issues.push('restaurant earning mismatch: sum(items.restaurantEarningAmount) != order.restaurantEarning');
    }
  }

  // 8) Canonical payment breakdown consistency
  if (pb.restaurantNet !== undefined && !nearlyEqual(pb.restaurantNet || 0, order.restaurantEarning || 0)) {
    issues.push('paymentBreakdown.restaurantNet mismatch with order.restaurantEarning');
  }

  // 9) Restaurant net formula integrity
  const expectedRestaurantNet = r2(
    (pb.restaurantGross ?? order.itemTotal ?? 0)
    - (order.adminCommission || 0)
    - (pb.adminCommissionGst || 0),
  );
  if (!nearlyEqual(order.restaurantEarning || 0, expectedRestaurantNet)) {
    issues.push('restaurant net mismatch: restaurantGross - adminCommission - adminCommissionGst');
  }

  if (issues.length > 0) {
    logger.error('Financial integrity error', {
      event: 'FINANCIAL_INTEGRITY_ERROR',
      orderId: String(order._id || order.id || 'unknown'),
      issues,
      snapshot: {
        itemTotal: Number(pb.itemTotal ?? order.itemTotal ?? 0),
        gstOnFood: Number(pb.gstOnFood || 0),
        packagingCharge: Number(pb.packagingCharge ?? order.packaging ?? 0),
        restaurantEarning: Number(order.restaurantEarning || 0),
        adminCommission: Number(order.adminCommission || 0),
        adminCommissionGst: Number(pb.adminCommissionGst || 0),
        platformDiscountUsed: Number(pb.platformDiscountUsed || 0),
        restaurantDiscountUsed: Number(pb.restaurantDiscountUsed || 0),
        platformBillTotal: Number(pb.platformBillTotal || 0),
        riderEarnings: {
          deliveryCharge: Number(re.deliveryCharge || 0),
          platformFee: Number(re.platformFee || 0),
          incentive: Number(re.incentive || 0),
          tip: Number((re.tip ?? order.tip) || 0),
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
