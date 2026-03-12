# Foodie Platform — Backend System Explanation

> **Derived entirely from reading the actual backend source code.**
> Models, controllers, and services were analyzed and are referenced by exact file path throughout.

---

## Table of Contents

1. [System Architecture](#1-system-architecture)
2. [Product Flow](#2-product-flow)
3. [Order Lifecycle](#3-order-lifecycle)
4. [Payment System](#4-payment-system)
5. [Billing System](#5-billing-system)
6. [Commission System](#6-commission-system)
7. [Restaurant Earnings](#7-restaurant-earnings)
8. [Rider Assignment](#8-rider-assignment)
9. [Rider Earnings](#9-rider-earnings)
10. [Wallet System](#10-wallet-system)
11. [Settlement & Payout System](#11-settlement--payout-system)
12. [Earning Flow — Master Diagram](#12-earning-flow--master-diagram)
13. [Database Field Mapping](#13-database-field-mapping)
14. [Detected Issues in Current Financial Logic](#14-detected-issues-in-current-financial-logic)

---

## 1. System Architecture

### Stack

| Layer | Technology |
|---|---|
| Runtime | Node.js + Express |
| Database | MongoDB + Mongoose |
| Auth | JWT Bearer tokens (`middleware/authMiddleware.js`) |
| Payment Gateway | Razorpay (primary), Stripe (service exists but not in active order flow) |
| Real-time | Socket.IO via `services/socketService.js` |
| Notifications | Firebase FCM via `utils/notificationService.js` |
| SMS | `services/smsService.js` (OTP delivery) |
| Logging | `utils/logger.js` (structured log files in `logs/`) |
| File Uploads | `utils/upload.js` (Multer, stored in `uploads/`) |
| Background Jobs | `services/cronService.js`, `services/paymentCronJobs.js` |

### User Roles

| Role | `User.role` value | Description |
|---|---|---|
| Customer | `customer` | Places orders, manages wallet |
| Restaurant Owner | `restaurant_owner` | Manages menu, accepts orders |
| Rider | `rider` | Picks up and delivers food |
| Admin | `admin` | Full platform control |

### High-Level Module Map

```
models/                → MongoDB schemas (source of truth for all data)
controllers/           → Business logic per role/entity
routes/                → Express route definitions with auth middleware
services/              → Shared logic: billing, pricing, rider dispatch, earnings
utils/                 → Helpers: formatter, validators, logger, upload
middleware/            → JWT auth, order validation, service availability
```

---

## 2. Product Flow

### 2.1 How Products Are Created

**Route:** `POST /api/menu/add` (protected: `restaurantOwner` role only)  
**Controller:** `controllers/menuController.js → addFoodItem()`

The restaurant owner submits a multipart form. The controller:
1. Resolves the owner's restaurant via `Restaurant.findOne({ owner: userId })`.
2. Validates the restaurant is approved (`restaurantApproved: true`).
3. Validates the category exists in `FoodCategory` (admin-managed list).
4. Creates a `Product` document with `isApproved: false` (pending admin review).

### 2.2 Product Schema Fields (`models/Product.js`)

| Field | Type | Set By | Description |
|---|---|---|---|
| `restaurant` | ObjectId | system | Parent restaurant reference |
| `category` | ObjectId | restaurant | FoodCategory reference |
| `name` | `{ en, de, ar }` | restaurant | Multilingual product name |
| `description` | `{ en, de, ar }` | restaurant | Short description |
| `image` | String | restaurant | Uploaded image URL |
| `basePrice` | Number | restaurant | Base selling price (INR) |
| `quantity` | String | restaurant | Serving size label (e.g. "250ml") |
| `unit` | Enum | restaurant | kg / gram / litre / ml / piece / packet / dozen |
| `hsnCode` | String | restaurant | HSN code for GST compliance |
| `gstPercent` | Enum: 0/5/12/18 | restaurant | GST slab for this item |
| `packagingCharge` | Number | restaurant | Per-item packaging fee (INR) |
| `packagingGstPercent` | Enum: 0/5/12/18 | restaurant | GST on packaging |
| `adminCommissionPercent` | Number (0–100) | admin | Item-level commission override |
| `restaurantCommissionPercent` | Number (0–100) | admin | Restaurant earning % override |
| `restaurantDiscount` | Object | restaurant | Restaurant-set discount (type, value, active) |
| `adminDiscount` | Object | admin | Admin-set promotion discount (type, value, reason, active) |
| `variations` | Array | restaurant | Size/quantity options each with `{ name, quantity, unit, price, stock }` |
| `addOns` | Array | restaurant | Optional extras each with `{ name, price, image }` |
| `available` | Boolean | restaurant | Toggle item on/off in menu |
| `isApproved` | Boolean | system/admin | Whether admin has approved this product |
| `pendingUpdate` | Object | system | Staged changes awaiting admin approval |

### 2.3 Discount System

**Two independent discount fields exist on every product:**

| Discount | Field | Who Sets It | Approval Required |
|---|---|---|---|
| Restaurant Discount | `restaurantDiscount` | Restaurant owner | Yes — goes through `pendingUpdate` |
| Admin Discount | `adminDiscount` | Admin only | No — applied directly |

**Display logic** (`menuController.js → computeDiscountFields()`):
- If **both** are active, the **higher value** wins.
- If only one is active, that one is shown.
- Output fields: `finalDiscount`, `finalDiscountType`, `discountSource`, `discountTag` (e.g. `"10% OFF"`).

### 2.4 Approval Flow

```
Restaurant creates product (isApproved: false)
        ↓
Admin reviews pending products
        ↓
Admin approves → isApproved: true, pendingUpdate cleared
Admin rejects  → isRejected: true, rejectionReason set
        ↓
Approved product appears in customer menu
```

For **already-approved** products, subsequent edits by the restaurant are staged in `pendingUpdate` (name, description, price, variations, addOns, restaurantDiscount). These changes do **not** go live until admin runs an approval action.

**Admin approval routes:**
- `PUT /api/admin/approve-product/:id` → approves a single product's pending changes
- `PUT /api/admin/approve-menu/:restaurantId` → approves all pending product changes for a restaurant

### 2.5 Menu Listing for Customers

**Route:** `GET /api/menu/:restaurantId`  
**Controller:** `menuController.js → getMenu()`

Returns all `isApproved: true, available: true` products for the restaurant. Each product includes the full `computeDiscountFields()` output spread onto the response object.

---

## 3. Order Lifecycle

### 3.1 Complete Status Sequence

| Status | Code | Who Sets It | Explanation |
|---|---|---|---|
| `pending` | 0 | system | Order created, awaiting payment verification (online only) |
| `placed` | 1 | system | Payment confirmed / wallet paid — sent to restaurant |
| `accepted` | 2 | restaurant_owner | Restaurant accepted and will prepare |
| `preparing` | 3 | restaurant_owner | Kitchen actively preparing food |
| `ready` | 4 | restaurant_owner | Food ready, waiting for rider pickup |
| `assigned` | 5 | system (rider) | Rider accepted the delivery request |
| `reached_restaurant` | 6 | rider | Rider physically at restaurant, awaits pickup OTP verification |
| `picked_up` | 7 | system | Rider verified pickup OTP — out for delivery |
| `delivery_arrived` | 8 | rider | Rider at customer's location |
| `delivered` | 9 | system | Rider verified delivery OTP — order completed |
| `cancelled` | — | customer/restaurant/admin | Order cancelled |
| `failed` | — | system | Payment failure |

### 3.2 Order Placement (`placeOrder`)

**Route:** `POST /api/orders/place`  
**Controller:** `controllers/orderController.js → placeOrder()`

Steps:
1. Validate `paymentMethod` is `'wallet'` or `'online'` (COD is not currently supported in this route).
2. Compute full bill via `calculateBill()` → calls `services/priceCalculator.js → calculateOrderPrice()`.
3. **If wallet payment:** Deduct `user.walletBalance`, create `WalletTransaction` (debit), set `paymentStatus = 'paid'`, `status = 'placed'`.
4. **If online payment:** Set `paymentStatus = 'pending'`, `status = 'pending'`. Return early with `requiresPayment: true` and the order ID — frontend must complete Razorpay flow.
5. For each cart item: look up `product.adminCommissionPercent`; fall back to `restaurant.adminCommission` if not set. Calculate per-item `adminCommissionAmount` and `restaurantEarningAmount`.
6. Compute `restaurantGross = itemTotal + packaging`, `restaurantNet = restaurantGross - totalAdminCommission`.
7. Compute `riderEarningsData` at order creation time (snapshot).
8. Create `Order` document with all financial snapshots.
9. Emit Socket.IO events to restaurant and admin.
10. Clear the cart.

### 3.3 Rider OTP Pickup

When the rider reaches the restaurant (`reached_restaurant`), the restaurant shares the **Pickup OTP** (4-digit, 100-minute TTL). The rider submits it via `POST /api/orders/:id/pickup-otp`. After OTP verification, status advances to `picked_up`.

### 3.4 Delivery OTP

When the rider reaches the customer, they present the **Delivery OTP**. The customer or system verifies it, advancing status to `delivered`. At this point:
- `riderEarningsService.creditRiderEarnings(orderId)` is called → credits `RiderWallet`.
- `billingService.generateBills(orderId)` is called → creates `CustomerBill`, `RestaurantBill`, `RiderBill`.

### 3.5 Cancellation Policy

Cancellable by customer when status is `'placed'` or `'accepted'`.

| Status at cancellation | Refund % |
|---|---|
| `placed` / `accepted` | 100% |
| `preparing` | 50% (based on code logic in `customerCancelOrder`) |

Refund is credited to customer's wallet balance immediately (MongoDB session transaction).

---

## 4. Payment System

### 4.1 Supported Payment Methods

| Method | Flow |
|---|---|
| `online` | Razorpay two-step: create order → verify signature |
| `wallet` | Direct deduction from `User.walletBalance` with session transaction |
| `cod` | Order model supports it (field in schema), but the `placeOrder` controller explicitly rejects COD (`Only 'wallet' and 'online' are accepted`) |

### 4.2 Online Payment Flow (Razorpay)

```
Step 1 — Frontend calls:
  POST /api/payment/create-order  { orderId }
  → controller: paymentController.js → createRazorpayOrder()
  → calls getRazorpay().orders.create({ amount in paise, currency: 'INR' })
  → saves razorpayOrderId to order
  → returns { razorpayOrderId, amount, currency, keyId }

Step 2 — User completes Razorpay checkout popup

Step 3 — Frontend calls:
  POST /api/payment/verify-payment  { orderId, razorpayOrderId, razorpayPaymentId, razorpaySignature }
  → controller: paymentController.js → verifyRazorpayPayment()
  → verifies HMAC-SHA256: expectedSig = HMAC(razorpayOrderId|razorpayPaymentId, RAZORPAY_KEY_SECRET)
  → if match: order.paymentStatus = 'paid', order.status = 'placed'
  → emits Socket.IO events to restaurant, customer, admin
  → deletes cart
  → increments coupon usedCount if applicable
```

### 4.3 Webhook Safety Net

**Route:** `POST /api/payment/razorpay-webhook` (raw body, no JSON parsing)  
**Controller:** `paymentController.js → handleRazorpayWebhook()`

The webhook verifies its Razorpay signature, then on `payment.captured`:
- If `notes.type === 'wallet_recharge'` → routes to `handleWebhookWalletRecharge()` → calls `walletController.creditWalletAfterPayment()`.
- Otherwise → routes to `handleWebhookPaymentSuccess()` → advances the order.

This is a **fallback** in case the frontend verify call fails (network issues, app crash).

### 4.4 Payment Status Machine

```
pending → processing → paid
                     → failed
   paid → refunded (on cancellation or admin refund)
   paid → refunding (partial refund in progress)
```

### 4.5 Razorpay Service

`services/razorpayService.js` uses a **lazy-init singleton pattern**:
```js
// Initialized once on first call, not at startup
getRazorpay() → returns Razorpay instance
```
This prevents crashes if `RAZORPAY_KEY_ID` / `RAZORPAY_KEY_SECRET` env vars are missing.

---

## 5. Billing System

### 5.1 Price Calculator (`services/priceCalculator.js`)

All pricing is calculated here before order creation. Settings are loaded from `AdminSetting` (MongoDB singleton).

**Formula Chain:**

```
1. itemTotal = Σ (basePrice + variation.price + addOns.price) × qty

2. gstOnFood  = Σ (item.basePrice × qty) × item.gstPercent / 100
   (per-item slab: 0 / 5 / 12 / 18 %; falls back to AdminSetting.defaultGstPercent)

3. packagingCharge = restaurant.packagingCharge (flat per order)

4. packagingGST = packagingCharge × packagingGstPercent / 100

5. restaurantBillTotal = (itemTotal - restaurantDiscount) + gstOnFood
                        + packagingCharge + packagingGST

6. Coupon/foodierDiscount validated and applied on restaurantBillTotal

7. gstOnDiscount = foodierDiscount × discountGstPercent / 100

8. finalPayableToRestaurant = restaurantBillTotal - foodierDiscount + gstOnDiscount

9. deliveryFee = distance-based slab (from AdminSetting.deliverySlabs):
     0–5 km   → ₹3/km
     5–10 km  → ₹4/km
     >10 km   → ₹6/km
   (Zero if restaurant.isFreeDelivery = true and min threshold met)

10. platformFee = AdminSetting.platformFee (default ₹9, flat per order)

11. smallCartFee = AdminSetting.smallCartFee if itemTotal < AdminSetting.smallCartThreshold
                   (0 = disabled by default)

12. totalAmount = finalPayableToRestaurant + deliveryFee + platformFee + smallCartFee + tip
```

### 5.2 Customer Bill Summary

The exact breakdown stored in `Order.paymentBreakdown` and in `CustomerBill`:

| Component | Source |
|---|---|
| `itemsTotal` | Sum of (price × qty) for all items |
| `restaurantDiscount` | Discount set by restaurant (if active) |
| `platformDiscount` | Coupon / Foodier promotion discount |
| `gstOnFood` | Per-item GST applied on pre-discount base price |
| `packagingCharge` | Flat per-order packaging from restaurant |
| `gstOnPackaging` | GST on packaging charge |
| `platformFee` | Fixed platform fee (default ₹9) |
| `gstOnPlatform` | 18% GST on platform fee (AdminSetting) |
| `deliveryCharge` | Distance-based delivery fee |
| `gstOnDelivery` | 18% GST on delivery (AdminSetting) |
| `tip` | Optional customer tip (no GST) |
| `finalPayableAmount` | What the customer actually paid |

**GST split:** CGST = SGST = totalGST / 2 (standard intrastate Indian GST).

### 5.3 Bill Generation (`services/billingService.js`)

Bills are generated **once** per delivered order — fully idempotent (checks for existing `CustomerBill` before creating). Triggered when order status reaches `delivered`.

Three documents are created in one `Promise.all()`:
- `CustomerBill` (what customer paid)
- `RestaurantBill` (what restaurant earns net of commission)
- `RiderBill` (rider's earnings per delivery)

---

## 6. Commission System

### 6.1 How Commission Is Calculated

Admin commission is calculated at **order placement time** in `controllers/orderController.js → placeOrder()`.

**Per-item calculation:**
```
commissionPercent = product.adminCommissionPercent  
                    ?? restaurant.adminCommission  (fallback, default 10%)

itemAdminCommission = (item.price × item.quantity) × commissionPercent / 100
itemRestaurantEarning = (item.price × item.quantity) - itemAdminCommission
```

**Order total:**
```
order.adminCommission = Σ itemAdminCommission  (across all items)
order.adminCommissionAtOrder = same (audit snapshot)
```

### 6.2 Priority of Commission Rates

```
1. product.adminCommissionPercent  (most specific — item-level override)
      ↓ if null/undefined
2. restaurant.adminCommission      (restaurant-level default, default 10%)
```

### 6.3 Admin Revenue Sources

| Source | Field | How Earned |
|---|---|---|
| Restaurant commission | `order.adminCommission` | % of item total per order |
| Platform fee | `order.platformFee` | Flat per-order fee from customer |
| Pending: delivery fee | — | Currently the full delivery fee is credited to the rider (see § 9) |

**Admin Commission Wallet (`models/AdminCommissionWallet.js`):**  
A singleton document tracking cumulative admin earnings:
- `balance` — current pending commission
- `totalCommission` — all-time earned
- `commissionFromRestaurants` — breakdown field
- `commissionFromDelivery` — breakdown field

---

## 7. Restaurant Earnings

### 7.1 Calculation Formula

```
restaurantGross = order.itemTotal + order.packaging
restaurantNet   = restaurantGross - order.adminCommission
```

GST, delivery fee, and platform fee go to the customer bill but are **not part of restaurant earnings**. Only food + packaging minus commission.

### 7.2 Per-Item Breakdown

Stored on each `order.items[]` entry:

| Field | Value |
|---|---|
| `items[].commissionPercent` | Commission % used for this item |
| `items[].adminCommissionAmount` | Admin's share for this item (INR) |
| `items[].restaurantEarningAmount` | Restaurant's share for this item (INR) |

### 7.3 Where Earnings Are Stored

| Field | Location | Description |
|---|---|---|
| `restaurantEarning` | `Order` (canonical) | Net restaurant earning per order |
| `restaurantCommission` | `Order` (legacy alias) | Same value, kept for backward compat |
| `restaurantNetEarning` | `RestaurantBill` | Formal bill document value |
| `balance` | `RestaurantWallet` | Running available balance |
| `totalEarnings` | `RestaurantWallet` | Cumulative lifetime earnings |
| `pendingAmount` | `RestaurantWallet` | Earnings not yet paid out |

### 7.4 Restaurant Wallet Update

`RestaurantWallet` is updated by:
- `paymentService.js` (commented-out legacy code — see § 14)
- `riderEarningsService.js` does **not** update `RestaurantWallet` — it only handles rider side
- The active path credits restaurant wallet via the settlement flow

### 7.5 Restaurant–Admin Billing Relationship

The `RestaurantBill` document also stores:
- `adminCommissionPercent`, `adminCommissionAmount` — what admin deducted
- `gstOnAdminCommission` — 18% GST that admin charges on its commission (input tax credit for restaurant)

---

## 8. Rider Assignment

### 8.1 Dispatch Flow (`services/riderDispatchService.js`)

Dispatch is triggered when a restaurant accepts an order (status → `accepted`).

```
findAndNotifyRider(orderId)
  ↓
Query: Rider.find({ isOnline: true, isAvailable: true, verificationStatus: 'approved' })
       excluding already-notified rider IDs (from previous RideRequest records)
  ↓
For each eligible rider:
  - Create RideRequest document (status: 'pending', auto-expires in 15 minutes)
  - Emit Socket.IO event: 'rider:new_order_request' with earnings, distances, ETA
  - Send FCM push notification
  ↓
If no rider accepts within 45 seconds → checkBatchTimeout()
  - Mark pending RideRequests as 'timeout'
  - Re-call findAndNotifyRider() recursively (next batch)
```

**Note:** There is **no distance filter**. All online/available/approved riders receive the request simultaneously.

### 8.2 Rider Accepts (`handleRiderResponse`)

```
Rider calls: POST /api/rides/respond  { requestId, action: 'accepted' }
  ↓
Validates:
  - RideRequest is still 'pending' (not timed out)
  - Rider has no existing active order (prevents double-assignment)
  - Order.rider is still null (first-come-first-served with session lock)
  ↓
If valid:
  - order.rider = rider._id
  - order.status = 'assigned'
  - rider.isAvailable = false
  - All other pending RideRequests for this order → status: 'rejected'
  ↓
Emit Socket.IO events to restaurant, customer, admin
```

### 8.3 Rider Notification Status Fields

The `Order.riderNotificationStatus` object tracks:

| Field | Description |
|---|---|
| `notified` | Whether at least one dispatch batch was sent |
| `notifiedAt` | Timestamp of first dispatch |
| `notifiedRiders[]` | Array of `{ riderId, notifiedAt, status }` — one entry per rider notified |
| `acceptedBy` | Rider who accepted |

### 8.4 Rider Status Controls

| Event | Rider State Change |
|---|---|
| Rider accepts order | `isAvailable = false` |
| Order delivered | `isAvailable = true` |
| Customer cancels order | `isAvailable = true` (if rider was assigned) |

---

## 9. Rider Earnings

### 9.1 Earnings Components

Rider earnings have **three components**, calculated in `services/riderEarningsService.js`:

| Component | Formula | Default Config |
|---|---|---|
| **Delivery Charge** | `baseEarning + distanceBonus` | Base: ₹30, per km beyond 3 km: ₹5/km |
| **Platform Fee Credit** | `order.platformFee × 100%` | Full platform fee goes to rider |
| **Incentive** | `order.itemTotal × incentivePercent / 100` | Default 5% |

**Delivery Charge Detail:**
```
deliveryCharge = riderBaseEarningPerDelivery
               + max(0, deliveryDistanceKm - riderBaseDistanceKm) × riderPerKmRate

Example:
  baseEarning = ₹30, base distance = 3 km, perKm = ₹5, actual distance = 8 km
  distanceBonus = (8 - 3) × 5 = ₹25
  deliveryCharge = 30 + 25 = ₹55
```

**Total:**
```
totalRiderEarning = deliveryCharge + platformFee + incentive
```

### 9.2 Dual Calculation Paths (Important!)

The rider earnings are calculated in **two places**:

| Where | When | Purpose |
|---|---|---|
| `orderController.js → placeOrder()` | At order creation | Snapshot stored in `order.riderEarnings` |
| `riderEarningsService.js → creditRiderEarnings()` | At delivery completion | Recalculated from current admin settings, used to credit wallet |

> ⚠️ See § 14 for the inconsistency this creates.

### 9.3 Earnings Storage

| Field | Location | Description |
|---|---|---|
| `riderEarnings.deliveryCharge` | `Order` | Delivery charge component |
| `riderEarnings.platformFee` | `Order` | Platform fee share |
| `riderEarnings.incentive` | `Order` | Incentive bonus |
| `riderEarnings.incentivePercentAtCompletion` | `Order` | Snapshot of % used |
| `riderEarnings.totalRiderEarning` | `Order` | Sum total |
| `riderEarnings.earnedAt` | `Order` | Timestamp of crediting |
| `riderEarning` | `Order` (legacy) | Same as `totalRiderEarning` |
| `riderTotalEarning` | `RiderBill` | Formal per-order bill |
| `availableBalance` | `RiderWallet` | Running available balance |
| `totalEarnings` | `RiderWallet` | Lifetime earnings |

### 9.4 COD Rider Cash Handling

For COD orders, when delivered:
- `riderWallet.cashInHand += order.totalAmount` — rider holds the customer's cash
- If `cashInHand >= cashLimit` (default ₹2000): `riderWallet.isFrozen = true`
- Rider must physically deposit cash to admin and have the admin call the deposit endpoint to unfreeze

---

## 10. Wallet System

### 10.1 Customer Wallet

**Storage:** `User.walletBalance` (Number, INR)  
**History:** `WalletTransaction` documents (linked by `user` field)

**Transaction Sources:**

| Source | Type | Trigger |
|---|---|---|
| `recharge` | credit | After Razorpay wallet top-up verified |
| `order_payment` | debit | When order is paid via wallet |
| `refund` | credit | On order cancellation or admin refund |
| `admin_credit` | credit | Admin manually tops up user wallet |
| `admin_debit` | debit | Admin manually deducts from user wallet |
| `payout` | debit | User withdrawal |

#### Wallet Recharge Flow (Razorpay)

```
Step 1 — POST /api/wallet/create-recharge-order  { amount }
  → walletController.js → createWalletRechargeOrder()
  → Creates Razorpay order (notes.type = 'wallet_recharge')
  → Creates WalletRechargeOrder document (credited: false)
  → Returns { razorpayOrderId, amount (paise), currency, keyId }

Step 2 — User completes Razorpay checkout

Step 3 — POST /api/wallet/verify-payment  { razorpay_order_id, razorpay_payment_id, razorpay_signature }
  → walletController.js → verifyWalletRechargePayment()
  → Verifies HMAC-SHA256 signature
  → Calls creditWalletAfterPayment(rechargeOrder, paymentId)
  → creditWalletAfterPayment() is IDEMPOTENT: if rechargeOrder.credited === true, exits silently
  → user.walletBalance += amount
  → Creates WalletTransaction { source: 'recharge', type: 'credit' }
  → Sets rechargeOrder.credited = true (prevents double-credit)
```

#### Wallet Order Payment Flow

```
placeOrder() with paymentMethod = 'wallet':
  1. Check user.walletBalance >= totalAmount
  2. Start MongoDB session (atomic transaction)
  3. user.walletBalance -= totalAmount
  4. WalletTransaction.create({ type: 'debit', source: 'order_payment', ... })
  5. Commit session
  6. Order.paymentStatus = 'paid', status = 'placed'
```

**Idempotency Guard:** `WalletRechargeOrder.credited` boolean + `WalletTransaction.razorpayPaymentId` sparse unique index prevent double-crediting.

### 10.2 Rider Wallet

**Model:** `models/RiderWallet.js`

| Field | Description |
|---|---|
| `availableBalance` | Earned but not yet withdrawn |
| `totalEarnings` | Lifetime total credited |
| `cashInHand` | COD cash collected but not deposited to admin |
| `cashLimit` | Freeze threshold (default ₹2000) |
| `isFrozen` | True when cashInHand >= cashLimit |
| `totalPayouts` | Total paid out |

**Freeze mechanism:** `RiderWallet.checkAndFreeze()` method — auto-freezes when COD cash exceeds limit.  
**Unfreeze:** `RiderWallet.depositCash(amount)` method — reduces cashInHand; clears frozen state if cashInHand < cashLimit.

### 10.3 Restaurant Wallet

**Model:** `models/RestaurantWallet.js`

| Field | Description |
|---|---|
| `balance` | Available payout balance |
| `totalEarnings` | Cumulative earnings received |
| `totalPaidOut` | Total paid out (settlements) |
| `pendingAmount` | Earnings awaiting settlement |
| `nextPayoutDate` | Next scheduled payout (Sunday) |

### 10.4 Admin Commission Wallet

**Model:** `models/AdminCommissionWallet.js` (singleton via `.getInstance()`)

| Field | Description |
|---|---|
| `balance` | Pending commission to collect |
| `totalCommission` | All-time earned |
| `commissionFromRestaurants` | Breakdown: from food orders |
| `commissionFromDelivery` | Breakdown: from delivery |

---

## 11. Settlement & Payout System

### 11.1 Settlement Ledger (`models/SettlementLedger.js`)

Created per delivered order. Tracks what the restaurant is owed.

**Creation via static method `SettlementLedger.createFromOrder(order, restaurant)`:**
```
commissionPercent = restaurant.commissionRate || 15%   (⚠️ uses 'commissionRate', not 'adminCommission')
baseAmount        = order.totalAmount - tip
platformCommission = baseAmount × commissionPercent / 100
restaurantEarning  = baseAmount - platformCommission - deliveryFee
```

**Statuses:** `pending → processing → completed → failed → disputed`

**Bulk settlement:** `SettlementLedger.processBulkSettlement()` updates multiple records at once with `batchId`, `settledAt`, `settlementMethod`, `externalReference`.

### 11.2 Payout Model (`models/Payout.js`)

Generic payout record for both riders and restaurants.

| Field | Description |
|---|---|
| `rider` / `restaurant` | Target entity |
| `amount` | Payout amount |
| `status` | pending → processing → completed → failed → cancelled |
| `paymentMethod` | bank_transfer / upi / cash / wallet |
| `referenceNumber` | Bank/UPI transaction reference |
| `processedBy` | Admin who initiated it |

### 11.3 Withdrawal Requests (`models/WithdrawalRequest.js`)

Users can request wallet withdrawals. Fields: `user`, `amount`, `method` (bank/upi/manual), `bankDetails`, `status` (pending → approved → rejected → processed), `adminNote`, `processedAt`.

### 11.4 Refund System (`services/refundService.js`)

**Cancellation Refund Flow:**
1. Look for a `WalletTransaction` debit linked to the order.
2. If found (wallet payment) → immediately credit wallet back.
3. If not found (online payment) → set `refund.status = 'in_progress'` for manual admin processing via gateway.

**Refund states on `Order.refund`:** `none → in_progress → completed`  
**Payment status after refund:** `paid → refunded`

---

## 12. Earning Flow — Master Diagram

```
CUSTOMER PAYS ORDER
         │
         ▼
  paymentMethod = 'wallet'    paymentMethod = 'online'
         │                            │
  Debit walletBalance          Razorpay checkout
  in session transaction             │
         │              POST /payment/verify-payment
         │               HMAC-SHA256 signature check
         │                            │
         └──────── order.paymentStatus = 'paid' ──────────────────────┐
                         order.status = 'placed'                       │
                                 │                                     │
                FOR EACH ITEM AT ORDER CREATION:                        │
                commissionPercent = product.adminCommissionPercent      │
                                    ?? restaurant.adminCommission       │
                item.adminCommissionAmount  = lineTotal × commissionPct │
                item.restaurantEarningAmount = lineTotal - adminCommAmt │
                                 │
                order.adminCommission    = Σ item.adminCommissionAmount
                order.restaurantEarning  = (itemTotal + packaging) - adminCommission
                order.riderEarnings      = { deliveryCharge, platformFee, incentive, total }
                                 │
                         RESTAURANT ACCEPTS
                         FOOD PREPARED → READY
                                 │
                         RIDER ASSIGNED (RideRequest accepted)
                         RIDER PICKS UP (Pickup OTP verified)
                                 │
                    ─── ORDER DELIVERED (Delivery OTP verified) ───
                                 │
                                 ▼
               riderEarningsService.creditRiderEarnings(orderId)
                  ├── recalculates earnings from current AdminSetting
                  ├── riderWallet.totalEarnings += totalRiderEarning
                  ├── riderWallet.availableBalance += totalRiderEarning
                  ├── if COD: riderWallet.cashInHand += order.totalAmount
                  ├── checkAndFreeze() if cashInHand >= cashLimit
                  └── creates PaymentTransaction (type: 'rider_earning_credit')
                                 │
               billingService.generateBills(orderId)
                  ├── CustomerBill (receipt for customer)
                  ├── RestaurantBill (net earnings statement)
                  └── RiderBill (earnings breakdown)
                                 │
                         RESTAURANT WALLET
               RestaurantWallet.balance += restaurantNetEarning
               RestaurantWallet.totalEarnings += restaurantNetEarning
               RestaurantWallet.pendingAmount += restaurantNetEarning
                                 │
                    ───── ADMIN PROCESSES SETTLEMENT ─────
               SettlementLedger → status: 'completed'
               Payout record created for restaurant
               RestaurantWallet.balance -= payoutAmount
               RestaurantWallet.totalPaidOut += payoutAmount
```

---

## 13. Database Field Mapping

### Financial Fields — Order Level

| Financial Value | Field | Model |
|---|---|---|
| Item subtotal (before discount/GST) | `order.itemTotal` | `Order` |
| GST on food | `order.tax` | `Order` |
| Packaging charge | `order.packaging` | `Order` |
| Delivery fee charged to customer | `order.deliveryFee` | `Order` |
| Platform fee charged to customer | `order.platformFee` | `Order` |
| Coupon/promo discount | `order.discount` | `Order` |
| Customer tip | `order.tip` | `Order` |
| Total charged to customer | `order.totalAmount` | `Order` |
| Admin commission (total order) | `order.adminCommission` | `Order` |
| Admin commission snapshot | `order.adminCommissionAtOrder` | `Order` |
| Restaurant net earning | `order.restaurantEarning` | `Order` (canonical) |
| Restaurant net earning (legacy) | `order.restaurantCommission` | `Order` (backward compat) |
| Rider total earning | `order.riderEarnings.totalRiderEarning` | `Order` (canonical) |
| Rider total earning (legacy) | `order.riderEarning` | `Order` (backward compat) |
| Rider incentive amount | `order.riderEarnings.incentive` | `Order` |
| Rider delivery charge | `order.riderEarnings.deliveryCharge` | `Order` |
| Rider platform fee share | `order.riderEarnings.platformFee` | `Order` |

### Financial Fields — Per Item

| Financial Value | Field | Model |
|---|---|---|
| Commission % applied to item | `items[].commissionPercent` | `Order` |
| Admin's cut per item | `items[].adminCommissionAmount` | `Order` |
| Restaurant's earning per item | `items[].restaurantEarningAmount` | `Order` |

### Financial Fields — Settlement Breakdown

| Financial Value | Field | Model |
|---|---|---|
| Item total | `paymentBreakdown.itemTotal` | `Order` |
| Restaurant discount | `paymentBreakdown.restaurantDiscount` | `Order` |
| GST on food | `paymentBreakdown.gstOnFood` | `Order` |
| Packaging charge | `paymentBreakdown.packagingCharge` | `Order` |
| Packaging GST | `paymentBreakdown.packagingGST` | `Order` |
| Foodier/coupon discount | `paymentBreakdown.foodierDiscount` | `Order` |
| Restaurant gross (items+pkg) | `paymentBreakdown.restaurantGross` | `Order` |
| Restaurant net | `paymentBreakdown.restaurantNet` | `Order` |
| Rider delivery earning | `paymentBreakdown.riderDeliveryEarning` | `Order` |
| Rider incentive | `paymentBreakdown.riderIncentive` | `Order` |
| Rider platform fee share | `paymentBreakdown.riderPlatformFeeShare` | `Order` |

### Financial Fields — Wallet Entities

| Financial Value | Field | Model |
|---|---|---|
| Customer wallet balance | `walletBalance` | `User` |
| Customer transaction history | (separate documents) | `WalletTransaction` |
| Rider available balance | `availableBalance` | `RiderWallet` |
| Rider COD cash in hand | `cashInHand` | `RiderWallet` |
| Restaurant available balance | `balance` | `RestaurantWallet` |
| Restaurant pending amount | `pendingAmount` | `RestaurantWallet` |
| Admin commission balance | `balance` | `AdminCommissionWallet` |

### Financial Fields — Bills

| Financial Value | Field | Model |
|---|---|---|
| What customer paid total | `finalPayableAmount` | `CustomerBill` |
| What restaurant earns | `restaurantNetEarning` | `RestaurantBill` |
| Commission admin charged | `adminCommissionAmount` | `RestaurantBill` |
| What rider earns total | `riderTotalEarning` | `RiderBill` |
| Rider incentive (bill) | `incentive` | `RiderBill` |
| Rider delivery charge (bill) | `deliveryCharge` | `RiderBill` |

---

## 14. Detected Issues in Current Financial Logic

### Issue 1 — `WalletTransaction` missing `source` field for order_payment debits

**Location:** `controllers/orderController.js → placeOrder()`, wallet debit block

```js
// ❌ Current code (missing 'source' field):
await WalletTransaction.create([{
  user: user._id,
  amount: -totalPayment,
  type: "debit",
  description: `Payment for Order`,
}], { session });
```

The `WalletTransaction` model now requires `source` (added in this session). The `placeOrder` wallet debit does **not** pass `source: 'order_payment'`, which will cause a Mongoose validation error when wallet orders are placed.

**Fix required:** Add `source: 'order_payment'` to this wallet transaction call.

---

### Issue 2 — Dual Calculation of Rider Earnings (Snapshot vs. Live)

**Locations:**
1. `controllers/orderController.js → placeOrder()` — calculates `riderEarningsData` and stores it in `order.riderEarnings`.
2. `services/riderEarningsService.js → creditRiderEarnings()` — **recalculates** from `AdminSetting` at delivery time and uses the new values to credit the wallet.

**Problem:** If an admin changes `riderBaseEarningPerDelivery`, `riderPerKmRate`, or `riderIncentivePercent` between order placement and delivery, the rider is **paid the new rate**, not the rate that was shown when the order was created. The snapshot in `order.riderEarnings` is therefore only an audit record — it is not what gets paid.

**Impact:** Minor financial inconsistency. Could surprise riders.

---

### Issue 3 — `paymentService.js` Is Fully Commented Out

**Location:** `services/paymentService.js`

The entire file is commented out. This means:
- `RestaurantWallet` is **not reliably updated** on delivery. The active code path for updating `RestaurantWallet.balance` and `RestaurantWallet.totalEarnings` is unclear.
- `billingService.generateBills()` creates bill documents but does not update wallet balances.
- The `SettlementLedger.createFromOrder()` method uses `restaurant.commissionRate || 15` but the `Restaurant` model has `adminCommission` (not `commissionRate`), meaning it **always falls back to 15%** regardless of the restaurant's actual commission setting.

---

### Issue 4 — `SettlementLedger.createFromOrder()` Uses Wrong Field Name

**Location:** `models/SettlementLedger.js → static createFromOrder()`

```js
// ❌ Uses 'commissionRate' — this field does not exist on Restaurant model
const commissionPercent = restaurant.commissionRate || 15;
```

The `Restaurant` model stores commission as `adminCommission` (default 10%). The settlement ledger always falls back to 15%, overcharging restaurants that have a lower rate set.

**Fix required:**
```js
const commissionPercent = restaurant.adminCommission || 15;
```

---

### Issue 5 — `order.riderEarnings.platformFee` in `orderController` but Different Formula in `riderEarningsService`

**Location:**
- `orderController.js`: `riderPlatformFeeShare = bill.platformFee` (100% of platform fee to rider)
- `riderEarningsService.js → calculateRiderEarnings()`: calls `calculatePlatformFeeShare(order.platformFee)` which also returns 100%

These match currently but the comment in `riderEarningsService` says "Can be changed to 50% split". If modified in one place, the other won't reflect it.

---

### Issue 6 — COD Not Supported in `placeOrder` but Schema Allows It

**Location:** `controllers/orderController.js → placeOrder()`

```js
if (!['wallet', 'online'].includes(paymentMethod)) {
  return sendError(res, 400, "Invalid paymentMethod. Only 'wallet' and 'online' are accepted.");
}
```

The `Order` model `paymentMethod` enum includes `'cod'`. The commented-out `paymentService.js` has `processCODDelivery()`. COD is partially implemented but blocked at the API level.

---

### Issue 7 — Restaurant Wallet Not Updated by Active Code Path

The flow from `order delivered → restaurant wallet credited` has no active implementation:
- `paymentService.js` (which did this) is entirely commented out.
- `billingService.generateBills()` creates `RestaurantBill` but does not update `RestaurantWallet`.
- `riderEarningsService.creditRiderEarnings()` credits rider wallet only.

**Result:** `RestaurantWallet.balance` and `RestaurantWallet.pendingAmount` are never updated during the normal order lifecycle. The settlement ledger is created but the wallet balance stays at zero unless admin manually processes settlements.

---

*Document generated March 12, 2026. Based on source code analysis of `G:\FOODIE\Backend`.*
