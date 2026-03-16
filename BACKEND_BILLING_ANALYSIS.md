# BACKEND_BILLING_ANALYSIS

## 1. System Overview

This backend currently uses a layered financial pipeline:

1. Cart and checkout estimation
- controllers/cartController.js:17 resolveCartDeliveryDistance
- controllers/cartController.js:48 buildCartBill
- controllers/orderController.js:113 calculateBill

2. Core pricing engine
- services/priceCalculator.js:287 calculateOrderPrice
- services/priceCalculator.js:458 validateAndApplyCoupon

3. Canonical settlement math
- services/settlementCalculator.js:21 calculateSettlementBreakdown

4. Order snapshot creation
- controllers/orderController.js:212 placeOrder
- models/Order.js:140+ paymentBreakdown schema

5. Financial integrity checks
- services/financialIntegrityService.js:12 validateOrderFinancialIntegrity

6. Settlement on delivery
- controllers/orderController.js:1649 delivered branch
- controllers/orderController.js:1663 processSettlement trigger
- services/settlementService.js:40 processSettlement

7. Invoice/bill documents
- services/billingService.js:61 generateBills

Distance computation is local (haversine), not external map API:
- utils/locationUtils.js:1 haversine-distance package
- utils/locationUtils.js:25 calculateDistance

---

## 2. Order Calculation Flow

### Step 1: Item normalization and base line totals
Reference:
- services/priceCalculator.js:65 normalizePricingItem

Per item:
- quantity = max(1, floor(item.quantity))
- unitPrice = basePrice + variationPrice + addOnPrice (with compatibility logic for legacy cart price shape)
- lineTotal = unitPrice × quantity

### Step 2: Restaurant discount application
Reference:
- services/priceCalculator.js:99-117

Per item:
- percent discount: lineTotal × discountPercent/100
- flat discount: flatAmount × quantity
- clamped to [0, lineTotal]

Then:
- priceAfterDiscount = lineTotal − restaurantDiscountAmount

### Step 3: Food GST
Reference:
- services/priceCalculator.js:119-125

Per item:
- itemGstAmount = priceAfterDiscount × gstPercent/100
- split: cgst = itemGstAmount/2, sgst = remainder

Order level:
- gstOnFood = sum(item.itemGstAmount)

### Step 4: Packaging and packaging GST
Reference:
- services/priceCalculator.js:126-134

Per item:
- packagingTotal = unitPackagingCharge × quantity
- packagingGstAmount = packagingTotal × packagingGstPercent/100

Order level:
- packaging = sum(packagingTotal)
- packagingGST = sum(packagingGstAmount)

### Step 5: Delivery fee from distance slabs
Reference:
- services/priceCalculator.js:215 computeDeliveryFee
- services/priceCalculator.js:251 resolveDeliveryFee
- models/AdminSetting.js:43 deliverySlabs

Let distance = d.

If d <= firstSlabMaxKm:
- fee = baseDeliveryFee + d × firstSlabRatePerKm

Else if d <= secondSlabMaxKm:
- fee = baseDeliveryFee + firstSlabMaxKm × firstSlabRatePerKm + (d − firstSlabMaxKm) × secondSlabRatePerKm

Else:
- fee = baseDeliveryFee + firstSlabMaxKm × firstSlabRatePerKm + (secondSlabMaxKm − firstSlabMaxKm) × secondSlabRatePerKm + (d − secondSlabMaxKm) × thirdSlabRatePerKm

Free-delivery overrides:
- coupon free_delivery (services/priceCalculator.js:245)
- restaurant.isFreeDelivery threshold (services/priceCalculator.js:244-249)

### Step 6: Platform fee and small cart fee
Reference:
- services/priceCalculator.js:341 platformFee
- services/priceCalculator.js:344 smallCartFee
- models/AdminSetting.js:35-40

- platformFee = AdminSetting.platformFee
- if itemTotal < smallCartThreshold then smallCartFee = AdminSetting.smallCartFee

### Step 7: Coupon validation and discount amount
Reference:
- services/priceCalculator.js:348 validateAndApplyCoupon call
- services/priceCalculator.js:458 validateAndApplyCoupon

Discount base used by coupon engine:
- discountBase = deliveryFee + platformFee (services/priceCalculator.js:353)

Coupon discount is then passed as foodierDiscount into settlement math.

### Step 8: Settlement calculator composes customer + settlement fields
Reference:
- services/priceCalculator.js:371 calculateSettlementBreakdown call
- services/settlementCalculator.js:21

Important current rule:
- finalPayableToRestaurant = restaurantBillTotal (services/settlementCalculator.js:103)
- coupon does not reduce restaurant side

### Step 9: Final payable amount
Reference:
- services/priceCalculator.js:396-398

- totalAmount = finalPayableToRestaurant + platformBillTotal + smallCartFee + tip

### Step 10: Order snapshot and persistence
Reference:
- controllers/orderController.js:212 placeOrder
- controllers/orderController.js:470+ orderDoc
- models/Order.js:140+

The order stores root fields and a detailed paymentBreakdown snapshot for future settlement and audit.

---

## 3. GST Calculation Logic

Primary GST calculations happen in settlement calculator (canonical):
- services/settlementCalculator.js:43, 47, 81, 85, 109

Formulas:

1. Food GST
- gstOnFood = taxableAmountFood × foodGstPercent/100
- taxableAmountFood = itemTotal − restaurantDiscount

2. Packaging GST
- packagingGST = packagingCharge × packagingGstPercent/100

3. Delivery GST
- deliveryGST = deliveryFeeAfterDiscount × deliveryChargeGstPercent/100

4. Platform GST
- platformGST = platformFeeAfterDiscount × platformGstPercent/100

5. Admin commission GST
- adminCommissionGst = adminCommissionAmount × adminCommissionGstPercent/100

6. Total GST collected
- totalGstCollected = gstOnFood + packagingGST + deliveryGST + platformGST + adminCommissionGst

Order schema pre-validate normalization re-splits GST into CGST/SGST and syncs order.tax:
- models/Order.js:14 normalizePaymentBreakdown
- models/Order.js:367 pre validate hook

Integrity checks enforce these equations:
- services/financialIntegrityService.js:44 onward

---

## 4. Delivery Fee Calculation

### Distance source
- Cart preview distance: controllers/cartController.js:17 resolveCartDeliveryDistance
- Order placement distance: controllers/orderController.js:249-261
- Distance function: utils/locationUtils.js:25 calculateDistance

Distance function details:
- Uses haversine-distance package
- Inputs are [lng, lat]
- Returns km rounded to 1 decimal in utility, then often re-rounded to 2 decimals in controllers

### Delivery fee
- services/priceCalculator.js:215 computeDeliveryFee
- services/priceCalculator.js:251 resolveDeliveryFee

### Delivery GST
- services/settlementCalculator.js:81-83
- Calculated on discounted delivery fee charged to customer

### Stored delivery-related fields
- models/Order.js paymentBreakdown:
  - deliveryCharge, deliveryGST, cgstDelivery, sgstDelivery
  - deliveryDiscountUsed
  - deliveryFeeAfterDiscount
  - adminDeliverySubsidy

---

## 5. Platform Fee Calculation

Source:
- models/AdminSetting.js:35 platformFee
- services/priceCalculator.js:341

Coupon impact:
- coupon discount base includes platformFee
- platform discount split tracked in paymentBreakdown.platformDiscountSplit
- platformFeeAfterDiscount = platformFee − platformDiscountSplit

Platform GST:
- services/settlementCalculator.js:85
- platformGST = platformFeeAfterDiscount × platformGstPercent/100

Platform bill total (customer side):
- services/settlementCalculator.js:96
- platformBillTotal = deliveryFeeAfterDiscount + deliveryGST + platformFeeAfterDiscount + platformGST

---

## 6. Coupon Discount Logic

### Validation location
- services/priceCalculator.js:458 validateAndApplyCoupon

Validation checks include:
- code exists and active
- availableFrom / expiryDate
- restaurant scope
- minOrderValue
- optional day/time windows
- per-user limit using Order count
- per-coupon limit using promo.usedCount

Coupon types:
- percent
- amount or flat
- free_delivery

Model source:
- models/Promocode.js:18 offerType

### Application location
- services/priceCalculator.js:348 and services/settlementCalculator.js:65 onward

Current behavior:
- coupon discount only targets platform-controlled charges (delivery + platform fee)
- discount split proportionally:
  - deliveryDiscountUsed
  - platformDiscountSplit
- restaurant bill is not reduced by coupon

Stored coupon fields:
- root: order.couponCode, order.discount
- paymentBreakdown: foodierDiscount, platformDiscountUsed, couponDiscountAmount, deliveryDiscountUsed, platformDiscountSplit, deliveryFeeAfterDiscount, platformFeeAfterDiscount

Coupon usage increment currently occurs in placeOrder when paymentStatus is paid:
- controllers/orderController.js:647-649

---

## 7. Rider Earnings Calculation

Primary snapshot calculation during order placement:
- controllers/orderController.js:431 onward

Current formula used in order placement snapshot:
- riderDeliveryCharge = bill.deliveryFee (full pre-discount delivery charge)
- riderPlatformFeeShare = bill.platformFee (full pre-discount platform fee)
- riderIncentive = priceAfterRestaurantDiscount × riderIncentivePercent
- riderTip = tip
- totalRiderEarning = riderDeliveryCharge + riderPlatformFeeShare + riderIncentive + riderTip

This is stored in:
- order.riderEarnings
- paymentBreakdown.riderDeliveryEarning, riderIncentive, riderPlatformFeeShare

Settlement credit uses the snapshot (not recalculation):
- services/settlementService.js:104-108, 172

Legacy/auxiliary rider earnings service exists:
- services/riderEarningsService.js
- It has distance-based delivery earning helper, but creditRiderEarnings now requires snapshot and throws if missing.

---

## 8. Restaurant Settlement Logic

Canonical formula in settlement calculator:
- services/settlementCalculator.js:135-141

1. Customer-facing restaurant bill:
- restaurantBillTotal = taxableAmountFood + gstOnFood + packagingCharge + packagingGST
- finalPayableToRestaurant = restaurantBillTotal

2. Restaurant net earning (settlement side):
- restaurantNet = taxableAmountFood + packagingCharge − adminCommissionAmount − adminCommissionGst

3. In placeOrder, canonical settlement is overridden with item-level aggregate for restaurantNet:
- controllers/orderController.js:416-419
- restaurantNet and restaurantNetEarning are set to sum(items.restaurantEarningAmount)

Settlement credit at delivery:
- services/settlementService.js:90 restaurantEarning read from paymentBreakdown.restaurantNet
- credited to RestaurantWallet if > 0 (services/settlementService.js:148 onward)

---

## 9. Platform Revenue Calculation

Platform-side financial components spread across coupon/GST/commission fields:

1. Commission revenue component
- adminCommission = totalAdminCommissionDeduction − adminCommissionGst
- services/settlementService.js:90-95

2. GST liabilities tracked
- adminCommissionGst
- platformGST
- services/settlementService.js:95-102

3. Coupon subsidy impact
- adminDeliverySubsidy = deliveryDiscountUsed
- services/settlementCalculator.js:99

4. Effective platform bill collected from customer
- platformBillTotal as defined in settlement-v3

5. Settlement transactions record snapshots
- services/settlementService.js:186 onward PaymentTransaction entries

---

## 10. Data Fields Used in Order Schema

Main financial root fields:
- models/Order.js:132-142
- itemTotal, tax, packaging, deliveryFee, platformFee, tip, discount, couponCode, totalAmount

Key paymentBreakdown fields:
- Food/restaurant: itemTotal, restaurantDiscount, priceAfterRestaurantDiscount, gstOnFood, packagingCharge, packagingGST, restaurantBillTotal, finalPayableToRestaurant
- Platform: deliveryCharge, deliveryGST, platformFee, platformGST, platformBillTotal
- Coupon split: platformDiscountUsed, couponDiscountAmount, deliveryDiscountUsed, platformDiscountSplit, deliveryFeeAfterDiscount, platformFeeAfterDiscount, adminDeliverySubsidy
- Commission/settlement: adminCommissionGst, totalAdminCommissionDeduction, restaurantNet, restaurantNetEarning, restaurantGross
- GST summary: cgst/sgst fields and totalGstBreakdownForAdmin
- Metadata: computedVersion, computedAt

Rider snapshot fields:
- models/Order.js:295 onward riderEarnings object

Normalization hook:
- models/Order.js:367 pre validate hook normalizes paymentBreakdown and syncs tax

---

## 11. Example Calculation (based on current structure)

Assume:
- itemTotal = 500
- restaurantDiscount = 50
- foodGstPercent = 5
- packagingCharge = 20
- packagingGstPercent = 5
- deliveryFee (pre-discount) = 30
- platformFee (pre-discount) = 10
- coupon discount (foodierDiscount) = 8
- deliveryChargeGstPercent = 18
- platformGstPercent = 18
- tip = 15
- adminCommissionAmount = 45
- adminCommissionGstPercent = 18

Step A: Restaurant side
- taxableAmountFood = 500 − 50 = 450
- gstOnFood = 450 × 5% = 22.5
- packagingGST = 20 × 5% = 1
- restaurantBillTotal = 450 + 22.5 + 20 + 1 = 493.5
- finalPayableToRestaurant = 493.5

Step B: Coupon split across platform charges
- platformChargesBase = 30 + 10 = 40
- deliveryDiscountUsed = (30/40) × 8 = 6
- platformDiscountSplit = 8 − 6 = 2
- deliveryFeeAfterDiscount = 30 − 6 = 24
- platformFeeAfterDiscount = 10 − 2 = 8

Step C: Platform GST and platform bill
- deliveryGST = 24 × 18% = 4.32
- platformGST = 8 × 18% = 1.44
- platformBillTotal = 24 + 4.32 + 8 + 1.44 = 37.76

Step D: Customer total
- totalAmount = finalPayableToRestaurant + platformBillTotal + smallCartFee + tip
- if smallCartFee = 0, totalAmount = 493.5 + 37.76 + 15 = 546.26

Step E: Restaurant net settlement
- adminCommissionGst = 45 × 18% = 8.1
- restaurantNet = taxableAmountFood + packagingCharge − adminCommissionAmount − adminCommissionGst
- restaurantNet = 450 + 20 − 45 − 8.1 = 416.9

Step F: Rider snapshot example
- riderDeliveryCharge = 30 (full pre-discount delivery fee)
- riderPlatformFeeShare = 10 (full pre-discount platform fee)
- riderIncentive = priceAfterRestaurantDiscount × riderIncentivePercent
- if incentivePercent = 5%, riderIncentive = 450 × 5% = 22.5
- riderTip = 15
- totalRiderEarning = 30 + 10 + 22.5 + 15 = 77.5

Step G: Delivery subsidy
- adminDeliverySubsidy = deliveryDiscountUsed = 6
- meaning customer paid reduced delivery fee, but rider still credited against full delivery snapshot

---

## Potential Issues

1. Promocode usage counter field mismatch
- validateAndApplyCoupon checks promo.usedCount for usageLimitPerCoupon
  - services/priceCalculator.js:492
- order placement increments usedCount
  - controllers/orderController.js:648
- Promocode schema does not define usedCount
  - models/Promocode.js (field absent)
Impact:
- per-coupon usage cap may not work reliably depending on strict update behavior.

2. Coupon paymentMethods exists but is not enforced in validation
- schema has paymentMethods
  - models/Promocode.js:32
- validateAndApplyCoupon does not check selected payment method
  - services/priceCalculator.js:458-509
Impact:
- coupon may apply to disallowed payment methods.

3. CustomerBill generation uses pre-discount delivery/platform base fields
- billingService uses deliveryCharge = order.deliveryFee and platformFee = pb.platformFee/order.platformFee
  - services/billingService.js:90-91
- but GST values are sourced from post-discount settlement fields
  - services/billingService.js:146-160
Impact:
- generated customer bill can show base amounts that do not align with discounted GST base in settlement-v3.

4. Coupon usage increment tied to paymentStatus paid path in placeOrder
- controllers/orderController.js:647-649
Impact:
- online orders created as pending then paid later may require separate confirmed-payment increment path to avoid undercount or drift.

5. Multiple rider earning logic modules exist
- canonical settlement uses order.riderEarnings snapshot (services/settlementService.js)
- riderEarningsService contains distance-based helpers (services/riderEarningsService.js)
Impact:
- potential confusion for future contributors; one source of truth should be documented/enforced in development guidelines.

---

## Code Reference Index

Core pricing and settlement:
- services/priceCalculator.js:65 normalizePricingItem
- services/priceCalculator.js:215 computeDeliveryFee
- services/priceCalculator.js:251 resolveDeliveryFee
- services/priceCalculator.js:287 calculateOrderPrice
- services/priceCalculator.js:458 validateAndApplyCoupon
- services/settlementCalculator.js:21 calculateSettlementBreakdown

Order creation and cart preview:
- controllers/cartController.js:17 resolveCartDeliveryDistance
- controllers/cartController.js:48 buildCartBill
- controllers/cartController.js:136 validateCoupon
- controllers/orderController.js:113 calculateBill
- controllers/orderController.js:212 placeOrder

Settlement and integrity:
- services/financialIntegrityService.js:12 validateOrderFinancialIntegrity
- controllers/orderController.js:1663 processSettlement trigger
- services/settlementService.js:40 processSettlement
- services/billingService.js:61 generateBills

Distance utility:
- utils/locationUtils.js:25 calculateDistance

Schemas/settings:
- models/Order.js:140 paymentBreakdown fields
- models/Order.js:367 normalizeFinancialSnapshot pre validate
- models/AdminSetting.js:14 GST settings
- models/AdminSetting.js:35 platform pricing
- models/AdminSetting.js:43 delivery slabs
- models/Promocode.js:1 promocode structure
