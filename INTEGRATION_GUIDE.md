# 💰 Foodie Payment System — Integration Guide

## Overview (Swiggy-Style Flow)

```
Customer places order (COD)
        │
        ▼
Rider delivers → marks "delivered"
        │
        ▼
Rider confirms cash collected → API /cod/confirm
        │
        ├─ cashInHand increases
        ├─ Restaurant commission auto-credited
        ├─ Rider earning credited
        │
        ▼
cashInHand >= cashLimit?
        │
   YES  │  NO
   ▼    ▼
FROZEN  Continue accepting orders
   │
   ▼
Rider deposits cash to admin
   │
   ▼
Admin confirms → account UNFROZEN
        │
Every Sunday (cron)
        ▼
Weekly payout → restaurant & rider bank accounts
```

---

## 📁 New Files to Add

Copy these files into your project:

```
models/
  RiderWallet.js        → new
  RestaurantWallet.js   → new
  PaymentTransaction.js → new

services/
  paymentService.js     → new (core logic)
  paymentCronJobs.js    → new (weekly payout cron)

controllers/
  paymentSystemController.js → new

routes/
  paymentSystemRoutes.js     → new
```

---

## ⚙️ Step 1: Register Routes in Server.js

Add to your `Server.js`:

```js
const paymentSystemRoutes = require('./routes/paymentSystemRoutes');
app.use('/api/payment', paymentSystemRoutes);
```

---

## ⚙️ Step 2: Add Payment Cron to cronService.js

At the bottom of your existing `services/cronService.js`, add:

```js
const initPaymentCronJobs = require('./paymentCronJobs');

const initCronJobs = () => {
  // ... existing cron jobs ...

  // NEW: payment cron (weekly payouts + freeze warnings)
  initPaymentCronJobs();
};
```

---

## ⚙️ Step 3: Add deliveryDistanceKm to Order Model

In `models/Order.js`, add this field:

```js
// Distance between restaurant and customer
deliveryDistanceKm: { type: Number, default: 0 },
```

---

## ⚙️ Step 4: Hook into Order Delivery

In `controllers/orderController.js`, when status changes to `'delivered'`, add:

```js
const { processCODDelivery, processOnlineDelivery } = require('../services/paymentService');

// Inside the status update handler, after saving "delivered":
if (newStatus === 'delivered') {
  if (order.paymentMethod === 'cod') {
    // COD: don't auto-process — wait for rider to call /cod/confirm
    // Just notify rider to confirm cash collection
  } else {
    // Online/Wallet: auto-process immediately
    await processOnlineDelivery(order._id);
  }
}
```

---

## ⚙️ Step 5: Block Frozen Riders from Accepting Orders

In your rider order acceptance logic (riderController.js), add:

```js
const RiderWallet = require('../models/RiderWallet');

// Before assigning a COD order to a rider:
if (order.paymentMethod === 'cod') {
  const riderWallet = await RiderWallet.findOne({ rider: rider._id });
  if (riderWallet?.isFrozen) {
    return res.status(403).json({
      success: false,
      message: '🚫 Your account is frozen due to exceeding the COD cash limit. Please deposit cash to admin to re-activate.',
      cashInHand: riderWallet.cashInHand,
      cashLimit: riderWallet.cashLimit
    });
  }
}
```

---

## 💡 Distance Surcharge — How It Works

When customer places order, calculate distance between restaurant coords and delivery coords:

```js
const { calculateDeliveryCharges } = require('../services/paymentService');

// In order placement:
const distanceKm = calculateDistance(restaurantCoords, deliveryCoords); // your existing util
const { totalDeliveryFee, surcharge, isLongDistance } = calculateDeliveryCharges(distanceKm);

order.deliveryFee = totalDeliveryFee;  // ₹30 base + ₹10/km surcharge
order.deliveryDistanceKm = distanceKm;
```

**Pricing table:**
| Distance | Delivery Fee | Rider Bonus |
|----------|-------------|-------------|
| 0–2 km   | ₹30         | ₹0 extra    |
| 3 km     | ₹40         | ₹5          |
| 4 km     | ₹50         | ₹10         |
| 5 km     | ₹60         | ₹15         |
| 6 km     | ₹70         | ₹20         |

---

## 🏪 Restaurant Commission Flow

**On every delivered order:**
```
orderAmount = ₹500
commissionPercent = 10%   (set per restaurant in restaurant.adminCommission)
commissionAmount = ₹50    (platform keeps this)
deliveryFee = ₹40         (platform keeps this)
restaurantNet = ₹500 - ₹50 - ₹40 = ₹410  ← auto-credited to restaurant wallet
```

**Every Sunday:** Restaurant wallet balance is paid out to bank account.

---

## 🚴 Rider Wallet Flow

**Per delivery (COD):**
```
Order amount = ₹500 (rider collects this cash)
Rider earning = ₹25 flat + ₹5/km bonus
cashInHand += ₹500
availableBalance += ₹31 (₹25 + ₹6 for 3.2km)
```

**Freeze check:**
```
cashLimit = ₹2000 (admin configurable per rider)
If cashInHand >= ₹2000 → FROZEN
```

**Unfreeze:**
```
Rider deposits ₹2000 cash at hub/admin
Admin calls: POST /api/payment/rider/deposit { riderId, amount: 2000 }
cashInHand = ₹0 → isFrozen = false → rider can work again
```

**Every Sunday:** availableBalance is paid out (earnings for delivery fees).

---

## 🔔 Notifications to Add (Recommended)

1. **When rider is frozen:** Push notification "Your account is frozen. Please deposit ₹X to continue."
2. **When rider is at 80% limit:** Warning push "You have ₹1600/₹2000 COD. Deposit soon."
3. **On weekly payout:** "₹X has been paid to your bank account."
4. **When restaurant commission credited:** Silent log (no notification needed unless requested).

---

## 📊 API Reference

| Method | Endpoint | Role | Description |
|--------|----------|------|-------------|
| POST | `/api/payment/calculate-delivery-fee` | All | Get delivery fee by distance |
| GET | `/api/payment/rider/wallet` | Rider | Own wallet |
| POST | `/api/payment/cod/confirm` | Rider | Confirm COD collection |
| GET | `/api/payment/restaurant/wallet` | Restaurant | Own wallet |
| GET | `/api/payment/rider/frozen-riders` | Admin | List frozen riders |
| POST | `/api/payment/rider/deposit` | Admin | Confirm cash deposit + unfreeze |
| POST | `/api/payment/rider/cash-limit` | Admin | Set rider's COD limit |
| GET | `/api/payment/rider/wallet/:riderId` | Admin | View any rider wallet |
| GET | `/api/payment/restaurant/wallet/:restaurantId` | Admin | View any restaurant wallet |
| GET | `/api/payment/admin/summary` | Admin | Platform financials |
| POST | `/api/payment/admin/weekly-payout` | Admin | Trigger payout manually |
| GET | `/api/payment/admin/transactions` | Admin | All transactions |
