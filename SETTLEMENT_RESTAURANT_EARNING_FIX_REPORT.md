# Settlement Restaurant Earning Fix Report

Date: 2026-03-14

## Problem
Restaurant earnings were missing packaging value in part of the flow due to this formula:

`restaurantEarning = lineTotal - adminCommission - adminCommissionGST`

This excluded packaging from restaurant net earnings.

## Correct Rule Implemented
Per item:

- `taxableFood = basePrice + variationPrice + addonPrice` (for quantity, this maps to line total)
- `adminCommission = taxableFood * commissionPercent / 100`
- `adminCommissionGST = adminCommission * adminCommissionGstPercent / 100`
- `restaurantNet = (taxableFood + packagingCharge) - adminCommission - adminCommissionGST`

Order-level:

- `paymentBreakdown.restaurantNetEarning = sum(items[].restaurantEarningAmount)`

GST components are **not** included in restaurant earnings:
- food GST
- packaging GST
- delivery GST
- platform GST

## Files Modified

### 1) services/settlementCalculator.js
- Updated canonical settlement formula:
  - from `taxableAmountFood - adminCommission - adminCommissionGst`
  - to `taxableAmountFood + packagingCharge - adminCommission - adminCommissionGst`

### 2) services/priceCalculator.js
- Added item-level intermediate values in normalized items:
  - `adminCommissionGstAmount`
  - `restaurantNetEarningAmount`
- `restaurantNetEarningAmount` now includes packaging and excludes all GST-on-sale components.

### 3) controllers/orderController.js
- Item earning computation updated to use packaging-inclusive formula.
- Uses calculated item fields when available:
  - `adminCommissionAmount`
  - `adminCommissionGstAmount`
  - `restaurantNetEarningAmount`
- Keeps `items[].restaurantEarningAmount` aligned with new business rule.
- `paymentBreakdown.restaurantNet` and `paymentBreakdown.restaurantNetEarning` remain aggregated from item sums.
- `paymentBreakdown.restaurantGross` aligned to include packaging (`itemTotal + packaging`).

### 4) services/financialIntegrityService.js
- Added explicit check:
  - `sum(items[].restaurantEarningAmount) == paymentBreakdown.restaurantNetEarning`
- Existing check for `paymentBreakdown.restaurantNet` aggregation retained.
- Restaurant net expected formula updated to use:
  - `taxableAmountFood + packagingCharge - adminCommission - adminCommissionGst`

### 5) test_settlement_restaurant_earning.js (new)
- Added targeted regression tests:
  - settlement calculator includes packaging in restaurant net
  - integrity validator enforces item-sum equals `paymentBreakdown.restaurantNetEarning`

### 6) package.json
- Added script:
  - `test:settlement-earning`

## Validation Added
The integrity service now validates both:
- `sum(items[].restaurantEarningAmount) == paymentBreakdown.restaurantNet`
- `sum(items[].restaurantEarningAmount) == paymentBreakdown.restaurantNetEarning`

This prevents drift between item-level and order-level restaurant net values.

## Notes on Test Execution
The new test file is added and syntactically valid.
In the current local terminal session, runtime test execution could not complete due to missing local dependency installation (`winston` not installed in that shell environment).
