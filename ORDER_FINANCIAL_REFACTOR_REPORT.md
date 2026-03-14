# Order Financial Refactor Report

Date: 2026-03-14

## Objective
Refactor order financial storage to remove duplicate fields and enforce a single source of truth:
- Financial ledger: `paymentBreakdown`
- Rider payout ledger: `riderEarnings`

## Removed Fields

### Removed from Order root
- `restaurantEarning`
- `adminCommission`
- `riderEarning`
- `riderIncentive`
- `riderIncentivePercent`
- `adminCommissionAtOrder`
- `restaurantCommission`
- `riderCommission`

### Removed from Order items
- `items[].packagingTotal`

## Updated Files

### Schema
- `models/Order.js`
  - Removed duplicate root financial fields
  - Removed `items[].packagingTotal`
  - Kept model-level normalization for GST split and GST summary under `paymentBreakdown`

### Controllers
- `controllers/orderController.js`
  - Stopped writing duplicate root financial fields into order documents
  - Removed item-level `packagingTotal` persistence
  - Response bill `restaurantEarning` now derived from `paymentBreakdown.restaurantNet`
  - Billing section commission derivation now uses `paymentBreakdown.totalAdminCommissionDeduction - paymentBreakdown.adminCommissionGst`

- `controllers/reportController.js`
  - Replaced root financial reads with canonical derivation helpers:
    - admin commission from `paymentBreakdown`
    - restaurant net from `paymentBreakdown.restaurantNet`
    - rider earning from `riderEarnings.totalRiderEarning`

- `controllers/dashboardController.js`
  - Aggregations updated to use `paymentBreakdown` for commission and restaurant net totals

- `controllers/adminController.js`
  - Commission aggregations/reports now use canonical `paymentBreakdown` commission derivation

- `controllers/restaurantController.js`
  - Restaurant earnings summary aggregation updated to `paymentBreakdown.restaurantNet`
  - Platform commission summary updated from `paymentBreakdown` deduction fields

### Services
- `services/settlementService.js`
  - Settlement now derives `restaurantEarning` and `adminCommission` from `paymentBreakdown`
  - Removed writes to deleted legacy root fields

- `services/paymentService.js`
  - Settlement snapshot and settlement persistence updated to canonical `paymentBreakdown` + `riderEarnings`
  - Removed all writes to deleted legacy root fields

- `services/billingService.js`
  - Admin commission and restaurant net now derived from `paymentBreakdown`

- `services/riderDispatchService.js`
  - Rider earnings preview derived from `riderEarnings` only

- `services/settlementValidator.js`
  - Validation switched from removed root fields to canonical `paymentBreakdown` and `riderEarnings`

- `services/financialIntegrityService.js`
  - Validation refactored to canonical fields only (no root financial duplicates)

## Validation Added/Adjusted

`services/financialIntegrityService.js` now enforces:
- Item total consistency: `sum(items.lineTotal) == paymentBreakdown.itemTotal`
- GST split consistency for:
  - food
  - packaging
  - delivery
  - platform
  - admin commission GST
- Admin GST summary consistency:
  - `totalGstCollected`
  - `cgstTotal + sgstTotal == totalGstCollected`
- Restaurant net consistency:
  - `sum(items.restaurantEarningAmount) == paymentBreakdown.restaurantNet`
  - `paymentBreakdown.restaurantNet == paymentBreakdown.restaurantNetEarning`
  - Formula: `restaurantGross - adminCommission - adminCommissionGst`
- Rider earnings consistency:
  - `deliveryCharge + platformFee + incentive + tip == riderEarnings.totalRiderEarning`
- Order amount consistency:
  - `finalPayableToRestaurant + platformBillTotal + tip == order.totalAmount`

## Final Optimized Financial Structure

### Canonical storage in Order
- `paymentBreakdown` (single source for order financial accounting)
  - food/packaging/platform/delivery GST components
  - admin commission GST and total deductions
  - restaurant net and customer-facing restaurant payable
  - total GST summaries for admin

- `riderEarnings` (single source for rider payout)
  - delivery charge
  - platform fee share
  - incentive
  - tip
  - total rider earning
  - incentive percent snapshot
  - earned timestamp

### Non-canonical order fields retained
- Operational fields only (status/timeline/payment metadata/address/etc.)
- Top-level amount fields retained for request/response compatibility, while financial truth remains in `paymentBreakdown` + `riderEarnings`

## Result
The order financial model is now normalized and avoids duplicate financial sources that previously drifted across root fields, payment breakdown snapshots, and settlement updates.
