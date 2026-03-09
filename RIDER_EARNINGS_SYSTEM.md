# RIDER EARNINGS BREAKDOWN SYSTEM - COMPLETE IMPLEMENTATION GUIDE

## Overview

This document describes the complete Rider Earnings Breakdown System implemented for the food delivery platform. The system calculates and tracks rider earnings for each delivery across three components:

1. **Delivery Charge** - Base compensation for completing the delivery
2. **Platform Fee** - Share of platform fees credited to rider
3. **Incentive** - Performance bonus based on order value

---

## Architecture

### System Components

```
┌─────────────────────────────────────────────────────────────┐
│                    Order Delivery                            │
├─────────────────────────────────────────────────────────────┤
│ Order Status → "delivered"                                  │
│            ↓                                                 │
│ orderController: updateOrderStatus()                        │
│            ↓                                                 │
│ paymentService: processCODDelivery() /                      │
│                 processOnlineDelivery()                     │
│            ↓                                                 │
│ riderEarningsService: creditRiderEarnings()                │
│            ↓                                                 │
│ ┌─ Calculate Delivery Charge                               │
│ ├─ Calculate Platform Fee                                  │
│ ├─ Calculate Incentive                                     │
│ ├─ Update Rider Wallet                                     │
│ └─ Create Payment Transaction                              │
└─────────────────────────────────────────────────────────────┘
```

### File Structure

```
Backend/
├── models/
│   ├── Order.js                    (Updated - riderEarnings structure)
│   ├── AdminSetting.js             (Already has earning configs)
│   ├── RiderWallet.js              (Unchanged)
│   ├── PaymentTransaction.js        (Stores transaction details)
│   └── Restaurant.js               (Unchanged)
│
├── services/
│   ├── riderEarningsService.js      (NEW - Core earnings calculation)
│   └── paymentService.js            (Updated - Integrates with earnings)
│
├── controllers/
│   ├── orderController.js           (Calls payment service on delivery)
│   └── riderEarningsController.js  (Existing - Dashboard endpoints)
│
└── routes/
    ├── orderRoutes.js
    ├── paymentSystemRoutes.js
    └── riderEarningsRoutes.js
```

---

## Database Schema Changes

### Order Model Update

The Order model now includes a detailed `riderEarnings` breakdown structure:

```javascript
riderEarnings: {
  // Component 1: Delivery Charge (Base + Distance Bonus)
  deliveryCharge: Number,           // e.g., ₹40
  
  // Component 2: Platform Fee Share
  platformFee: Number,              // e.g., ₹9
  
  // Component 3: Incentive (Percentage of Order Value)
  incentive: Number,                // e.g., ₹50
  
  // Total of all three components
  totalRiderEarning: Number,        // ₹40 + ₹9 + ₹50 = ₹99
  
  // Admin settings snapshot at time of completion
  incentivePercentAtCompletion: Number,  // e.g., 5%
  
  // When earnings were calculated
  earnedAt: Date
}
```

### Legacy Fields (For Backward Compatibility)

```javascript
riderEarning: Number,              // Use riderEarnings.totalRiderEarning instead
riderIncentive: Number,            // Use riderEarnings.incentive instead
riderIncentivePercent: Number      // Use riderEarnings.incentivePercentAtCompletion instead
```

---

## Earnings Calculation Logic

### 1. DELIVERY CHARGE CALCULATION

**Formula:**
```
baseDeliveryCharge = admin's configured baseEarningPerDelivery (default: ₹30)
distanceBonus = (deliveryDistance - baseDistance) × perKmRate (if distance > baseDistance)
totalDeliveryCharge = baseDeliveryCharge + distanceBonus
```

**Example:**
```
Admin Settings:
- baseEarningPerDelivery: ₹30
- baseDistanceKm: 3 km
- riderPerKmRate: ₹5/km

Order Details:
- Delivery Distance: 8 km

Calculation:
- Base: ₹30
- Distance Bonus: (8 - 3) × ₹5 = ₹25
- Total Delivery Charge: ₹30 + ₹25 = ₹55
```

**Source Code:**
```javascript
// Backend/services/riderEarningsService.js
const calculateDeliveryCharge = (deliveryDistanceKm, settings) => {
  const distance = Math.max(0, deliveryDistanceKm || 0);
  const payoutConfig = settings?.payoutConfig || {};
  
  const baseDeliveryCharge = payoutConfig.riderBaseEarningPerDelivery || 30;
  const baseDistance = payoutConfig.riderBaseDistanceKm || 3;
  const perKmRate = payoutConfig.riderPerKmRate || 5;
  
  let distanceBonus = 0;
  if (distance > baseDistance) {
    const extraKm = distance - baseDistance;
    distanceBonus = Math.ceil(extraKm) * perKmRate;
  }
  
  return {
    baseDeliveryCharge,
    distanceBonus,
    totalDeliveryCharge: baseDeliveryCharge + distanceBonus,
    distanceKm: distance,
  };
};
```

---

### 2. PLATFORM FEE CALCULATION

**Formula:**
```
riderPlatformFeeShare = 100% of platformFee from order
(Currently: rider gets full platform fee)
(Can be modified to: platformFee × sharePercent)
```

**Example:**
```
Order Details:
- Platform Fee: ₹9

Calculation:
- Rider Platform Fee Share: ₹9

(Admin can change to give rider 50%, 75%, etc. by modifying calculatePlatformFeeShare())
```

**Source Code:**
```javascript
const calculatePlatformFeeShare = (platformFeeFromOrder) => {
  // Currently: rider gets 100% of platform fee
  return Math.max(0, platformFeeFromOrder || 0);
  
  // Can be changed to:
  // return (platformFeeFromOrder * 0.5); // Give rider 50% of platform fee
};
```

---

### 3. INCENTIVE CALCULATION

**Formula:**
```
riderIncentive = itemTotal (before GST) × incentivePercent / 100
```

**Example:**
```
Admin Settings:
- riderIncentivePercent: 5%

Order Details:
- Item Total (before GST): ₹1000

Calculation:
- Rider Incentive: ₹1000 × 5 / 100 = ₹50
```

**Why Item Total Before GST?**
- GST is a pass-through tax (not actual revenue)
- Incentive should be on the actual food/service value
- Ensures fair incentive calculation across orders

**Source Code:**
```javascript
const calculateIncentive = (itemTotal, incentivePercent) => {
  const total = Math.max(0, itemTotal || 0);
  const percent = Math.max(0, incentivePercent || 0);
  
  return (total * percent) / 100;
};
```

---

### 4. TOTAL RIDER EARNING

**Formula:**
```
totalRiderEarning = deliveryCharge + platformFee + incentive
```

**Example:**
```
Delivery Charge: ₹55
Platform Fee:    ₹9
Incentive:       ₹50
─────────────────────
Total Earning:   ₹114
```

---

## Implementation Flow

### Step 1: Order Marked as Delivered

When order status changes to "delivered" in `orderController.js`:

```javascript
if (status === "delivered" && oldStatus !== "delivered") {
  order.deliveredAt = new Date();
  await order.save();
  
  // Trigger payment settlement
  try {
    const { processCODDelivery, processOnlineDelivery } = require('../services/paymentService');
    if (order.paymentMethod === 'cod') {
      processCODDelivery(order._id).catch(err => 
        logger.error("COD delivery payment processing failed", err)
      );
    } else {
      processOnlineDelivery(order._id).catch(err => 
        logger.error("Online delivery payment processing failed", err)
      );
    }
  } catch (payErr) {
    logger.error("Failed to trigger payment processing", payErr);
  }
}
```

### Step 2: Payment Settlement

In `paymentService.js`, either `processCODDelivery()` or `processOnlineDelivery()` is called:

```javascript
async function processCODDelivery(orderId) {
  const order = await Order.findById(orderId)
    .populate('rider')
    .populate('restaurant');
  
  // CRITICAL: Call rider earnings calculation
  const riderResult = await creditRiderEarnings(orderId);
  if (!riderResult.success) throw new Error(riderResult.error);
  
  // Update restaurant earnings
  // Update admin tracking
  
  return { success: true, riderEarnings: riderResult.riderEarnings, ... };
}
```

### Step 3: Calculate Rider Earnings

In `riderEarningsService.js`, `creditRiderEarnings()` function:

```javascript
async function creditRiderEarnings(orderId) {
  const order = await Order.findById(orderId).populate('rider');
  const settings = await getAdminSettings();
  
  // Calculate all three components
  const earningsBreakdown = calculateRiderEarnings(order, settings);
  
  // Update order with breakdown
  order.riderEarnings = {
    deliveryCharge: earningsBreakdown.deliveryCharge,
    platformFee: earningsBreakdown.platformFee,
    incentive: earningsBreakdown.incentive,
    totalRiderEarning: earningsBreakdown.totalRiderEarning,
    incentivePercentAtCompletion: earningsBreakdown.incentivePercent,
    earnedAt: earningsBreakdown.earnedAt
  };
  
  // Update wallet
  let riderWallet = await RiderWallet.findOne({ rider: order.rider._id });
  riderWallet.totalEarnings += earningsBreakdown.totalRiderEarning;
  riderWallet.availableBalance += earningsBreakdown.totalRiderEarning;
  
  // For COD: add collected amount to cashInHand
  if (order.paymentMethod === 'cod') {
    riderWallet.cashInHand += order.totalAmount;
    riderWallet.checkAndFreeze(); // Check if cash limit exceeded
  }
  
  await riderWallet.save();
  await order.save();
  
  // Create transaction record
  await PaymentTransaction.create({
    order: order._id,
    rider: order.rider._id,
    type: 'rider_earning_credit',
    amount: earningsBreakdown.totalRiderEarning,
    breakdown: {
      deliveryCharge: earningsBreakdown.deliveryCharge,
      platformFee: earningsBreakdown.platformFee,
      incentive: earningsBreakdown.incentive,
      totalRiderEarning: earningsBreakdown.totalRiderEarning,
    },
    status: 'completed'
  });
  
  return { success: true, riderEarnings: earningsBreakdown, ... };
}
```

---

## Admin Settings Configuration

### Where Settings Are Stored

**File:** `Backend/models/AdminSetting.js`

```javascript
payoutConfig: {
  riderBaseEarningPerDelivery: 30,    // Base delivery charge in ₹
  riderPerKmRate: 5,                  // Extra ₹ per km beyond base distance
  riderBaseDistanceKm: 3,             // Base distance included in base earning
  riderIncentivePercent: 5             // Incentive as % of order value
}
```

### How to Update Settings (Admin API)

```javascript
// POST /api/admin/settings
{
  "payoutConfig": {
    "riderBaseEarningPerDelivery": 35,  // Increase base to ₹35
    "riderPerKmRate": 6,                // Increase per-km rate to ₹6
    "riderBaseDistanceKm": 4,           // Include up to 4km in base
    "riderIncentivePercent": 7          // Increase incentive to 7%
  }
}
```

---

## Rider Dashboard Implementation

### Available Routes

#### 1. Rider's Own Earnings Summary
```
GET /api/riders/earnings/summary
Auth: Rider (Required)

Response:
{
  "success": true,
  "data": {
    "totalOrders": 450,
    "totalDeliveryCharges": 18000,
    "totalPlatformFees": 3600,
    "totalIncentives": 7500,
    "totalEarnings": 29100,
    "averagePerDelivery": 64.67,
    "breakdown": {
      "deliveryChargePercent": 62,
      "platformFeePercent": 12,
      "incentivePercent": 26
    }
  }
}
```

#### 2. Rider's Detailed Orders
```
GET /api/riders/earnings/orders?page=1&limit=20
Auth: Rider (Required)

Response:
{
  "success": true,
  "data": {
    "orders": [
      {
        "orderId": "...",
        "restaurantName": "Taj Restaurant",
        "orderAmount": 1200,
        "distance": 4.5,
        "earnings": {
          "deliveryCharge": 40,
          "platformFee": 9,
          "incentive": 60,
          "total": 109
        },
        "deliveredAt": "2026-03-09T15:30:00Z"
      }
    ]
  }
}
```

#### 3. Admin View - Specific Rider
```
GET /api/riders/earnings/admin/{riderId}
Auth: Admin (Required)

Response:
{
  "success": true,
  "data": {
    "riderId": "...",
    "rider": {
      "name": "Raj Kumar",
      "email": "raj@example.com",
      "workCity": "Delhi",
      "rating": 4.7,
      "totalDeliveries": 450
    },
    "wallet": {
      "totalEarnings": 29100,
      "availableBalance": 5000,
      "cashInHand": 15000,
      "isFrozen": false,
      "lastPayoutAt": "2026-03-08T00:00:00Z",
      "lastPayoutAmount": 8000
    },
    "earnings": {
      "totalOrders": 450,
      "totalDeliveryCharges": 18000,
      "totalIncentives": 7500,
      "totalEarnings": 29100
    }
  }
}
```

#### 4. Admin View - Earnings Leaderboard
```
GET /api/riders/earnings/leaderboard/all?limit=10&period=month
Auth: Admin (Required)

Response:
{
  "success": true,
  "data": {
    "period": "month",
    "topRiders": [
      {
        "riderName": "Raj Kumar",
        "totalEarnings": 8500,
        "totalOrders": 120,
        "averagePerOrder": 70.83
      }
    ],
    "totalRiders": 95
  }
}
```

---

## Transaction Tracking

### Payment Transaction Record Format

When a rider earns money, a transaction is created:

```javascript
{
  type: 'rider_earning_credit',
  rider: '<riderId>',
  order: '<orderId>',
  amount: 109,  // Total earning
  breakdown: {
    deliveryCharge: 40,
    platformFee: 9,
    incentive: 60,
    totalRiderEarning: 109,
    codCollected: 1200  // Only for COD orders
  },
  status: 'completed',
  createdAt: '2026-03-09T15:30:00Z'
}
```

### Transaction Types

- `rider_earning_credit` - Rider earnings credited
- `cod_collected` - COD cash collected from customer
- `cod_deposit` - Rider deposited cash to admin
- `rider_weekly_payout` - Weekly payout processed
- `rider_freeze` - Account frozen (cash limit exceeded)
- `rider_unfreeze` - Account unfrozen (cash deposit received)

---

## Wallet Management

### RiderWallet Fields

```javascript
{
  rider: ObjectId,
  
  // COD Cash Management
  cashInHand: 15000,              // Collected from customers
  cashLimit: 20000,               // Freeze account if exceeded
  isFrozen: false,
  frozenReason: null,
  frozenAt: null,
  
  // Earnings Tracking
  totalEarnings: 29100,           // Total earned across all deliveries
  availableBalance: 5000,         // Ready for weekly payout
  
  // Payout History
  lastPayoutAt: Date,
  lastPayoutAmount: 8000,
  totalPayouts: 4                 // Number of payouts received
}
```

### Wallet Flow

```
Order Delivered
      ↓
Calculate Earnings (₹109)
      ↓
    ┌─────────────────────────┐
    │ Update Wallet:          │
    │ totalEarnings += ₹109   │
    │ availableBalance += ₹109│
    └─────────────────────────┘
      ↓
    ┌─────────────────────────┐
    │ If COD Order:           │
    │ cashInHand += ₹1200     │
    └─────────────────────────┘
      ↓
   Check if isFrozen = true?
      ↓ Yes
   Account Frozen
   (Need to deposit)
      ↓ No
   Money Available for
   Weekly Payout
```

---

## Service Functions Reference

### riderEarningsService.js

1. **calculateDeliveryCharge(distanceKm, settings)**
   - Returns: { baseDeliveryCharge, distanceBonus, totalDeliveryCharge }

2. **calculatePlatformFeeShare(platformFee)**
   - Returns: amount as Number

3. **calculateIncentive(itemTotal, incentivePercent)**
   - Returns: amount as Number

4. **calculateRiderEarnings(order, settings)**
   - Returns: Complete breakdown object

5. **creditRiderEarnings(orderId)**
   - Updates order, wallet, creates transaction
   - Returns: { success, riderEarnings, walletUpdated }

6. **getRiderEarningsSummary(riderId, filters)**
   - Returns: Aggregated summary and detailed orders list

7. **getRiderWalletWithEarnings(riderId)**
   - Returns: Wallet + recent earnings data

---

## Testing the System

### Test Case 1: COD Order Delivery

```javascript
// Setup Order
const order = {
  _id: '...',
  paymentMethod: 'cod',
  status: 'pending',
  itemTotal: 1000,
  platformFee: 9,
  deliveryFee: 40,
  totalAmount: 1200,
  deliveryDistanceKm: 4,
  rider: '<riderId>'
};

// Mark as Delivered
order.status = 'delivered';
await order.save();

// Expected Result:
// Delivery Charge: ₹40 (base)
// Platform Fee: ₹9
// Incentive: ₹50 (1000 × 5%)
// Total: ₹99
// Rider Cash: +₹1200 (COD collected)
// Rider Earnings: +₹99
```

### Test Case 2: Online Payment Order

```javascript
// Setup Order
const order = {
  paymentMethod: 'online',
  itemTotal: 800,
  platformFee: 9,
  deliveryDistanceKm: 6,
  rider: '<riderId>'
};

// Expected Result:
// Delivery Charge: ₹45 (₹30 base + ₹15 distance bonus)
// Platform Fee: ₹9
// Incentive: ₹40 (800 × 5%)
// Total: ₹94
// Rider Cash: No change (online paid, not COD)
// Rider Earnings: +₹94
```

---

## Admin Controls

### Adjusting Earnings Parameters

**Update Base Delivery Charge:**
```javascript
// Increase from ₹30 to ₹40
await AdminSetting.updateOne({}, {
  'payoutConfig.riderBaseEarningPerDelivery': 40
});
```

**Increase Incentive Percentage:**
```javascript
// Increase from 5% to 7%
await AdminSetting.updateOne({}, {
  'payoutConfig.riderIncentivePercent': 7
});
```

**Change Per-KM Rate:**
```javascript
// Increase from ₹5/km to ₹7/km
await AdminSetting.updateOne({}, {
  'payoutConfig.riderPerKmRate': 7
});
```

---

## Migration Notes (if updating existing system)

### Backward Compatibility

- Old `riderEarning` field still exists but is now mirrored from `riderEarnings.totalRiderEarning`
- Old `riderIncentive` field still exists but is now from `riderEarnings.incentive`
- Existing code querying old fields will continue to work

### Data Migration Script

If you have existing delivered orders without riderEarnings breakdown:

```javascript
const Order = require('./models/Order');
const { creditRiderEarnings } = require('./services/riderEarningsService');

async function migrateExistingOrders() {
  const ordersWithoutBreakdown = await Order.find({
    status: 'delivered',
    'riderEarnings.totalRiderEarning': { $exists: false }
  });
  
  for (const order of ordersWithoutBreakdown) {
    try {
      await creditRiderEarnings(order._id);
      console.log(`Migrated order ${order._id}`);
    } catch (err) {
      console.error(`Failed to migrate order ${order._id}`, err);
    }
  }
}

migrateExistingOrders();
```

---

## Troubleshooting

### Issue: Rider earnings not being credited

**Check:**
1. Is order status changing to 'delivered'?
2. Is `creditRiderEarnings()` being called?
3. Are admin settings properly configured?
4. Check logs: `Error crediting rider earnings: [error message]`

### Issue: Earnings breakdown not showing in dashboard

**Check:**
1. Is `riderEarnings` fields populated in order?
2. Are API endpoints returning correct data?
3. Frontend must query `/api/riders/earnings/summary`

### Issue: Incorrect incentive calculation

**Check:**
1. Is `itemTotal` (before GST) being used correctly?
2. Is `riderIncentivePercent` from AdminSetting correct?
3. Run test: `incentive = itemTotal × percent / 100`

---

## Performance Considerations

### Indexes for Fast Queries

The system relies on these MongoDB indexes:

```javascript
// Order.js
order Schema.index({ 'riderEarnings.earnedAt': -1 });
Order.index({ rider: 1, status: 1 });

// PaymentTransaction.js
PaymentTransaction.index({ rider: 1, createdAt: -1 });
PaymentTransaction.index({ type: 1, createdAt: -1 });
```

### Dashboard Query Optimization

- Limit queries to recent months only (not all-time by default)
- Use aggregation for large summaries
- Cache daily/weekly summaries

---

## Future Enhancements

1. **Dynamic Incentive Tiers**
   - Different incentive % based on delivery count
   - Example: 5% for <50 deliveries, 7% for 50-100, 10% for 100+

2. **Time-Based Bonus**
   - Extra incentive for deliveries during peak hours
   - Example: +₹10 bonus between 12-2 PM

3. **Distance-Based Incentive**
   - Higher incentive for longer distance deliveries
   - Example: 5% for <5km, 8% for 5-10km, 10% for >10km

4. **Seasonal Adjustments**
   - Different rates during peak seasons
   - Example: 2x incentive during festival season

5. **Quality Score Impact**
   - Earnings tied to delivery rating
   - Deduction for low ratings or complaints

---

## Summary

The Rider Earnings Breakdown System provides:

✅ **Transparent Earnings** - Riders see exact breakdown of each earning component
✅ **Fair Compensation** - Distance, platform fee, and performance-based pay
✅ **Admin Control** - Easy adjustment of earning parameters
✅ **Audit Trail** - Complete transaction history for accounting
✅ **Dashboard Visibility** - Real-time earnings data for riders and admin
✅ **Wallet Integration** - Seamless integration with payout system
✅ **Backward Compatible** - Supports existing order data

The system is production-ready and fully integrated with the existing payment settlement flow.
