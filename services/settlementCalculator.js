function round(value) {
  return Math.round((Number(value) || 0) * 100) / 100;
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

/**
 * Canonical settlement breakdown calculator.
 * All billing and settlement modules should use this to avoid formula drift.
 */
function calculateSettlementBreakdown({
  itemTotal = 0,
  restaurantDiscount = 0,
  foodGstPercent = 0,
  packagingCharge = 0,
  packagingGstPercent = 0,
  foodierDiscount = 0,
  discountGstPercent = 0,
}) {
  const safeItemTotal = round(Math.max(0, itemTotal));
  const safeRestaurantDiscount = round(clamp(restaurantDiscount, 0, safeItemTotal));
  const priceAfterRestaurantDiscount = round(safeItemTotal - safeRestaurantDiscount);

  const gstOnFood = round(priceAfterRestaurantDiscount * (Math.max(0, foodGstPercent) / 100));
  const safePackagingCharge = round(Math.max(0, packagingCharge));
  const packagingGST = round(safePackagingCharge * (Math.max(0, packagingGstPercent) / 100));

  const restaurantBillTotal = round(
    priceAfterRestaurantDiscount + gstOnFood + safePackagingCharge + packagingGST,
  );

  const safeFoodierDiscount = round(clamp(foodierDiscount, 0, restaurantBillTotal));
  const gstOnDiscount = round(safeFoodierDiscount * (Math.max(0, discountGstPercent) / 100));
  const finalPayableToRestaurant = round(
    restaurantBillTotal - safeFoodierDiscount + gstOnDiscount,
  );

  return {
    itemTotal: safeItemTotal,
    restaurantDiscount: safeRestaurantDiscount,
    gstOnFood,
    packagingCharge: safePackagingCharge,
    packagingGST,
    restaurantBillTotal,
    foodierDiscount: safeFoodierDiscount,
    gstOnDiscount,
    finalPayableToRestaurant,
    gstPercentOnFood: round(Math.max(0, foodGstPercent)),
    gstPercentOnPackaging: round(Math.max(0, packagingGstPercent)),
    gstPercentOnDiscount: round(Math.max(0, discountGstPercent)),
    computedAt: new Date(),
    computedVersion: "settlement-v1",
  };
}

module.exports = {
  calculateSettlementBreakdown,
  round,
};
