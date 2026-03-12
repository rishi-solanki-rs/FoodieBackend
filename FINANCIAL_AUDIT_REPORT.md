# Financial System Audit Report — Foodie Backend

> **Date:** March 12, 2026
> **Scope:** Full read-only analysis of billing, commission, restaurant earnings, and rider earnings calculations.
> **No code was changed** — this is a diagnostic report only.

---

## STEP 1 — Product Listing Fields

Fields set by **restaurant** when listing a product (`models/Product.js`):

| Field | Type | Description |
|---|---|---|
| `basePrice` | Number (required) | Selling price before add-ons/variations |
| `gstPercent` | enum [0, 5, 12, 18], default 5 | GST slab for the item |
| `packagingCharge` | Number, default 0 | Flat per-item packaging fee |
| `packagingGstPercent` | enum [0, 5, 12, 18], default 0 | GST on packaging charge |
| `restaurantDiscount` | `{type: percent/flat, value, active}` | Restaurant-funded promotional discount |
| `adminCommissionPercent` | Number (nullable) | Per-item commission override; null = use restaurant-level default |
| `restaurantCommissionPercent` | Number (nullable) | Per-item restaurant earning override (defined but **unused** in calculations) |
| `quantity` | String | Serving size label, e.g. `"250ml"` |
| `unit` | enum [kg, gram, litre, ml, piece, packet, dozen] | Unit of measurement |
| `variations` | `[{name, quantity, unit, price, stock}]` | `price` is **additive** to `basePrice` |
| `addOns` | `[{name, price}]` | `price` is **additive** to `basePrice` |
| `hsnCode` | String | Tax compliance classification code |

Fields settable only by **admin**:
- `adminDiscount` — `{type, value, reason, active}` — platform-funded coupon
- `isApproved` / `isRejected` — product approval workflow gate

---

## STEP 2 — Order Billing Formulas (`services/priceCalculator.js`)

### Item Price Assembly

```
unitPrice  = item.basePrice + variation.price + Σ(addOn.price)
lineTotal  = unitPrice × qty
itemTotal  = Σ lineTotal  (all items combined)
```

### GST Calculation ⚠️

```
gstPerItem = item.price × qty × (item.gstPercent / 100)   ← uses base price only
gstTotal   = Σ gstPerItem
effectiveGstBlendedPercent = (gstTotal / itemTotal) × 100  ← back-calculated blended rate
```

> **Note:** `item.price` in the cart = `basePrice` only. GST is **not** computed on variation or add-on revenue. See Mismatch #1.

### Settlement Breakdown (`services/settlementCalculator.js`)

```
gstOnFood               = (itemTotal − restaurantDiscount) × effectiveGstBlendedPercent / 100
packagingGST            = packagingCharge × packagingGstPercent / 100
restaurantBillTotal     = (itemTotal − restaurantDiscount) + gstOnFood + packagingCharge + packagingGST
finalPayableToRestaurant = restaurantBillTotal − foodierDiscount + gstOnDiscount
totalAmount             = finalPayableToRestaurant + deliveryFee + platformFee + smallCartFee + tip
```

### Delivery Fee Slabs (from `AdminSetting`)

| Distance | Rate |
|---|---|
| 0 – 5 km | km × ₹3/km |
| 5 – 10 km | (5×3) + (remaining km × ₹4/km) |
| > 10 km | (5×3) + (5×4) + (remaining km × ₹6/km) |

**Platform fee:** flat value from `AdminSetting`, default ₹9 — applied regardless of distance.

---

## STEP 3 — Admin Commission Calculation (`controllers/orderController.js`)

```javascript
// Per cart item:
lineTotal            = item.price × item.quantity      // item.price = basePrice only (no variation, no add-ons)

commissionPercent    = product.adminCommissionPercent  // product-level override if set
                    ?? restaurant.adminCommission       // fallback to restaurant-level rate

itemAdminCommission  = lineTotal × (commissionPercent / 100)
adminCommission      = Σ itemAdminCommission            // order total
```

> **Commission base = `basePrice × qty` only.** Variation price and add-on prices are excluded from the commission base entirely.

---

## STEP 4 — Restaurant Earnings Calculation

```javascript
// Per item (stored on order.items[]):
itemRestaurantEarning = lineTotal − itemAdminCommission
  // lineTotal = item.price × qty = basePrice × qty  (no add-ons, no variations)

// Order level:
restaurantGross = bill.itemTotal + bill.packaging
  // bill.itemTotal = Σ (basePrice + variation.price + addOns.price) × qty  — includes add-on revenue

restaurantNet   = restaurantGross − adminCommission
  // adminCommission was computed on basePrice only

// Stored as:
order.restaurantEarning               = restaurantNet
order.restaurantCommission            = restaurantNet  (legacy duplicate)
order.paymentBreakdown.restaurantNet  = restaurantNet
order.paymentBreakdown.finalPayableToRestaurant = restaurantNet  ← overwrites settlement formula value
```

> **Important:** `Σ items[].restaurantEarningAmount` ≠ `order.restaurantEarning` because item-level uses `basePrice × qty` but order-level uses `bill.itemTotal` which includes variation and add-on revenue.

---

## STEP 5 — Rider Earnings — Two Parallel Systems

### System A — Snapshot at Order Creation (`controllers/orderController.js`)

```javascript
riderDeliveryCharge     = bill.deliveryFee           // slab-based fee collected from customer
riderPlatformFeeShare   = bill.platformFee           // full platform fee (e.g. ₹9)
riderIncentiveAmount    = bill.itemTotal × incentivePercent / 100  // % of item subtotal
totalRiderEarning       = deliveryCharge + platformFee + incentive

// Stored as snapshot:
order.riderEarnings = { deliveryCharge, platformFee, incentive, totalRiderEarning, incentivePercentAtCompletion }
order.riderEarning  = totalRiderEarning  (legacy)
```

### System B — Recalculation Fallback at Delivery (`services/riderEarningsService.js`)

```javascript
baseDeliveryCharge    = adminSettings.riderBaseEarningPerDelivery   // default ₹30
distanceBonus         = (distanceKm − riderBaseDistanceKm) × riderPerKmRate
totalDeliveryCharge   = baseDeliveryCharge + distanceBonus           // e.g. ₹30 + bonus

platformFeeShare      = order.platformFee   // same as System A
incentive             = itemTotal × incentivePercent / 100           // same as System A

totalRiderEarning     = totalDeliveryCharge + platformFeeShare + incentive
```

### Which System Gets Used at Wallet Credit

```javascript
if (order.riderEarnings && order.riderEarnings.totalRiderEarning > 0) {
  // → USE SNAPSHOT (System A) — normal path
} else {
  // → FALLBACK to System B — recalculates with a different delivery formula
}
```

**Example divergence for a 5 km order:**

| System | Delivery component | Example total |
|---|---|---|
| A (snapshot) | ₹5×3 = ₹15 (customer slab rate) | ₹15 + ₹9 + incentive |
| B (fallback) | ₹30 base + distance bonus | ₹30+ + ₹9 + incentive |

---

## STEP 6 — Payment Breakdown Fields (`order.paymentBreakdown`)

| Field | What It Stores |
|---|---|
| `itemTotal` | Σ (basePrice + variation + addOns) × qty — full customer price |
| `restaurantDiscount` | Restaurant-funded promotional discount |
| `gstOnFood` | GST on (itemTotal − restaurantDiscount) |
| `packagingCharge` | Restaurant packaging fee |
| `packagingGST` | GST on packagingCharge |
| `restaurantBillTotal` | Items + GST + packaging (before platform/delivery fees) |
| `foodierDiscount` | Platform coupon discount |
| `gstOnDiscount` | GST adjustment on coupon |
| `finalPayableToRestaurant` | **OVERWRITTEN** to `restaurantNet` — NOT the settlement formula result |
| `restaurantGross` | `itemTotal + packaging` |
| `restaurantNet` | `restaurantGross − adminCommission` |
| `riderDeliveryEarning` | = `riderEarnings.deliveryCharge` |
| `riderIncentive` | = `riderEarnings.incentive` |
| `riderPlatformFeeShare` | Full platform fee → rider |
| `adminPlatformFeeShare` | **Always hardcoded to `0`** |
| `computedVersion` | `"settlement-v2"` |

---

## STEP 7 — Complete Money Flow

```
Customer pays: totalAmount
  = itemTotal
  + gstOnFood
  + packagingCharge + packagingGST
  − restaurantDiscount − foodierDiscount + gstOnDiscount
  + deliveryFee
  + platformFee
  + tip (optional)

This flows to:
  → Restaurant receives:  restaurantNet = (itemTotal + packaging) − adminCommission
  → Rider receives:       riderEarnings.totalRiderEarning + tip (at delivery)
                          = deliveryFee + platformFee + incentive
  → Admin collects:       adminCommission (deducted from restaurant's revenue)
                        + adminPlatformFeeShare (recorded as ₹0 despite full platformFee going to rider)
                        + coupons/discounts absorbed by platform budget

Wallet credit triggers:
  Order delivered → creditRiderEarnings() → rider wallet += totalRiderEarning + tip
  Order delivered → restaurant settlement (separate flow, not inline in order)
```

---

## STEP 8 — Detected Mismatches

### 🔴 Mismatch 1 — GST calculated on base price only, not full line total

**File:** `services/priceCalculator.js`

```javascript
// BUG: GST uses item.price (base only)
gstTotal += (item.price * qty) * (gstPercent / 100);

// BUT itemTotal includes variation + add-on prices:
itemTotal += (item.price + variation.price + addOnTotal) * qty;
```

**Effect:** Customer is charged GST only on `basePrice`. The variation price mark-up and add-on mark-up revenue are sold to the customer **tax-free**. GST collected is understated whenever items have variations or add-ons selected.

---

### 🔴 Mismatch 2 — Admin commission excludes variation price and add-on revenue

**File:** `controllers/orderController.js`

```javascript
lineTotal = item.price × item.quantity;   // item.price = basePrice, no variation, no add-ons
itemAdminCommission = lineTotal × (commissionPercent / 100);
```

The `bill.itemTotal` used for restaurant gross includes variation and add-on prices, but `adminCommission` is computed only on `basePrice`. Any money from variations or add-ons is 100% restaurant revenue with zero platform cut.

---

### 🔴 Mismatch 3 — Restaurant net earning is inflated (consequence of Mismatch 2)

```javascript
restaurantGross = bill.itemTotal + packaging;   // includes variation + add-on revenue
restaurantNet   = restaurantGross − adminCommission;  // commission ignores variation/add-on revenue
```

Restaurant effectively earns 100% margin on all variation and add-on revenue regardless of the commission rate configured.

---

### 🔴 Mismatch 4 — Two completely different rider delivery charge formulas

**Normal path (System A):** rider delivery earning = customer-facing slab delivery fee
**Fallback path (System B):** rider delivery earning = `riderBaseEarning(₹30) + distanceBonus`

The two can differ by 2×–4× for the same order. System B is significantly more generous. Since the fallback is only triggered when the snapshot is missing (`totalRiderEarning == 0`), it is a silent inconsistency that would activate if orders were created before the snapshot logic existed, or if the `riderEarnings` field is somehow cleared.

With System A (normal path), the rider receives exactly what the customer paid for delivery — leaving admin with **zero** delivery fee margin.

---

### 🔴 Mismatch 5 — `finalPayableToRestaurant` field has a naming/value conflict

In `placeOrder`, the settlement calculator's output is spread first, then overwritten:

```javascript
paymentBreakdown: {
  ...bill.paymentBreakdown,               // settlement formula: restaurantBillTotal − discount + gstOnDiscount
  finalPayableToRestaurant: restaurantNet, // OVERWRITES with: (itemTotal + packaging) − adminCommission
}
```

- **Settlement formula definition:** what the customer is paying toward the restaurant's bill component
- **Overwritten definition:** what the restaurant actually keeps after admin commission deduction

These are conceptually different quantities. The first is a customer-side figure; the second is a restaurant-side figure. Using the same field name for both destroys the settlement formula's output.

---

### 🟡 Mismatch 6 — `adminPlatformFeeShare` is always `0`

```javascript
adminPlatformFeeShare: 0,               // hardcoded
riderPlatformFeeShare: full platformFee, // rider takes 100%
```

The admin collects `platformFee` from the customer but the `paymentBreakdown` records admin receiving ₹0 of it. The audit trail does not reflect that `platformFee` goes to the rider under the current design intent.

---

### 🟡 Mismatch 7 — Item-level earnings sum ≠ order-level restaurant earning

```
Σ items[].restaurantEarningAmount
  = Σ (basePrice × qty × (1 − commissionPercent/100))
  ← base price only

order.restaurantEarning
  = (itemTotal_incl_variations_and_addons + packaging) − adminCommission
  ← full bill itemTotal
```

These two numbers represent the same thing from different calculation paths and will diverge whenever any item has a variation selected or any add-on is applied.

---

## STEP 9 — Field Consistency / Duplicate Fields

| Field | Duplicate Of | Status |
|---|---|---|
| `order.riderEarning` | `order.riderEarnings.totalRiderEarning` | Exact duplicate (legacy compat) |
| `order.riderIncentive` | `order.riderEarnings.incentive` | Exact duplicate (legacy compat) |
| `order.riderIncentivePercent` | `order.riderEarnings.incentivePercentAtCompletion` | Exact duplicate (legacy compat) |
| `order.restaurantCommission` | `order.restaurantEarning` | Exact duplicate (misleading name — stores earning, not commission) |
| `order.adminCommissionAtOrder` | `order.adminCommission` | Exact duplicate, same value set at same time |
| `paymentBreakdown.restaurantNet` | `order.restaurantEarning` | Same value, redundant |
| `paymentBreakdown.finalPayableToRestaurant` | Overwrites settlement formula | **CONFLICT — two different formulas, same field** |
| `items[].restaurantEarningAmount` (sum) | `order.restaurantEarning` | **MISMATCH — different calculation bases** |

---

## STEP 10 — Summary Table

| Area | Status | Severity |
|---|---|---|
| GST on variations/add-ons | Not collected — base price only | 🔴 High |
| Admin commission on variations | Not collected — base price only | 🔴 High |
| Admin commission on add-ons | Not collected at all | 🔴 High |
| Restaurant earnings inflation | Earns 100% on variation+addOn revenue | 🔴 High (revenue leak) |
| Dual rider earnings systems | Inconsistent formulas, fallback gives 2–4× more | 🔴 High |
| `finalPayableToRestaurant` field | Naming conflict; two formulas overwrite same field | 🔴 Medium |
| `adminPlatformFeeShare` hardcoded 0 | Audit trail incorrect | 🟡 Low |
| Legacy duplicate fields (6 pairs) | Redundant, risk of drift | 🟡 Low |
| `restaurantCommission` field name | Misleading — stores earning, not commission | 🟡 Low |
| Per-item vs order-level earnings sum mismatch | Silent accounting discrepancy | 🔴 Medium |

---

## Numeric Example

For a ₹200 base item with ₹50 variation and ₹30 add-on selected (qty 1, 10% commission rate):

| Metric | Correct expectation | What code computes | Difference |
|---|---|---|---|
| GST base | ₹280 (base+var+addOn) | ₹200 (base only) | **₹80 untaxed** |
| Commission base | ₹280 | ₹200 (base only) | **₹8 commission missed** |
| Admin commission | ₹28 | ₹20 | **₹8 under-collected** |
| Restaurant earning | ₹280 − ₹28 = ₹252 | ₹280 − ₹20 = ₹260 | **₹8 over-paid to restaurant** |
