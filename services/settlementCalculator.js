const MONEY_SCALE = 5;

function round(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return 0;
  return Number(numeric.toFixed(MONEY_SCALE));
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

/**
 * Canonical settlement breakdown calculator.
 * All billing and settlement modules should use this to avoid formula drift.
 *
 * Discount distribution rule: coupon discount is a platform discount only.
 * It can reduce only the platform bill (delivery + platform fee and their GST)
 * and never reduces restaurant bill amounts.
 */
function calculateSettlementBreakdown({
  itemTotal = 0,
  restaurantDiscount = 0,
  foodGstPercent = 0,
  packagingCharge = 0,
  packagingGstPercent = 0,
  foodierDiscount = 0,
  couponType = null,
  freeDelivery = false,
  discountGstPercent = 0,
  // Platform bill inputs
  deliveryFee = 0,
  platformFee = 0,
  deliveryChargeGstPercent = 18,
  platformGstPercent = 0,
  // Settlement inputs
  adminCommissionAmount = 0,
  adminCommissionGstPercent = 18,
}) {
  // ── Restaurant bill section ─────────────────────────────────────────────────
  const safeItemTotal = round(Math.max(0, itemTotal));
  const safeRestaurantDiscount = round(clamp(restaurantDiscount, 0, safeItemTotal));
  const taxableAmountFood = round(safeItemTotal - safeRestaurantDiscount);

  const gstOnFood = round(taxableAmountFood * (Math.max(0, foodGstPercent) / 100));
  const cgstOnFood = round(gstOnFood / 2);
  const sgstOnFood = round(gstOnFood - cgstOnFood); // avoids fp rounding drift

  const safePackagingCharge = round(Math.max(0, packagingCharge));
  const packagingGST = round(safePackagingCharge * (Math.max(0, packagingGstPercent) / 100));
  const cgstOnPackaging = round(packagingGST / 2);
  const sgstOnPackaging = round(packagingGST - cgstOnPackaging);

  const restaurantBillTotal = round(
    taxableAmountFood + gstOnFood + safePackagingCharge + packagingGST,
  );

  // ── Platform bill section ───────────────────────────────────────────────────
  const safeDeliveryFee = round(Math.max(0, deliveryFee));
  const safePlatformFee = round(Math.max(0, platformFee));
  const safeDeliveryChargeGstPercent = round(Math.max(0, deliveryChargeGstPercent));

  // ── Platform discount distribution ─────────────────────────────────────────
  // Coupons are platform-only: split proportionally across delivery fee and platform fee.
  // GST is then recalculated on the post-discount amounts so the customer receives the
  // correct tax benefit. Restaurant billing is never affected by coupons.
  const platformChargesBase = round(safeDeliveryFee + safePlatformFee);
  const safeFoodierDiscount = round(clamp(foodierDiscount, 0, platformChargesBase));
  const restaurantDiscountUsed = safeRestaurantDiscount;

  // Discount application order:
  // 1) Platform fee first
  // 2) Remaining discount on delivery fee
  // Free delivery coupon always zeroes delivery charge for customer.
  const normalizedCouponType = String(couponType || '').toLowerCase();
  let platformDiscountSplit = 0;
  let deliveryDiscountUsed = 0;

  if (freeDelivery || normalizedCouponType === 'free_delivery') {
    deliveryDiscountUsed = safeDeliveryFee;
  } else {
    platformDiscountSplit = round(Math.min(safeFoodierDiscount, safePlatformFee));
    const remainingDiscount = round(Math.max(0, safeFoodierDiscount - platformDiscountSplit));
    deliveryDiscountUsed = round(Math.min(remainingDiscount, safeDeliveryFee));
  }

  const platformDiscountUsed = round(platformDiscountSplit + deliveryDiscountUsed);

  // Net amounts charged to the customer after coupon discount
  const deliveryFeeAfterDiscount = round(Math.max(0, safeDeliveryFee - deliveryDiscountUsed));
  const platformFeeAfterDiscount = round(Math.max(0, safePlatformFee - platformDiscountSplit));

  // GST on post-discount amounts (requirement: GST = discounted_base × rate)
  const deliveryGST = round(deliveryFeeAfterDiscount * (safeDeliveryChargeGstPercent / 100));
  const cgstDelivery = round(deliveryGST / 2);
  const sgstDelivery = round(deliveryGST - cgstDelivery);

  const platformGST = round(platformFeeAfterDiscount * (Math.max(0, platformGstPercent) / 100));
  const cgstPlatform = round(platformGST / 2);
  const sgstPlatform = round(platformGST - cgstPlatform);

  // Reference total at full rates — for display/reporting only, not used in billing
  const platformBillBeforeDiscount = round(
    safeDeliveryFee + round(safeDeliveryFee * (safeDeliveryChargeGstPercent / 100))
    + safePlatformFee + round(safePlatformFee * (Math.max(0, platformGstPercent) / 100)),
  );

  // Customer-facing platform bill: post-discount fee + GST on discounted amounts
  const platformBillTotal = round(deliveryFeeAfterDiscount + deliveryGST + platformFeeAfterDiscount + platformGST);

  // Platform absorbs the delivery discount so the rider is paid the full original delivery fee
  const adminDeliverySubsidy = deliveryDiscountUsed;

  // No separate GST-on-discount component (GST is already applied on the post-discount base)
  const gstOnDiscount = 0;
  const finalPayableToRestaurant = restaurantBillTotal;

  // ── Canonical settlement fields ───────────────────────────────────────────
  // Business rule:
  // restaurantNet = taxableFood + packagingCharge - adminCommission - adminCommissionGST
  const safeAdminCommissionAmount = round(Math.max(0, adminCommissionAmount));
  const adminCommissionGst = round(
    safeAdminCommissionAmount * (Math.max(0, adminCommissionGstPercent) / 100),
  );
  const cgstAdminCommission = round(adminCommissionGst / 2);
  const sgstAdminCommission = round(adminCommissionGst - cgstAdminCommission);

  const totalGstCollected = round(
    gstOnFood + packagingGST + deliveryGST + platformGST + adminCommissionGst,
  );
  const totalCgstForAdmin = round(
    cgstOnFood + cgstOnPackaging + cgstDelivery + cgstPlatform + cgstAdminCommission,
  );
  const totalSgstForAdmin = round(
    sgstOnFood + sgstOnPackaging + sgstDelivery + sgstPlatform + sgstAdminCommission,
  );

  const totalGstBreakdownForAdmin = {
    foodGst: gstOnFood,
    packagingGst: packagingGST,
    deliveryGST,
    platformGST,
    adminCommissionGst,
    cgstTotal: totalCgstForAdmin,
    sgstTotal: totalSgstForAdmin,
  };

  const restaurantNet = round(Math.max(
    0,
    taxableAmountFood + safePackagingCharge - safeAdminCommissionAmount - adminCommissionGst,
  ));
  const restaurantGross = round(taxableAmountFood + safePackagingCharge);
  const restaurantNetEarning = restaurantNet;
  const customerRestaurantBill = finalPayableToRestaurant;

  return {
    // ── Restaurant bill ───────────────────────────────────────────────────────
    itemTotal: safeItemTotal,
    restaurantDiscount: safeRestaurantDiscount,
    priceAfterRestaurantDiscount: taxableAmountFood,
    taxableAmountFood,
    gstOnFood,
    cgstOnFood,
    sgstOnFood,
    packagingCharge: safePackagingCharge,
    packagingGST,
    cgstOnPackaging,
    sgstOnPackaging,
    restaurantBillTotal,
    foodierDiscount: platformDiscountUsed,
    couponType: normalizedCouponType || null,
    platformDiscountUsed,
    deliveryDiscountUsed,
    platformDiscountSplit,
    restaurantDiscountUsed,
    gstOnDiscount,
    finalPayableToRestaurant,
    // ── Platform bill ─────────────────────────────────────────────────────────
    deliveryFee: safeDeliveryFee,
    deliveryGST,
    cgstDelivery,
    sgstDelivery,
    deliveryChargeGstPercent: safeDeliveryChargeGstPercent,
    platformFee: safePlatformFee,
    platformBillBeforeDiscount,
    platformGST,
    cgstPlatform,
    sgstPlatform,
    platformBillTotal,
    deliveryFeeAfterDiscount,
    platformFeeAfterDiscount,
    adminDeliverySubsidy,
    // ── GST percents (for invoice display) ───────────────────────────────────
    gstPercentOnFood: round(Math.max(0, foodGstPercent)),
    gstPercentOnPackaging: round(Math.max(0, packagingGstPercent)),
    gstPercentOnDiscount: round(Math.max(0, discountGstPercent)),
    gstPercentOnPlatform: round(Math.max(0, platformGstPercent)),
    adminCommissionAmount: safeAdminCommissionAmount,
    adminCommissionGstPercent: round(Math.max(0, adminCommissionGstPercent)),
    adminCommissionGst,
    cgstAdminCommission,
    sgstAdminCommission,
    totalGstCollected,
    totalGstBreakdownForAdmin,
    restaurantGross,
    restaurantNet,
    restaurantNetEarning,
    customerRestaurantBill,
    computedAt: new Date(),
    computedVersion: "settlement-v3",
  };
}

module.exports = {
  calculateSettlementBreakdown,
  round,
};
