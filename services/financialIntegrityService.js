'use strict';

const { logger } = require('../utils/logger');

const r2 = (n) => {
  const numeric = Number(n);
  if (!Number.isFinite(numeric)) return 0;
  return Number(numeric.toFixed(5));
};
const nearlyEqual = (a, b, tol = 0.00002) => Math.abs(r2(a) - r2(b)) <= tol;

function validateOrderFinancialIntegrity(orderLike) {
  const order = orderLike || {};
  const pb = order.paymentBreakdown || {};
  const items = Array.isArray(order.items) ? order.items : [];
  const issues = [];
  const adminCommission = r2((pb.totalAdminCommissionDeduction || 0) - (pb.adminCommissionGst || 0));

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
    const summedFoodGst = r2(
      items.reduce((sum, item) => sum + Number((item?.gstOnDiscountedPrice ?? item?.itemGstAmount) || 0), 0),
    );
    if (!nearlyEqual(pb.gstOnFood || 0, summedFoodGst)) {
      issues.push('gstOnFood mismatch: sum(items.gstOnDiscountedPrice) != paymentBreakdown.gstOnFood');
    }
  }

  // 3h) discounted food base integrity
  if (items.length > 0) {
    const summedAfterDiscount = r2(items.reduce((sum, item) => sum + Number(item?.priceAfterDiscount || 0), 0));
    const expectedAfterDiscount = r2((pb.itemTotal || order.itemTotal || 0) - (pb.restaurantDiscount || 0));
    const storedAfterDiscount = r2(pb.priceAfterRestaurantDiscount ?? pb.taxableAmountFood ?? expectedAfterDiscount);
    if (!nearlyEqual(storedAfterDiscount, summedAfterDiscount)) {
      issues.push('discounted food base mismatch: sum(items.priceAfterDiscount) != paymentBreakdown.priceAfterRestaurantDiscount');
    }
    if (!nearlyEqual(storedAfterDiscount, expectedAfterDiscount)) {
      issues.push('discounted food base mismatch: itemTotal - restaurantDiscount != paymentBreakdown.priceAfterRestaurantDiscount');
    }
  }

  // 3b) Packaging GST split integrity
  if (!nearlyEqual((pb.cgstOnPackaging || 0) + (pb.sgstOnPackaging || 0), pb.packagingGST || 0)) {
    issues.push('packaging GST split mismatch: cgstOnPackaging + sgstOnPackaging != packagingGST');
  }

  // 3c) Delivery GST split integrity
  if (!nearlyEqual((pb.cgstDelivery || 0) + (pb.sgstDelivery || 0), pb.deliveryGST || 0)) {
    issues.push('delivery GST split mismatch: cgstDelivery + sgstDelivery != deliveryGST');
  }

  // 3d) Platform GST split integrity
  if (!nearlyEqual((pb.cgstPlatform || 0) + (pb.sgstPlatform || 0), pb.platformGST || 0)) {
    issues.push('platform GST split mismatch: cgstPlatform + sgstPlatform != platformGST');
  }

  // 3e) Admin commission GST split integrity
  if (!nearlyEqual((pb.cgstAdminCommission || 0) + (pb.sgstAdminCommission || 0), pb.adminCommissionGst || 0)) {
    issues.push('admin commission GST split mismatch: cgstAdminCommission + sgstAdminCommission != adminCommissionGst');
  }

  // 3f) totalGstCollected integrity
  const totalGstExpected = r2(
    (pb.gstOnFood || 0)
      + (pb.packagingGST || 0)
      + (pb.deliveryGST || 0)
      + (pb.platformGST || 0)
      + (pb.adminCommissionGst || 0),
  );
  if (!nearlyEqual(pb.totalGstCollected || 0, totalGstExpected)) {
    issues.push('totalGstCollected mismatch: gstOnFood + packagingGST + deliveryGST + platformGST + adminCommissionGst');
  }

  // 3h) root tax should mirror totalGstCollected
  if (!nearlyEqual(order.tax || 0, pb.totalGstCollected || 0)) {
    issues.push('root tax mismatch: order.tax must equal paymentBreakdown.totalGstCollected');
  }

  // 3g) Admin GST summary split integrity
  const totalCgstExpected = r2(
    (pb.cgstOnFood || 0)
      + (pb.cgstOnPackaging || 0)
      + (pb.cgstDelivery || 0)
      + (pb.cgstPlatform || 0)
      + (pb.cgstAdminCommission || 0),
  );
  const totalSgstExpected = r2(
    (pb.sgstOnFood || 0)
      + (pb.sgstOnPackaging || 0)
      + (pb.sgstDelivery || 0)
      + (pb.sgstPlatform || 0)
      + (pb.sgstAdminCommission || 0),
  );
  const adminGstSummary = pb.totalGstBreakdownForAdmin || {};
  if (!nearlyEqual(adminGstSummary.cgstTotal || 0, totalCgstExpected)) {
    issues.push('totalGstBreakdownForAdmin.cgstTotal mismatch');
  }
  if (!nearlyEqual(adminGstSummary.sgstTotal || 0, totalSgstExpected)) {
    issues.push('totalGstBreakdownForAdmin.sgstTotal mismatch');
  }
  if (!nearlyEqual((adminGstSummary.cgstTotal || 0) + (adminGstSummary.sgstTotal || 0), pb.totalGstCollected || 0)) {
    issues.push('GST summary mismatch: cgstTotal + sgstTotal != totalGstCollected');
  }

  // 4) Platform bill integrity
  // Since settlement-v3, GST is calculated on post-discount amounts.
  // platformBillTotal = deliveryFeeAfterDiscount + deliveryGST + platformFeeAfterDiscount + platformGST
  // Fallback to legacy formula for orders created before settlement-v3.
  const deliveryDiscUsed = r2(pb.deliveryDiscountUsed || 0);
  const totalCouponDisc = r2(pb.platformDiscountUsed || 0);
  const platformDiscSplitCheck = r2(totalCouponDisc - deliveryDiscUsed);
  const deliveryFeeNet = r2(
    pb.deliveryFeeAfterDiscount ?? Math.max(0, (pb.deliveryFee || 0) - deliveryDiscUsed),
  );
  const platformFeeNet = r2(
    pb.platformFeeAfterDiscount ?? Math.max(0, (pb.platformFee || 0) - platformDiscSplitCheck),
  );
  const platformBillExpected = r2(
    deliveryFeeNet + (pb.deliveryGST || 0) + platformFeeNet + (pb.platformGST || 0),
  );
  if (!nearlyEqual(pb.platformBillTotal || 0, platformBillExpected)) {
    issues.push('platformBillTotal mismatch: deliveryFeeAfterDiscount + deliveryGST + platformFeeAfterDiscount + platformGST');
  }

  // 5) Discount distribution integrity
  if (!nearlyEqual(pb.platformDiscountUsed || 0, pb.foodierDiscount || 0)) {
    issues.push('platform discount mismatch: platformDiscountUsed != foodierDiscount');
  }
  if (!nearlyEqual(pb.restaurantDiscountUsed || 0, pb.restaurantDiscount || 0)) {
    issues.push('restaurant discount mismatch: restaurantDiscountUsed != restaurantDiscount');
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
    if (!nearlyEqual(pb.restaurantNet || 0, itemRestaurantSum)) {
      issues.push('restaurant earning mismatch: sum(items.restaurantEarningAmount) != paymentBreakdown.restaurantNet');
    }
    if (!nearlyEqual(pb.restaurantNetEarning || 0, itemRestaurantSum)) {
      issues.push('restaurant earning mismatch: sum(items.restaurantEarningAmount) != paymentBreakdown.restaurantNetEarning');
    }
  }

  // 8) Canonical payment breakdown consistency
  if (!nearlyEqual(pb.restaurantNet || 0, pb.restaurantNetEarning || 0)) {
    issues.push('restaurant net alias mismatch: restaurantNet != restaurantNetEarning');
  }

  // 9) Restaurant net formula integrity
  const expectedRestaurantNet = r2(
    (pb.taxableAmountFood ?? pb.itemTotal ?? order.itemTotal ?? 0)
    + (pb.packagingCharge ?? order.packaging ?? 0)
    - adminCommission
    - (pb.adminCommissionGst || 0),
  );
  if (!nearlyEqual(pb.restaurantNet || 0, expectedRestaurantNet)) {
    issues.push('restaurant net mismatch: restaurantGross - adminCommission - adminCommissionGst');
  }

  // 10) Total order amount consistency
  const expectedOrderTotal = r2(
    (pb.finalPayableToRestaurant || 0)
      + (pb.platformBillTotal || 0)
      + ((order.tip ?? re.tip) || 0),
  );
  if (!nearlyEqual(order.totalAmount || 0, expectedOrderTotal)) {
    issues.push('total amount mismatch: finalPayableToRestaurant + platformBillTotal + tip != order.totalAmount');
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
        restaurantEarning: Number(pb.restaurantNet || 0),
        adminCommission: Number(adminCommission || 0),
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
