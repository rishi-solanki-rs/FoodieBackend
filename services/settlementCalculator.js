function round(value) {
  return Math.round((Number(value) || 0) * 100) / 100;
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

/**
 * Canonical settlement breakdown calculator.
 * All billing and settlement modules should use this to avoid formula drift.
 *
 * Discount distribution rule: coupon discount absorbs the platform bill
 * (deliveryFee + platformFee) first; only the remainder reduces the restaurant
 * bill. This correctly separates the two invoice sections and ensures GST
 * reversal is only applied to the restaurant-side discount (platform fees
 * are zero-rated).
 */
function calculateSettlementBreakdown({
  itemTotal = 0,
  restaurantDiscount = 0,
  foodGstPercent = 0,
  packagingCharge = 0,
  packagingGstPercent = 0,
  foodierDiscount = 0,
  discountGstPercent = 0,
  // Platform bill inputs
  deliveryFee = 0,
  platformFee = 0,
  platformGstPercent = 0,
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
  const platformComponents = round(safeDeliveryFee + safePlatformFee);

  // ── Platform-first discount distribution ───────────────────────────────────
  // Coupon discount first absorbs the platform bill; remainder reduces restaurant bill.
  const totalDiscountable = round(restaurantBillTotal + platformComponents);
  const safeFoodierDiscount = round(clamp(foodierDiscount, 0, totalDiscountable));
  const platformDiscountUsed = round(clamp(safeFoodierDiscount, 0, platformComponents));
  const restaurantDiscountUsed = round(safeFoodierDiscount - platformDiscountUsed);

  // GST reversal only on restaurant-side discount (platform fees are zero-rated)
  const gstOnDiscount = round(restaurantDiscountUsed * (Math.max(0, discountGstPercent) / 100));
  const finalPayableToRestaurant = round(
    restaurantBillTotal - restaurantDiscountUsed + gstOnDiscount,
  );

  // Platform bill after discount absorption
  const taxablePlatformAmount = round(platformComponents - platformDiscountUsed);
  const gstOnPlatform = round(taxablePlatformAmount * (Math.max(0, platformGstPercent) / 100));
  const cgstPlatform = round(gstOnPlatform / 2);
  const sgstPlatform = round(gstOnPlatform - cgstPlatform);
  const platformBillTotal = round(taxablePlatformAmount + gstOnPlatform);

  return {
    // ── Restaurant bill ───────────────────────────────────────────────────────
    itemTotal: safeItemTotal,
    restaurantDiscount: safeRestaurantDiscount,
    taxableAmountFood,
    gstOnFood,
    cgstOnFood,
    sgstOnFood,
    packagingCharge: safePackagingCharge,
    packagingGST,
    cgstOnPackaging,
    sgstOnPackaging,
    restaurantBillTotal,
    foodierDiscount: safeFoodierDiscount,
    platformDiscountUsed,
    restaurantDiscountUsed,
    gstOnDiscount,
    finalPayableToRestaurant,
    // ── Platform bill ─────────────────────────────────────────────────────────
    deliveryFee: safeDeliveryFee,
    platformFee: safePlatformFee,
    taxablePlatformAmount,
    gstOnPlatform,
    cgstPlatform,
    sgstPlatform,
    platformBillTotal,
    // ── GST percents (for invoice display) ───────────────────────────────────
    gstPercentOnFood: round(Math.max(0, foodGstPercent)),
    gstPercentOnPackaging: round(Math.max(0, packagingGstPercent)),
    gstPercentOnDiscount: round(Math.max(0, discountGstPercent)),
    gstPercentOnPlatform: round(Math.max(0, platformGstPercent)),
    computedAt: new Date(),
    computedVersion: "settlement-v2",
  };
}

module.exports = {
  calculateSettlementBreakdown,
  round,
};
