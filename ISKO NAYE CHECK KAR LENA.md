# Financial Calculation Update — Frontend Integration Guide

> **Update Date:** March 12, 2026
> This document covers **only the financial calculation changes** made during the backend financial audit fix.
> If you previously integrated against the old calculation logic, read this document fully before shipping new frontend builds.

---

## What changed and why

Seven financial calculation bugs were identified and fixed:

1. GST was calculated on `basePrice` only — now uses the full line total (base + variation + add-ons)
2. Admin commission was computed on `basePrice` only — now uses the full line total
3. Restaurant `net earning` was inflated because add-on revenue was never commission-charged
4. `finalPayableToRestaurant` field was storing the wrong value (restaurant net, not customer bill)
5. A new explicit field `restaurantNetEarning` was added to avoid the naming conflict
6. `adminPlatformFeeShare` was hardcoded to `0` — now reflects the actual split
7. Two different rider earning formulas existed (snapshot vs fallback) — unified to snapshot only

---

## 1. GST Calculation — What Changed

### Old (incorrect)
```
GST per item = item.basePrice × qty × gstPercent / 100
```
Variation price and add-on prices were **not taxed**.

### New (correct)
```
unitPrice = basePrice + variation.price + Σ addOns.price
lineTotal = unitPrice × qty
GST per item = lineTotal × gstPercent / 100
```
**Full unit price is now taxed**, including any selected variation and add-ons.

### Frontend impact

| Scenario | Old `gstOnFood` | New `gstOnFood` |
|---|---|---|
| Plain item, no add-ons | Same | Same |
| Item with ₹50 variation | Only base taxed | Full price taxed |
| Item with add-ons | Only base taxed | Full price taxed |

**Action required:** If you hardcoded or assumed `gstOnFood = itemTotal × gstRate / 100` using `basePrice` as the base — update to use `gstOnFood` from the API response directly. Do not recompute it on the frontend.

---

## 2. Admin Commission — What Changed

### Old (incorrect)
```javascript
// Cart item.price = basePrice + variation.price  (no add-ons)
lineTotal = item.price × item.quantity
commission = lineTotal × commissionPercent / 100
```
Add-on revenue was never included in the commission base.

### New (correct)
```javascript
// Cart item.price = basePrice + variation.price + Σ addOns.price  (full unit price)
lineTotal = item.price × item.quantity
commission = lineTotal × commissionPercent / 100
```

### Frontend impact

`order.adminCommission` will be higher for orders with add-ons. If you display commission breakdown on any admin or restaurant dashboard, values will differ from the old system for the same order size.

---

## 3. Restaurant Net Earning — What Changed

### Old (incorrect)
```
restaurantGross = itemTotal + packaging
restaurantNet   = restaurantGross − adminCommission
```
Because `adminCommission` was computed on `basePrice` only, restaurant was receiving a share of add-on revenue without any commission deduction — an unintentional revenue leak.

### New (correct)
```
restaurantEarningAmount (per item) = lineTotal − itemAdminCommission
restaurantEarning (order total)    = Σ restaurantEarningAmount
```
Restaurant earning is now computed item-by-item and summed. Packaging charge is tracked separately and goes to the restaurant in full (packaging is not subject to commission).

### Formula comparison (example)

| Scenario | Old `restaurantEarning` | New `restaurantEarning` |
|---|---|---|
| ₹200 item, 10% commission | ₹180 | ₹180 |
| ₹200 + ₹30 add-on, 10% | ₹212 (wrong — add-on escaped commission) | ₹207 (correct) |

### Frontend impact

`order.restaurantEarning` and `paymentBreakdown.restaurantNetEarning` will have lower values than before for orders with add-ons. Update restaurant earnings dashboards and settlement screens.

---

## 4. `paymentBreakdown` Field Changes

### `finalPayableToRestaurant` — semantics fixed

**Old behaviour (broken):**
`finalPayableToRestaurant` was overwritten in `placeOrder` with `restaurantNet` (what restaurant keeps after commission). This destroyed the settlement calculator's output.

**New behaviour (fixed):**
`finalPayableToRestaurant` now holds the **customer-facing** value — what the customer is paying toward the restaurant's bill component. This is the settlement formula output:

```
finalPayableToRestaurant = restaurantBillTotal − couponDiscount + gstOnDiscount
```

### New fields added

| New field | Description | Use on |
|---|---|---|
| `customerRestaurantBill` | Alias of `finalPayableToRestaurant` — customer-facing bill component | Customer invoice |
| `restaurantNetEarning` | What the restaurant keeps after admin commission deduction | Restaurant earnings dashboard |
| `adminPlatformFeeShare` | Platform fee portion retained by admin (computed, not hardcoded 0) | Admin financial reports |

### Full updated `paymentBreakdown` shape

```jsonc
"paymentBreakdown": {
  // ── Customer-facing bill lines ──────────────────────────────────────
  "itemTotal": 280,                   // Σ (basePrice + variation + addOns) × qty
  "restaurantDiscount": 0,            // Restaurant promotional discount
  "gstOnFood": 14,                    // GST on full line total (inc. variation + add-ons)
  "packagingCharge": 0,               // Packaging fee
  "packagingGST": 0,                  // GST on packaging
  "restaurantBillTotal": 294,         // items + GST + packaging after restaurant discount
  "foodierDiscount": 0,               // Platform coupon discount
  "gstOnDiscount": 0,                 // GST adjustment on coupon
  "finalPayableToRestaurant": 294,    // Customer pays this toward the restaurant bill ✅
  "customerRestaurantBill": 294,      // Same value, explicit alias ✅ (new field)

  // ── Settlement clarity fields ────────────────────────────────────────
  "restaurantGross": 280,             // itemTotal + packaging (audit trail only)
  "restaurantNet": 252,               // Same as restaurantNetEarning (kept for compat)
  "restaurantNetEarning": 252,        // What restaurant actually keeps ✅ (new field)

  // ── Rider earning snapshot ───────────────────────────────────────────
  "riderDeliveryEarning": 15,         // Delivery fee credited to rider
  "riderIncentive": 14,               // Incentive bonus
  "riderPlatformFeeShare": 9,         // Platform fee to rider

  // ── Admin earning snapshot ───────────────────────────────────────────
  "adminPlatformFeeShare": 0,         // Platform fee to admin (computed, not hardcoded) ✅

  "computedVersion": "settlement-v2"
}
```

### 🚨 What to stop using

| Field | Problem | Use instead |
|---|---|---|
| `paymentBreakdown.finalPayableToRestaurant` for restaurant earnings display | Now holds customer-facing value, not restaurant net | `paymentBreakdown.restaurantNetEarning` |
| `paymentBreakdown.restaurantNet` | Ambiguous name, kept only for backward compat | `paymentBreakdown.restaurantNetEarning` |

### Rendering rule

```
Customer invoice / order summary:
  → Show finalPayableToRestaurant (or customerRestaurantBill) for the restaurant bill component

Restaurant earnings / payout dashboard:
  → Show restaurantNetEarning (or order.restaurantEarning)
  → NEVER use finalPayableToRestaurant here
```

---

## 5. Top-Level Order Fields — Deprecated

These fields still exist in the database on old orders and the schema still accepts them. However, **new orders no longer write to them**. Remove them from your frontend display logic.

| Deprecated field | Canonical replacement |
|---|---|
| `order.riderEarning` | `order.riderEarnings.totalRiderEarning` |
| `order.riderIncentive` | `order.riderEarnings.incentive` |
| `order.riderIncentivePercent` | `order.riderEarnings.incentivePercentAtCompletion` |
| `order.restaurantCommission` | `order.restaurantEarning` (this is earnings, not commission) |
| `order.adminCommissionAtOrder` | `order.adminCommission` |

### `order.restaurantEarning` — canonical field

This is now the single source of truth for what the restaurant receives:

```
order.restaurantEarning = Σ order.items[].restaurantEarningAmount
```

Both `order.restaurantEarning` and `paymentBreakdown.restaurantNetEarning` always hold the same value.

---

## 6. Rider Earnings — Unified System

### Old (dual system, broken)

Two formulas existed:
- **System A** (at order creation): `deliveryCharge = customer slab delivery fee` (e.g. ₹15 for 5 km)
- **System B** (fallback at delivery): `deliveryCharge = riderBaseEarning(₹30) + distanceBonus`

The fallback could trigger silently and pay riders 2–4× the expected amount.

### New (single system)

Only System A is used. The snapshot set at order creation time is always used for wallet credit. There is no fallback formula.

```
riderEarnings.deliveryCharge = delivery fee the customer was charged (slab-based)
riderEarnings.platformFee    = full platform fee (e.g. ₹9)
riderEarnings.incentive      = itemTotal × incentivePercent / 100
riderEarnings.totalRiderEarning = deliveryCharge + platformFee + incentive
```

### The `riderEarnings` object on every new order

```jsonc
"riderEarnings": {
  "deliveryCharge": 15,                    // = delivery fee customer paid
  "platformFee": 9,                        // = platform fee customer paid
  "incentive": 14,                         // = itemTotal × 5%
  "totalRiderEarning": 38,                 // credited to rider wallet on delivery
  "incentivePercentAtCompletion": 5,       // snapshot of rate at order time
  "earnedAt": "2026-03-12T..."
}
```

### Frontend impact

- **Rider earnings screen:** Read from `riderEarnings.totalRiderEarning`, not the deprecated `riderEarning`.
- **Rider earnings breakdown:** Use `riderEarnings.deliveryCharge`, `riderEarnings.platformFee`, `riderEarnings.incentive` for per-component display.
- **Tip** is credited separately on top of `totalRiderEarning` — it is not included in the snapshot.

---

## 7. Per-Item Earning Fields on Order Line Items

Each item in `order.items[]` now has accurate per-item financial fields:

```jsonc
{
  "product": "...",
  "name": "Paneer Tikka",
  "quantity": 2,
  "price": 140,                          // full unit price (base + variation + addOns)
  "commissionPercent": 10,
  "adminCommissionAmount": 28,           // = price × qty × commissionPercent / 100
  "restaurantEarningAmount": 252,        // = lineTotal - adminCommissionAmount
  "variation": { "name": "Large", "price": 40 },
  "addOns": [{ "name": "Extra Sauce", "price": 20 }]
}
```

`Σ items[].restaurantEarningAmount` always equals `order.restaurantEarning`.

---

## 8. Numeric Example — Full Order

**Order:** 1× Paneer Tikka (base ₹200) with Large variation (+₹50) and Extra Sauce add-on (+₹30). 5% GST, 10% commission, 5 km delivery, ₹9 platform fee, 5% rider incentive.

| Calculation step | Value |
|---|---|
| `unitPrice` | ₹200 + ₹50 + ₹30 = **₹280** |
| `itemTotal` | ₹280 × 1 qty = **₹280** |
| `gstOnFood` (5% of ₹280) | **₹14** (old value was ₹10 — ₹4 more) |
| `adminCommission` (10% of ₹280) | **₹28** (old value was ₹20 — ₹8 more) |
| `restaurantEarning` (₹280 − ₹28) | **₹252** (old value was ₹260 — ₹8 less) |
| `deliveryFee` (5 km × ₹3) | **₹15** |
| `platformFee` | **₹9** |
| `restaurantBillTotal` (₹280 + ₹14) | **₹294** |
| `customerRestaurantBill` | **₹294** |
| `toPay` (₹294 + ₹15 + ₹9) | **₹318** |
| `riderEarnings.deliveryCharge` | **₹15** |
| `riderEarnings.platformFee` | **₹9** |
| `riderEarnings.incentive` (5% of ₹280) | **₹14** |
| `riderEarnings.totalRiderEarning` | **₹38** |

---

## 9. Summary of Frontend Action Items

| Area | Action |
|---|---|
| Customer order summary / invoice | Use `customerRestaurantBill` for restaurant bill line. Use `gstOnFood` directly from API — do not recompute from base price. |
| Restaurant earnings dashboard | Switch to `paymentBreakdown.restaurantNetEarning` (or `order.restaurantEarning`). Stop reading `paymentBreakdown.finalPayableToRestaurant` for this. |
| Admin commission display | Use `order.adminCommission`. Values will be higher for orders with add-ons. |
| Rider earnings screen | Use `order.riderEarnings.totalRiderEarning` and sub-fields. Remove reads of deprecated `order.riderEarning`. |
| Admin platform fee report | `paymentBreakdown.adminPlatformFeeShare` is now computed correctly. |
| Old orders in history | Deprecated fields (`riderEarning`, `restaurantCommission`, etc.) still exist in DB — safe to read as fallback for old orders, but prefer canonical fields for new ones. |
