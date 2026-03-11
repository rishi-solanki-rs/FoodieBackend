# 📋 IMPLEMENTATION GUIDE: Earnings Calculation Fixes

This document provides step-by-step code fixes for correcting the earnings calculation system.

---

## FIX #1: orderController.js - Order Placement (Lines 280-360)

### Issue
Current code:
1. Sets `restaurantCommission` to `finalPayableToRestaurant` (includes GST ❌)
2. Doesn't populate `riderEarnings` structured object
3. Uses hardcoded `riderCommission = deliveryFee × 0.7`
4. Writes deprecated fields that conflict with new structure

### Target Code Location
File: `controllers/orderController.js`  
Function: `exports.placeOrder`  
Lines: 285-360 (where earnings are calculated before Order.create)

### Code Fix

**STEP 1: Extract Constants**

Add at top of function or use AdminSetting:

```javascript
const AdminSetting = require('../models/AdminSetting');

// In the placeOrder function, after getting restaurant:
const adminSettings = await AdminSetting.findOne().lean();
const payoutConfig = adminSettings?.payoutConfig || {};

const riderBaseEarning = payoutConfig.riderBaseEarningPerDelivery || 30;
const riderPerKmRate = payoutConfig.riderPerKmRate || 5;
const riderBaseDistanceKm = payoutConfig.riderBaseDistanceKm || 3;
const riderIncentivePercent = payoutConfig.riderIncentivePercent || 5;
const defaultCommissionPercent = payoutConfig.defaultRestaurantCommissionPercent || 10;
```

**STEP 2: Calculate Delivery Charge (platform fee component)**

```javascript
// Delivery Charge = base + distance bonus
const deliveryDistance = order.deliveryDistanceKm || 0;
const deliveryChargeFinal = calculateDeliveryChargeForOrder(
  deliveryDistance,
  riderBaseEarning,
  riderBaseDistanceKm,
  riderPerKmRate
);

function calculateDeliveryChargeForOrder(distance, base, baseKm, perKmRate) {
  let bonus = 0;
  if (distance > baseKm) {
    const extraKm = distance - baseKm;
    bonus = Math.ceil(extraKm) * perKmRate;
  }
  return base + bonus;
}
```

**STEP 3: Calculate Restaurant Net Earning**

Replace the line that sets `restaurantCommission`:

```javascript
// BEFORE (WRONG):
// const restaurantCommission = Number.isFinite(settlementRestaurantPayable)
//   ? Math.round(settlementRestaurantPayable * 100) / 100
//   : Math.round((totalBeforeTip - adminCommission - bill.deliveryFee) * 100) / 100;

// AFTER (CORRECT):
const restaurantGross = itemTotal + bill.packaging;  // Food + packaging only
const restaurantNet = Math.max(0, 
  Math.round((restaurantGross - adminCommission) * 100) / 100
);
// restaurantNet is the final earning for restaurant
```

**STEP 4: Calculate Rider Earnings (Complete Structure)**

Replace the lines that calculate riderCommission and riderEarning:

```javascript
// BEFORE (INCOMPLETE):
// const riderCommission = bill.deliveryFee * 0.7;
// const riderIncentive = Math.round((bill.itemTotal * (incentivePercent / 100)) * 100) / 100;
// const riderEarning = Math.round((riderCommission + tipAmount + riderIncentive) * 100) / 100;

// AFTER (STRUCTURED):
const riderEarningsCalculated = {
  deliveryCharge: Math.max(0, Math.round(deliveryChargeFinal * 100) / 100),
  platformFee: Math.max(0, Math.round(bill.platformFee * 100) / 100),
  incentive: Math.max(0, 
    Math.round((bill.itemTotal * (riderIncentivePercent / 100)) * 100) / 100
  ),
  incentivePercentAtCompletion: riderIncentivePercent,
};

riderEarningsCalculated.totalRiderEarning = Math.max(0,
  Math.round((
    riderEarningsCalculated.deliveryCharge +
    riderEarningsCalculated.platformFee +
    riderEarningsCalculated.incentive
  ) * 100) / 100
);

// Note: Tip is separate - add it during settlement, not here
```

**STEP 5: Create Order Object with Correct Fields**

Replace the Order.create with updated fields:

```javascript
const newOrder = await Order.create({
  customer: user._id,
  restaurant: restaurantId,
  idempotencyKey: `${cart._id}-${restaurantId}`,
  pickupOtp,
  pickupOtpExpiresAt: new Date(Date.now() + otpExpiry),
  deliveryOtp,
  deliveryOtpExpiresAt: new Date(Date.now() + otpExpiry),
  items: orderItems,
  itemTotal: bill.itemTotal,
  tax: bill.tax,
  packaging: bill.packaging,
  deliveryFee: bill.deliveryFee,
  platformFee: bill.platformFee,
  tip: tipAmount,
  discount: bill.discount,
  couponCode: bill.appliedCoupon,
  totalAmount: bill.toPay,
  
  paymentBreakdown: bill.paymentBreakdown || {
    itemTotal: bill.itemTotal,
    restaurantDiscount: bill.restaurantDiscount || 0,
    gstOnFood: bill.gstOnFood || 0,
    packagingCharge: bill.packaging || 0,
    packagingGST: bill.packagingGST || 0,
    restaurantBillTotal: bill.restaurantBillTotal || 0,
    foodierDiscount: bill.foodierDiscount || bill.discount || 0,
    gstOnDiscount: bill.gstOnDiscount || 0,
    
    // ADD THESE for clarity:
    restaurantGross: restaurantGross,
    adminCommission: adminCommission,
    restaurantNet: restaurantNet,
    riderDeliveryEarning: riderEarningsCalculated.deliveryCharge,
    riderIncentive: riderEarningsCalculated.incentive,
    
    finalPayableToRestaurant: restaurantNet,  // UPDATE: Use correct value
    computedVersion: "settlement-v2",
    computedAt: new Date(),
  },
  
  // NEW: Correct earning structure
  riderEarnings: {
    ...riderEarningsCalculated,
    earnedAt: new Date(),
  },
  
  // UPDATE: Use clear naming
  restaurantEarning: restaurantNet,
  adminCommissionAtOrder: adminCommission,
  
  // REMOVE or keep for backwards compatibility but don't use:
  // adminCommission: adminCommission,  // Use adminCommissionAtOrder instead
  // restaurantCommission: restaurantNet,  // Use restaurantEarning instead
  // riderCommission: REMOVED
  // riderIncentive: REMOVED (use riderEarnings.incentive)
  // riderIncentivePercent: REMOVED (use riderEarnings.incentivePercentAtCompletion)
  // riderEarning: REMOVED (use riderEarnings.totalRiderEarning)
  
  deliveryAddress: {
    addressLine: deliveryAddress.addressLine,
    coordinates: deliveryAddress.location.coordinates,
  },
  paymentMethod,
  paymentStatus,
  status: initialStatus,
  timeline: [{
    status: initialStatus,
    timestamp: new Date(),
    label: initialStatusLabel,
    by: "system",
    description: initialStatusDesc
  }],
});
```

### Validation After Fix

Add this after Order.create to verify:

```javascript
// Verify earnings calculation
const verification = {
  restaurantGross: bill.itemTotal + bill.packaging,
  adminCommission: adminCommission,
  restaurantExpected: bill.itemTotal + bill.packaging - adminCommission,
  restaurantActual: newOrder.restaurantEarning,
  riderTotal: newOrder.riderEarnings.totalRiderEarning,
  riderSum: newOrder.riderEarnings.deliveryCharge + 
            newOrder.riderEarnings.platformFee + 
            newOrder.riderEarnings.incentive,
};

if (verification.restaurantExpected !== verification.restaurantActual) {
  logger.error('Restaurant earnings mismatch', {
    orderId: newOrder._id,
    expected: verification.restaurantExpected,
    actual: verification.restaurantActual,
  });
}

if (Math.abs(verification.riderTotal - verification.riderSum) > 0.01) {
  logger.error('Rider earnings component mismatch', {
    orderId: newOrder._id,
    total: verification.riderTotal,
    sum: verification.riderSum,
  });
}
```

---

## FIX #2: paymentService.js - Settlement Logic

### Issue
`getSettlementSnapshot()` recalculates using different formula than order placement.

### Target Code Location
File: `services/paymentService.js`  
Function: `getSettlementSnapshot`  
Lines: 328-390

### Code Fix

**STEP 1: Update getSettlementSnapshot Function**

```javascript
function getSettlementSnapshot(order, restaurant, distanceInfo) {
  // Step 1: Extract base values from order
  const paymentBreakdown = order?.paymentBreakdown || {};
  
  const itemTotal = Number.isFinite(Number(paymentBreakdown.itemTotal))
    ? Number(paymentBreakdown.itemTotal)
    : Number(order?.itemTotal || 0);
    
  const packagingCharge = Number.isFinite(Number(paymentBreakdown.packagingCharge))
    ? Number(paymentBreakdown.packagingCharge)
    : Number(order?.packaging || 0);

  // Step 2: Get commission from order if stored, else recalculate
  const commissionPercent = Number(restaurant?.adminCommission || DEFAULT_COMMISSION_PERCENT);
  const commissionAmount = Number.isFinite(Number(order?.adminCommissionAtOrder))
    ? Number(order.adminCommissionAtOrder)
    : Number.isFinite(Number(order?.adminCommission))
      ? Number(order.adminCommission)
      : Math.round((Math.max(0, itemTotal + packagingCharge) * (Math.max(0, commissionPercent) / 100)) * 100) / 100;

  // Step 3: Calculate restaurant net earnings
  // Formula: (itemTotal + packaging) - adminCommission
  const restaurantGross = itemTotal + packagingCharge;
  const restaurantNet = Math.max(0, 
    Math.round((restaurantGross - commissionAmount) * 100) / 100
  );

  // Step 4: Get delivery fee from order
  const settlementDeliveryFee = Number.isFinite(Number(order?.deliveryFee))
    ? Number(order.deliveryFee)
    : Number(distanceInfo?.totalDeliveryFee || 0);

  // Step 5: Get rider incentive from structured object if available
  const riderIncentive = Number.isFinite(Number(order?.riderEarnings?.incentive))
    ? Number(order.riderEarnings.incentive)
    : Number.isFinite(Number(order?.riderIncentive))
      ? Number(order.riderIncentive)
      : Math.max(0, Math.round((itemTotal * (order?.riderEarnings?.incentivePercentAtCompletion || 5) / 100) * 100) / 100);

  // Step 6: Get platform fee from order
  const platformFee = Number.isFinite(Number(order?.platformFee))
    ? Number(order.platformFee)
    : 0;

  // Step 7: Calculate rider earnings
  // Formula: deliveryFee + platformFeeShare + incentive
  // (Tip is separate and added during wallet update, not here)
  const riderPlatformFeeShare = platformFee;  // 100% to rider by default
  const riderEarning = Math.max(0,
    Math.round((settlementDeliveryFee + riderPlatformFeeShare + riderIncentive) * 100) / 100
  );

  // Step 8: Validate against order stored values
  if (order.restaurantEarning && 
      Math.abs(restaurantNet - order.restaurantEarning) > 0.01) {
    logger.warn('Restaurant earning mismatch in settlement', {
      orderId: order._id,
      calculated: restaurantNet,
      stored: order.restaurantEarning,
      difference: restaurantNet - order.restaurantEarning,
    });
  }

  // Return settlement snapshot
  return {
    orderAmount: Number(order?.totalAmount || 0),
    itemTotal: Math.max(0, itemTotal),
    packagingCharge: Math.max(0, packagingCharge),
    restaurantGross: Math.max(0, restaurantGross),
    commissionPercent,
    commissionAmount: Math.max(0, commissionAmount),
    settlementDeliveryFee: Math.max(0, settlementDeliveryFee),
    riderIncentive: Math.max(0, riderIncentive),
    riderPlatformFeeShare: Math.max(0, riderPlatformFeeShare),
    riderEarning,
    restaurantNet,
    tax: Math.max(0, Number(order?.tax || 0)),
    platformFee: Math.max(0, platformFee),
    discount: Math.max(0, Number(order?.discount || 0)),
  };
}
```

---

## FIX #3: paymentService.js - COD Delivery Settlement (Lines 405-550)

### Issue
Platform fee not distributed to admin. Tip not handled correctly.

### Code Fix - In processCODDelivery function

**Find this section:**

```javascript
const settlement = getSettlementSnapshot(fullOrder, restaurant, distanceInfo);
const {
  orderAmount,
  itemTotal,
  packagingCharge,
  commissionPercent,
  commissionAmount,
  settlementDeliveryFee,
  riderIncentive,
  riderEarning,
  restaurantNet,
  tax,
  platformFee,
  discount,
} = settlement;
```

**Add platform fee distribution:**

```javascript
const settlement = getSettlementSnapshot(fullOrder, restaurant, distanceInfo);
const {
  orderAmount,
  itemTotal,
  packagingCharge,
  commissionPercent,
  commissionAmount,
  settlementDeliveryFee,
  riderIncentive,
  riderEarning,
  restaurantNet,
  tax,
  platformFee,
  discount,
  riderPlatformFeeShare,  // ADD THIS
} = settlement;

// ADD: Platform fee distribution
const adminPlatformFeeShare = platformFee - riderPlatformFeeShare;
```

**Find the admin wallet update:**

```javascript
adminWallet.balance += commissionAmount;
adminWallet.totalCommission += commissionAmount;
adminWallet.commissionFromRestaurants += commissionAmount;
adminWallet.lastUpdated = new Date();
await adminWallet.save({ session });
```

**UPDATE to include platform fee:**

```javascript
// Update admin wallet with commission + platform fee share
adminWallet.balance += commissionAmount + adminPlatformFeeShare;
adminWallet.totalCommission += commissionAmount;
adminWallet.commissionFromRestaurants += commissionAmount;
if (adminPlatformFeeShare > 0) {
  adminWallet.platformFeeCollection = (adminWallet.platformFeeCollection || 0) + adminPlatformFeeShare;
}
adminWallet.lastUpdated = new Date();
await adminWallet.save({ session });
```

**Find rider wallet update:**

```javascript
riderWallet.cashInHand += orderAmount;
const wasFrozen = riderWallet.checkAndFreeze();
riderWallet.totalEarnings += riderEarning;
riderWallet.availableBalance += riderEarning;
await riderWallet.save({ session });
```

**UPDATE to handle tip separately:**

```javascript
riderWallet.cashInHand += orderAmount;
const wasFrozen = riderWallet.checkAndFreeze();

// Rider earning = delivery + platform fee share + incentive (from settlement)
riderWallet.totalEarnings += riderEarning;
riderWallet.availableBalance += riderEarning;

// Tip goes fully to rider (separate from riderEarning)
if (fullOrder.tip > 0) {
  riderWallet.totalEarnings += fullOrder.tip;
  riderWallet.availableBalance += fullOrder.tip;
}

await riderWallet.save({ session });
```

**Find Rider model update:**

```javascript
await Rider.updateOne(
  { _id: fullOrder.rider._id },
  {
    $inc: {
      totalEarnings: riderEarning,
      currentBalance: riderEarning,
    },
  },
  { session },
);
```

**UPDATE to include tip:**

```javascript
await Rider.updateOne(
  { _id: fullOrder.rider._id },
  {
    $inc: {
      totalEarnings: riderEarning + (fullOrder.tip || 0),
      currentBalance: riderEarning + (fullOrder.tip || 0),
    },
  },
  { session },
);
```

**Find the payment transactions creation:**

```javascript
await PaymentTransaction.create([
  {
    order: fullOrder._id,
    rider: fullOrder.rider._id,
    restaurant: restaurant._id,
    user: fullOrder.customer,
    type: 'cod_collected',
    amount: orderAmount,
    deliveryDistanceKm: distanceInfo.distanceKm,
    isLongDistance: distanceInfo.isLongDistance,
    breakdown: {
      orderAmount,
      itemTotal,
      packagingCharge,
      commissionPercent,
      commissionAmount,
      deliveryFee: settlementDeliveryFee,
      distanceSurcharge: distanceInfo.surcharge,
      restaurantNet,
      riderEarning,
      platformEarning: commissionAmount + platformFee,
      tax,
      discount,
    },
    note: `COD collected for delivered order`,
    status: 'completed'
  },
  // ... more transactions
], { session });
```

**UPDATE to separate platform fee:**

```javascript
await PaymentTransaction.create([
  {
    order: fullOrder._id,
    rider: fullOrder.rider._id,
    restaurant: restaurant._id,
    user: fullOrder.customer,
    type: 'cod_collected',
    amount: orderAmount,
    deliveryDistanceKm: distanceInfo.distanceKm,
    isLongDistance: distanceInfo.isLongDistance,
    breakdown: {
      orderAmount,
      itemTotal,
      packagingCharge,
      commissionPercent,
      commissionAmount,
      deliveryFee: settlementDeliveryFee,
      distanceSurcharge: distanceInfo.surcharge,
      restaurantNet,
      riderEarning,
      riderDeliveryEarning: settlementDeliveryFee,
      riderIncentive: riderIncentive,
      platformFeeShare: riderPlatformFeeShare,
      adminPlatformFeeShare: adminPlatformFeeShare,
      tax,
      discount,
    },
    note: `COD collected for delivered order`,
    status: 'completed'
  },
  {
    order: fullOrder._id,
    rider: fullOrder.rider._id,
    restaurant: restaurant._id,
    user: fullOrder.customer,
    type: 'rider_earning_credit',
    amount: riderEarning,
    breakdown: {
      deliveryCharge: settlementDeliveryFee,
      platformFeeShare: riderPlatformFeeShare,
      incentive: riderIncentive,
      totalEarning: riderEarning,
      tip: fullOrder.tip || 0,
    },
    note: `Rider earning credited: delivery ₹${settlementDeliveryFee} + platform fee ₹${riderPlatformFeeShare} + incentive ₹${riderIncentive}`,
    status: 'completed',
  },
  {
    order: fullOrder._id,
    restaurant: restaurant._id,
    type: 'restaurant_commission',
    amount: restaurantNet,
    breakdown: {
      itemTotal,
      packagingCharge,
      restaurantGross: itemTotal + packagingCharge,
      commissionPercent,
      commissionAmount,
      restaurantNet,
    },
    note: `Restaurant earning credited: ₹${itemTotal} + packaging ₹${packagingCharge} - commission ₹${commissionAmount} = ₹${restaurantNet}`,
    status: 'completed'
  },
  {
    order: fullOrder._id,
    type: 'admin_earning',
    amount: commissionAmount + adminPlatformFeeShare,
    breakdown: {
      commissionAmount,
      adminPlatformFeeShare,
      totalAdmin: commissionAmount + adminPlatformFeeShare,
    },
    note: `Admin earning: commission ₹${commissionAmount} + platform fee ₹${adminPlatformFeeShare}`,
    status: 'completed'
  },
], { session });
```

---

## FIX #4: paymentService.js - Online Delivery Settlement (Lines 638-750)

### Issue
Same as COD - platform fee distribution and tip handling

### Code Fix

**Apply same changes as FIX #3** but in the `processOnlineDelivery` function:

1. Add `riderPlatformFeeShare` extraction
2. Calculate `adminPlatformFeeShare`
3. Update admin wallet to include platform fee
4. Update rider wallet to include tip separately
5. Update Rider model increment to include tip
6. Update payment transactions to show component breakdown

---

## FIX #5: orderController.js - Order Status Update (Lines 1350-1450)

### Issue
When order status changes to "delivered", settlement is triggered. Ensure settlement receives correct data.

### Code Fix - No changes needed here

This function correctly calls:
```javascript
const { processCODDelivery, processOnlineDelivery } = require('../services/paymentService');
```

Which now has the fixed logic. Just ensure it's called with the updated settlement functions.

---

## FIX #6: Order Model Schema - Add Fields

### Issue
Schema is missing clean fields for new calculation

### File
`models/Order.js`

### Changes Required

**ADD** (after `riderEarnings` object):

```javascript
// Clear, single source for restaurant earning
restaurantEarning: { 
  type: Number, 
  default: 0,
  description: 'Net earning for restaurant: (itemTotal + packaging) - adminCommission'
},

// Audit trail for admin commission
adminCommissionAtOrder: { 
  type: Number, 
  default: 0,
  description: 'Admin commission calculated at order placement for audit trail'
},
```

**UPDATE** `paymentBreakdown`:

```javascript
paymentBreakdown: {
  itemTotal: { type: Number, default: 0 },
  restaurantDiscount: { type: Number, default: 0 },
  gstOnFood: { type: Number, default: 0 },
  packagingCharge: { type: Number, default: 0 },
  packagingGST: { type: Number, default: 0 },
  restaurantBillTotal: { type: Number, default: 0 },
  foodierDiscount: { type: Number, default: 0 },
  gstOnDiscount: { type: Number, default: 0 },
  
  // ADD THESE for clarity:
  restaurantGross: { type: Number, default: 0 },   // itemTotal + packaging
  adminCommission: { type: Number, default: 0 },
  restaurantNet: { type: Number, default: 0 },     // restaurantGross - commission
  riderDeliveryEarning: { type: Number, default: 0 },
  riderIncentive: { type: Number, default: 0 },
  
  finalPayableToRestaurant: { type: Number, default: 0 },
  computedVersion: { type: String, default: "settlement-v2" },
  computedAt: { type: Date, default: Date.now },
},
```

**KEEP** but mark for deprecation:

```javascript
// DEPRECATED - Use riderEarnings object instead
riderEarning: { type: Number, default: 0 },
riderIncentive: { type: Number, default: 0 },
riderIncentivePercent: { type: Number, default: 0 },

// DEPRECATED - Use restaurantEarning instead
restaurantCommission: { type: Number, default: 0 },

// REMOVE COMING SOON
riderCommission: { type: Number, default: 0 },
```

---

## FIX #7: Administrative Validation Function

### Issue
No automatic validation that settlement calculations are correct

### Create New File
`services/settlementValidator.js`

```javascript
const Order = require('../models/Order');

/**
 * Validate settlement calculation consistency
 * Ensures order placement and settlement use same formulas
 */
async function validateSettlement(orderId) {
  const order = await Order.findById(orderId)
    .populate('restaurant')
    .lean();

  if (!order) throw new Error('Order not found');

  const errors = [];
  const warnings = [];

  // ========== RESTAURANT EARNING VALIDATION ==========
  const restaurantGross = (order.itemTotal || 0) + (order.packaging || 0);
  const adminCommission = order.adminCommissionAtOrder || order.adminCommission || 0;
  const expectedRestaurantNet = Math.round((restaurantGross - adminCommission) * 100) / 100;
  const actualRestaurantNet = order.restaurantEarning || 0;

  if (Math.abs(expectedRestaurantNet - actualRestaurantNet) > 0.01) {
    errors.push({
      type: 'restaurant_earning_mismatch',
      expected: expectedRestaurantNet,
      actual: actualRestaurantNet,
      difference: expectedRestaurantNet - actualRestaurantNet,
    });
  }

  // ========== RIDER EARNING VALIDATION ==========
  if (order.riderEarnings?.totalRiderEarning) {
    const sumComponents = (order.riderEarnings.deliveryCharge || 0) +
                         (order.riderEarnings.platformFee || 0) +
                         (order.riderEarnings.incentive || 0);
    
    if (Math.abs(sumComponents - order.riderEarnings.totalRiderEarning) > 0.01) {
      errors.push({
        type: 'rider_earning_component_mismatch',
        deliveryCharge: order.riderEarnings.deliveryCharge,
        platformFee: order.riderEarnings.platformFee,
        incentive: order.riderEarnings.incentive,
        sum: sumComponents,
        total: order.riderEarnings.totalRiderEarning,
      });
    }
  } else {
    warnings.push({
      type: 'rider_earnings_not_populated',
      message: 'riderEarnings object is empty',
    });
  }

  // ========== ITEM-LEVEL VALIDATION ==========
  let itemLevelCommission = 0;
  let itemLevelRestaurantEarning = 0;
  
  order.items?.forEach(item => {
    itemLevelCommission += item.adminCommissionAmount || 0;
    itemLevelRestaurantEarning += item.restaurantEarningAmount || 0;
  });

  if (Math.abs(itemLevelCommission - adminCommission) > 0.01) {
    errors.push({
      type: 'item_level_commission_mismatch',
      itemLevel: itemLevelCommission,
      orderLevel: adminCommission,
      difference: itemLevelCommission - adminCommission,
    });
  }

  if (Math.abs(itemLevelRestaurantEarning - actualRestaurantNet) > 0.01) {
    errors.push({
      type: 'item_level_restaurant_earning_mismatch',
      itemLevel: itemLevelRestaurantEarning,
      orderLevel: actualRestaurantNet,
      difference: itemLevelRestaurantEarning - actualRestaurantNet,
    });
  }

  // ========== DEPRECATED FIELD CHECK ==========
  if (order.riderEarning || order.riderIncentive || order.riderCommission) {
    warnings.push({
      type: 'deprecated_fields_populated',
      riderEarning: order.riderEarning,
      riderIncentive: order.riderIncentive,
      riderCommission: order.riderCommission,
      message: 'Use riderEarnings object instead',
    });
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
    breakdown: {
      restaurantGross,
      adminCommission,
      restaurantNet: expectedRestaurantNet,
      riderEarning: order.riderEarnings?.totalRiderEarning || 0,
    },
  };
}

module.exports = {
  validateSettlement,
};
```

---

## TESTING CHECKLIST

After applying all fixes, test with:

### Test 1: Order Placement

```javascript
// Test order placement with clear values
const testOrder = {
  itemTotal: 449,
  packageing: 0,
  deliveryFee: 50,
  platformFee: 9,
  deliveryDistance: 8,
  tip: 0,
  adminCommissionPercent: 10,
  riderIncentivePercent: 5,
};

// Verify:
// ✓ adminCommission = 44.90
// ✓ restaurantEarning = 404.10
// ✓ riderEarnings.deliveryCharge = 55
// ✓ riderEarnings.platformFee = 9
// ✓ riderEarnings.incentive = 22.45
// ✓ riderEarnings.totalRiderEarning = 86.45
```

### Test 2: Settlement

```javascript
// Verify settlement matches order placement
const order = await Order.findById(orderId);
const validation = validateSettlement(orderId);
console.log(validation);  // Should be { valid: true, errors: [], ... }
```

### Test 3: Wallet Updates

```javascript
// After settlement, verify:
const riderWallet = await RiderWallet.findOne({ rider: riderId });
const restaurantWallet = await RestaurantWallet.findOne({ restaurant: restaurantId });

// ✓ riderWallet.availableBalance === order.riderEarnings.totalRiderEarning
// ✓ riderWallet.totalEarnings includes tip
// ✓ restaurantWallet.balance === order.restaurantEarning
```

### Test 4: Payment Transactions

```javascript
// Verify transaction log has all components
const transactions = await PaymentTransaction.find({ order: orderId });
// Should have:
// - cod_collected (or online_payment)
// - rider_earning_credit (shows deliveryCharge, platformFee, incentive)
// - restaurant_commission
// - admin_earning (shows commission + platform fee share)
```

---

## DEPLOYMENT NOTES

1. **No Database Migration Required** - New fields are backward compatible
2. **Gradual Rollout** - New orders use fixed logic, old orders still work
3. **Data Consistency Check** - Run validation on sample orders before full deployment
4. **Monitoring** - Watch for settlement mismatches in logs
5. **Communication** - Inform riders/restaurants of corrected earnings

---

## ROLLBACK PLAN

If issues arise:

1. Revert orderController.js changes (uses new riderEarnings object)
2. Keep paymentService.js fixes (they're additive)
3. Manually review affected orders and settlements
4. Audit logs will show exact discrepancies

