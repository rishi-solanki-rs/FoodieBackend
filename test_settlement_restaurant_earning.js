const assert = require('assert');
const { calculateSettlementBreakdown } = require('./services/settlementCalculator');
const { validateOrderFinancialIntegrity } = require('./services/financialIntegrityService');

function r5(n) {
  const numeric = Number(n);
  if (!Number.isFinite(numeric)) return 0;
  return Number(numeric.toFixed(5));
}

function testSettlementRestaurantEarningIncludesPackaging() {
  const result = calculateSettlementBreakdown({
    itemTotal: 100,
    restaurantDiscount: 0,
    foodGstPercent: 5,
    packagingCharge: 5,
    packagingGstPercent: 5,
    foodierDiscount: 0,
    discountGstPercent: 5,
    deliveryFee: 30,
    platformFee: 9,
    deliveryChargeGstPercent: 18,
    platformGstPercent: 18,
    adminCommissionAmount: 10,
    adminCommissionGstPercent: 18,
  });

  // Restaurant earnings must include packaging charge and exclude all GST components.
  const expectedRestaurantNet = r5((100 + 5) - 10 - 1.8);
  assert.strictEqual(result.restaurantNetEarning, expectedRestaurantNet);
  assert.strictEqual(result.restaurantNet, expectedRestaurantNet);
}

function testIntegrityUsesRestaurantNetEarningAggregation() {
  const orderLike = {
    itemTotal: 100,
    packaging: 5,
    tip: 0,
    totalAmount: 157.45,
    items: [
      {
        lineTotal: 100,
        itemGstAmount: 5,
        cgst: 2.5,
        sgst: 2.5,
        restaurantEarningAmount: 93.2,
      },
    ],
    riderEarnings: {
      deliveryCharge: 30,
      platformFee: 9,
      incentive: 0,
      tip: 0,
      totalRiderEarning: 39,
    },
    paymentBreakdown: {
      itemTotal: 100,
      taxableAmountFood: 100,
      gstOnFood: 5,
      cgstOnFood: 2.5,
      sgstOnFood: 2.5,
      packagingCharge: 5,
      packagingGST: 0.25,
      cgstOnPackaging: 0.125,
      sgstOnPackaging: 0.125,
      deliveryGst: 5.4,
      cgstDelivery: 2.7,
      sgstDelivery: 2.7,
      gstOnPlatform: 7.02,
      cgstPlatform: 3.51,
      sgstPlatform: 3.51,
      adminCommissionGst: 1.8,
      cgstAdminCommission: 0.9,
      sgstAdminCommission: 0.9,
      totalAdminCommissionDeduction: 11.8,
      totalGstCollected: 19.47,
      totalGstBreakdownForAdmin: {
        cgstTotal: 9.735,
        sgstTotal: 9.735,
      },
      platformBillTotal: 44.82,
      taxablePlatformAmount: 39,
      platformDiscountUsed: 0,
      restaurantDiscountUsed: 0,
      foodierDiscount: 0,
      finalPayableToRestaurant: 112.63,
      restaurantNet: 93.2,
      restaurantNetEarning: 93.2,
    },
  };

  const validResult = validateOrderFinancialIntegrity(orderLike);
  assert.strictEqual(validResult.valid, true, validResult.issues.join('; '));

  const invalidOrder = {
    ...orderLike,
    paymentBreakdown: {
      ...orderLike.paymentBreakdown,
      restaurantNetEarning: 90,
    },
  };
  const invalidResult = validateOrderFinancialIntegrity(invalidOrder);
  assert.strictEqual(invalidResult.valid, false);
  assert.ok(
    invalidResult.issues.some((i) => i.includes('paymentBreakdown.restaurantNetEarning')),
    `Expected restaurantNetEarning mismatch issue, got: ${invalidResult.issues.join('; ')}`,
  );
}

function run() {
  testSettlementRestaurantEarningIncludesPackaging();
  testIntegrityUsesRestaurantNetEarningAggregation();
  console.log('PASS: settlement and integrity restaurant earning tests');
}

run();
