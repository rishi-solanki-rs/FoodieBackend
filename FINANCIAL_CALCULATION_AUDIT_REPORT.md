# Financial Calculation Audit Report

Date: 2026-03-13
Auditor Role: Senior Backend Engineer and Financial System Auditor
Project: Food Delivery Platform Backend (Node.js, Express, MongoDB, Mongoose)

## Executive Summary

This audit reviewed the backend financial calculation flow from order creation to delivery settlement and billing/reporting layers.

High-level outcome:

- Item-level billing math is mostly correct.
- Platform bill math is correctly defined in the settlement calculator.
- Multiple field consistency and settlement-path conflicts exist.
- Canonical and legacy fields are both active in read paths, creating reconciliation risk.
- Admin GST liabilities are tracked in order data but are not consistently settled in wallet credit flows.

Overall result: **Partial compliance with major consistency risks**.

## Scope And Files Reviewed

- Backend/models/Order.js
- Backend/models/AdminSetting.js
- Backend/controllers/orderController.js
- Backend/controllers/riderController.js
- Backend/controllers/reportController.js
- Backend/services/priceCalculator.js
- Backend/services/settlementCalculator.js
- Backend/services/billingService.js
- Backend/services/paymentService.js
- Backend/services/riderEarningsService.js
- Backend/services/settlementValidator.js

## Audit Method

- Static read-only code audit (no modifications).
- Formula tracing across schema, order creation, delivery settlement, and reporting modules.
- Conflict detection for duplicate fields and fallback chains.

---

## Step 1 - Item Level Calculation Audit

### Fields Verified

- items[].price
- items[].quantity
- items[].lineTotal
- items[].gstPercent
- items[].itemGstAmount
- items[].cgst
- items[].sgst

### Formula Verification

Implemented:

- lineTotal = price x quantity
- itemGstAmount = lineTotal x gstPercent / 100
- cgst + sgst = itemGstAmount (split via half and remainder)

Status: **PASS**

### Notes

- Item-level calculations are correct at order creation.
- There is no post-write invariant check to guarantee future consistency if records are updated manually.

---

## Step 2 - Order Billing Verification

### Fields Verified

- itemTotal
- tax
- packaging
- deliveryFee
- platformFee
- tip
- discount
- totalAmount

### Expected Formula

totalAmount = itemTotal + tax + packaging + deliveryFee + platformFee + tip - discount

### Implemented Formula

The system computes totals from settlement split logic:

- totalAmount = finalPayableToRestaurant + platformBillTotal + smallCartFee + tip

Status: **PARTIAL PASS**

### Notes

- The backend uses two-bill architecture (restaurant bill + platform bill), not a single-line additive formula.
- Top-level tax does not include all tax components used in final payable.
- Reconciliation from top-level fields can diverge from totalAmount.

---

## Step 3 - Admin Commission Verification

### Fields Verified

- items[].commissionPercent
- items[].adminCommissionAmount
- order.adminCommission

### Formula Verification

Implemented at order creation:

- itemAdminCommission = lineTotal x commissionPercent / 100
- adminCommission = sum(items[].adminCommissionAmount)

Status: **PASS (Order Creation Path)**

### Risk

- In alternate settlement logic, commission fallback prefers deprecated field chain and can collapse to 0 in some scenarios.

---

## Step 4 - Admin GST Liability Verification

### Fields Verified

- paymentBreakdown.adminCommissionGst
- paymentBreakdown.adminCommissionGstPercent
- paymentBreakdown.totalAdminCommissionDeduction

### Formula Verification

Implemented at order creation:

- adminCommissionGst = adminCommission x adminCommissionGstPercent / 100
- totalAdminCommissionDeduction = adminCommission + adminCommissionGst

Status: **TRACKED BUT NOT CONSISTENTLY SETTLED**

### Findings

- GST liability is stored correctly in paymentBreakdown.
- Wallet settlement path does not consistently transfer or account for this liability in all active credit flows.

---

## Step 5 - Restaurant Earnings Verification

### Fields Verified

- items[].restaurantEarningAmount
- order.restaurantEarning
- paymentBreakdown.restaurantNetEarning
- paymentBreakdown.restaurantNet

### Required Formula

restaurantEarning = lineTotal - adminCommission - rest gst - admin gst

### Implemented Behavior

- Item level: restaurantEarningAmount = lineTotal - itemAdminCommission
- Order level: restaurantNet subtracts adminCommissionGst at order level

Status: **FAIL (Aggregation Inconsistency)**

### Key Mismatch

- sum(items[].restaurantEarningAmount) does not equal order.restaurantEarning when adminCommissionGst is deducted only at order level.
- Packaging treatment is not consistently reflected across comments, fields, and settlement logic.

---

## Step 6 - Rider Earnings Verification

### Fields Verified

- riderEarnings.deliveryCharge
- riderEarnings.platformFee
- riderEarnings.incentive
- riderEarnings.totalRiderEarning
- legacy: riderEarning, riderIncentive, riderIncentivePercent

### Formula Verification

Implemented:

- totalRiderEarning = deliveryCharge + platformFee + incentive

Status: **PASS (Formula), FAIL (Flow Consistency)**

### Findings

- Structured riderEarnings formula is correct.
- Active rider credit service credits only totalRiderEarning (tip excluded).
- Alternate settlement service includes tip separately in rider credit.
- Legacy rider fields remain used in reports and API responses, creating ambiguity.

Legacy field status recommendation:

- riderEarning: deprecated
- riderIncentive: deprecated
- riderIncentivePercent: deprecated

---

## Step 7 - Platform Billing Verification

### Fields Verified

- paymentBreakdown.taxablePlatformAmount
- paymentBreakdown.gstOnPlatform
- paymentBreakdown.cgstPlatform
- paymentBreakdown.sgstPlatform
- paymentBreakdown.platformBillTotal

### Formula Verification

Implemented:

- platformBillTotal = taxablePlatformAmount + gstOnPlatform
- cgstPlatform + sgstPlatform = gstOnPlatform

Status: **PASS (Calculator Level)**

### Risk

- Downstream settlement path has hardcoded adminPlatformFeeShare = 0 in one module, causing platform GST distribution inconsistencies.

---

## Step 8 - Payment Breakdown Consistency Verification

### Fields Verified

- paymentBreakdown.restaurantBillTotal
- paymentBreakdown.customerRestaurantBill
- paymentBreakdown.restaurantNetEarning
- paymentBreakdown.restaurantGross

Status: **PARTIAL FAIL**

### Findings

- customerRestaurantBill and finalPayableToRestaurant are intentionally aligned and stored.
- Reporting and billing services still read legacy fields (restaurantCommission, riderEarning) as primary values in several places.
- This can show values that differ from canonical settlement fields.

---

## Step 9 - Calculation Mismatch Detection

### Mismatches Found

1. restaurantEarning mismatch:

- sum(items[].restaurantEarningAmount) != order.restaurantEarning when adminCommissionGst is applied only at order level.

2. Admin commission field conflict:

- adminCommission vs adminCommissionAtOrder precedence differs by module.
- Deprecated fallback chain can override canonical values.

3. Rider earnings field conflict:

- riderEarnings.totalRiderEarning vs riderEarning both used.

4. Platform GST split conflict:

- Calculated in settlement calculator but not consistently reflected in admin wallet share logic.

5. Multi-path settlement risk:

- Different modules perform delivery earnings credits with different assumptions.

Status: **FAIL (Multiple High-Risk Mismatches)**

---

## Step 10 - Order Financial Flow Validation

### Required Flow

Customer payment -> platform fee -> GST collection -> admin commission -> restaurant earnings -> rider earnings

### Observed Flow

- Customer bill is computed using settlement split logic.
- Rider and restaurant credits are executed in controller/service paths that are not fully unified.
- Admin commission GST is tracked but not consistently settled in all active flows.
- Legacy field usage in reporting creates reconciliation drift.

Status: **NOT FULLY BALANCED END-TO-END**

---

## Step 11 - Recommendations To Fix Inconsistencies

### Priority 1 (Critical)

1. Enforce a single settlement writer path for delivered orders.
2. Use canonical fields as primary source everywhere:
	- restaurantEarning
	- adminCommission
	- riderEarnings.*
3. Remove deprecated-first fallback chains in financial calculations.
4. Settle admin GST liabilities explicitly in wallet/accounting flows.

### Priority 2 (High)

1. Standardize restaurant net formula and packaging treatment.
2. Ensure item-level and order-level restaurant earnings reconcile by design.
3. Standardize tip payout policy across all settlement paths.
4. Update billing service to read canonical fields and correct GST base treatment.

### Priority 3 (Medium)

1. Restrict legacy fields to migration-read only.
2. Update reports to use canonical fields only.
3. Add invariant checks:
	- cgst + sgst = gst
	- platformBillTotal = taxablePlatformAmount + gstOnPlatform
	- rider total = deliveryCharge + platformFee + incentive
	- item-level and order-level reconciliation checks
4. Upgrade settlementValidator to current settlement-v2 assumptions and canonical precedence.

---

## Final Audit Verdict

The backend has a strong foundation for billing and split calculations, but it is currently exposed to financial reconciliation risk due to mixed canonical/legacy field usage and fragmented settlement execution paths.

Audit Verdict: **PARTIAL COMPLIANCE - REMEDIATION REQUIRED**

## Suggested Next Phase

If approved, next phase should be:

1. Canonical field migration plan
2. Single settlement pipeline enforcement
3. Automated reconciliation test suite
4. Historical backfill and repair script for mismatched orders

