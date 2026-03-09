# RIDER EARNINGS SYSTEM - IMPLEMENTATION CHECKLIST

## Project Status

### Completed ✅
- [x] Order.js model updated with riderEarnings structure
- [x] AdminSetting.js has payoutConfig with earning parameters
- [x] riderEarningsService.js created with all calculation functions
- [x] riderEarningsController.js exists with dashboard endpoints
- [x] riderEarningsRoutes.js exists with protected rider routes
- [x] PaymentTransaction.js tracks all earnings transactions
- [x] RiderWallet.js manages rider cash and earnings balance

---

## Integration Checklist

### Phase 1: Wire Earnings Calculation into Payment Flow

**Priority: CRITICAL** - This makes earnings actually get credited

- [ ] **Task 1.1: Update paymentService.js**
  - Location: `Backend/services/paymentService.js`
  - What: Import requirementss
  - Code:
    ```javascript
    const { creditRiderEarnings } = require('./riderEarningsService');
    ```
  - Dependencies: riderEarningsService.js must exist ✅ (READY)

- [ ] **Task 1.2: Update processCODDelivery() function**
  - Location: `Backend/services/paymentService.js` → `processCODDelivery(orderId)`
  - What: Call creditRiderEarnings() after successful payment recording
  - Code to add (after payment status updated):
    ```javascript
    // Credit rider with earnings breakdown
    const riderEarningsResult = await creditRiderEarnings(orderId);
    if (!riderEarningsResult.success) {
      throw new Error(`Failed to credit rider earnings: ${riderEarningsResult.error}`);
    }
    ```
  - Testing: Use `Backend/test_all_payment_methods.js` with COD orders

- [ ] **Task 1.3: Update processOnlineDelivery() function**
  - Location: `Backend/services/paymentService.js` → `processOnlineDelivery(orderId)`
  - What: Call creditRiderEarnings() after successful payment recording
  - Code to add (after payment status updated):
    ```javascript
    // Credit rider with earnings breakdown
    const riderEarningsResult = await creditRiderEarnings(orderId);
    if (!riderEarningsResult.success) {
      throw new Error(`Failed to credit rider earnings: ${riderEarningsResult.error}`);
    }
    ```
  - Testing: Use existing online payment orders

- [ ] **Task 1.4: Verify orderController.js calls payment service**
  - Location: `Backend/controllers/orderController.js`
  - What: Confirm updateOrderStatus() calls payment service when status → 'delivered'
  - Code pattern:
    ```javascript
    if (status === "delivered" && oldStatus !== "delivered") {
      // This line should exist:
      processCODDelivery(order._id); // or processOnlineDelivery
    }
    ```
  - Testing: Update order status to 'delivered' and verify earnings credited

- [ ] **Task 1.5: Test End-to-End Flow**
  - Create test order with known itemTotal and distance
  - Mark as delivered
  - Verify in Order collection:
    - `riderEarnings.deliveryCharge` populated
    - `riderEarnings.platformFee` populated
    - `riderEarnings.incentive` populated
    - `riderEarnings.totalRiderEarning` populated
  - Verify in RiderWallet:
    - `totalEarnings` increased
    - `availableBalance` increased
    - `cashInHand` increased (if COD)
  - Verify in PaymentTransaction:
    - Record created with type 'rider_earning_credit'

---

### Phase 2: Update Rider Dashboard

**Priority: HIGH** - Makes data visible to riders

- [ ] **Task 2.1: Update riderEarningsController.js**
  - Location: `Backend/controllers/riderEarningsController.js`
  - What: Replace legacy field references with new riderEarnings structure
  - Current: Uses `riderEarning`, `riderIncentive` fields
  - Update to: Use `riderEarnings.totalRiderEarning`, `riderEarnings.incentive`, etc.
  - Functions to update:
    - `getEarningsSummary()` → Use getRiderEarningsSummary()
    - `getEarningsOrders()` → Map to riderEarnings.deliveryCharge/platformFee/incentive
    - Add breakdown percentages: deliveryCharge%, platformFee%, incentive%

- [ ] **Task 2.2: Test Rider Dashboard Routes**
  - Route: `GET /api/riders/earnings/summary`
  - Should return:
    ```json
    {
      "totalDeliveryCharges": 5500,
      "totalPlatformFees": 950,
      "totalIncentives": 2500,
      "totalEarnings": 8950
    }
    ```
  - Route: `GET /api/riders/earnings/orders`
  - Should return orders with breakdown per order

- [ ] **Task 2.3: Add Breakdown Percentages**
  - Update response to include:
    ```json
    {
      "breakdown": {
        "deliveryChargePercent": 61.4,
        "platformFeePercent": 10.6,
        "incentivePercent": 28
      }
    }
    ```

---

### Phase 3: Admin Dashboard

**Priority: MEDIUM** - Admin visibility into earnings

- [ ] **Task 3.1: Create RiderEarningsAdmin.jsx (Frontend)**
  - Location: `Frontend/src/admin/riders/pages/RiderEarningsAdmin.jsx`
  - What: Show earnings breakdown and leaderboard
  - Features:
    - [ ] Top earning riders leaderboard (week/month/all-time)
    - [ ] Pie chart: Delivery Charge vs Platform Fee vs Incentive
    - [ ] Filter by date range
    - [ ] Export to CSV

- [ ] **Task 3.2: Add Admin Routes**
  - Route: `GET /api/riders/earnings/leaderboard`
  - Route: `GET /api/riders/earnings/admin/:riderId`
  - Both should be admin-only (@admin middleware)

- [ ] **Task 3.3: Link from Admin Dashboard**
  - Add "Rider Earnings" menu item in admin sidebar
  - Link to RiderEarningsAdmin.jsx component

---

### Phase 4: Rider Mobile Notifications

**Priority: MEDIUM** - UX enhancement

- [ ] **Task 4.1: Update Delivery Notification Socket Event**
  - Location: `Backend/sockets/riderSocket.js` (or similar)
  - What: Include earnings breakdown in delivery offer
  - Payload should include:
    ```javascript
    {
      deliveryCharge: 40,
      platformFee: 9,
      incentive: 50,
      totalEarnings: 99
    }
    ```

- [ ] **Task 4.2: Update Order Notification Component (Frontend)**
  - Show breakdown before rider accepts
  - Display on rider's delivery list

---

### Phase 5: Data Migration (If Needed)

**Priority: LOW** - Only if you have existing delivered orders

- [ ] **Task 5.1: Create Migration Script**
  - File: `Backend/scripts/migrateRiderEarnings.js`
  - What: Backfill riderEarnings for historical orders
  - Usage:
    ```bash
    node scripts/migrateRiderEarnings.js
    ```

- [ ] **Task 5.2: Run Migration**
  - Backup database first
  - Run on test environment first
  - Verify 100% of delivered orders have riderEarnings populated

---

### Phase 6: Testing & Validation

**Priority: CRITICAL** - Ensure accuracy

- [ ] **Test Case 1: COD Order**
  - Create order: itemTotal=₹1000, distance=4km, platform fee=₹9
  - Expected earnings: ₹40 (delivery) + ₹9 (platform) + ₹50 (incentive) = ₹99
  - Verify in order.riderEarnings
  - Verify rider wallet updated

- [ ] **Test Case 2: Online Payment**
  - Create order: itemTotal=₹800, distance=6km
  - Expected earnings: ₹45 (₹30 + ₹15 bonus) + ₹9 + ₹40 = ₹94
  - Verify rider wallet, NOT cash in hand

- [ ] **Test Case 3: Long Distance**
  - Create order: itemTotal=₹500, distance=15km
  - Expected earnings: ₹30 + ₹60 (12km × ₹5) + ₹25 = ₹115
  - Verify distance bonus correct

- [ ] **Test Case 4: Admin Settings Change**
  - Change riderIncentivePercent from 5% to 7%
  - New order should use 7%
  - Old orders should still show 5% (incentivePercentAtCompletion field)

- [ ] **Test Case 5: Dashboard Aggregation**
  - Create 10 test orders
  - Call `/api/riders/earnings/summary`
  - Verify totals match individual order sums

---

### Phase 7: Performance & Optimization

**Priority: LOW** - After everything works

- [ ] **Task 7.1: Add Database Indexes**
  - Index on `Order.riderEarnings.earnedAt`
  - Index on `PaymentTransaction.rider + createdAt`
  - Index on `Order.rider + status`

- [ ] **Task 7.2: Cache Aggregations**
  - Cache daily earnings summary
  - Refresh every 1 hour
  - Improves dashboard load time

---

## File Dependencies

```
orderController.js
    ↓
paymentService.js
    ↓
riderEarningsService.js ← READ-ONLY, COMPLETE
    ↓
Order.js (updated ✅)
RiderWallet.js (compatible ✅)
AdminSetting.js (compatible ✅)
PaymentTransaction.js (compatible ✅)
```

---

## Critical Configuration

### AdminSetting.js Path

All calculations use these fields:

```javascript
payoutConfig: {
  riderBaseEarningPerDelivery: 30,    // ₹30 base
  riderPerKmRate: 5,                  // ₹5 per km
  riderBaseDistanceKm: 3,             // 3 km included
  riderIncentivePercent: 5             // 5% incentive
}
```

**If values don't exist:** Functions use defaults shown above

### Order Schema Requirements

Must have these fields for calculation:

```javascript
{
  itemTotal: Number,           // (before GST) - for incentive calc
  platformFee: Number,         // For platform fee split
  deliveryDistanceKm: Number,  // For delivery charge calc
  paymentMethod: String,       // 'cod' or 'online'
  rider: ObjectId,             // Reference to rider
  status: String,              // When = 'delivered', trigger earnings
  totalAmount: Number          // For COD collection tracking
}
```

---

## Testing Commands

### Test Orders API

```bash
# Create test order
curl -X POST http://localhost:3000/api/orders \
  -H "Content-Type: application/json" \
  -d '{
    "itemTotal": 1000,
    "platformFee": 9,
    "deliveryDistanceKm": 4,
    "paymentMethod": "cod",
    "rider": "<riderId>",
    "items": [...]
  }'

# Get order
curl http://localhost:3000/api/orders/<orderId>

# Update to delivered
curl -X PUT http://localhost:3000/api/orders/<orderId>/status \
  -H "Content-Type: application/json" \
  -d '{"status": "delivered"}'

# Check rider earnings
curl http://localhost:3000/api/riders/earnings/summary \
  -H "Authorization: Bearer <riderToken>"
```

---

## Debugging Checks

### To verify earnings got credited:

1. **Order Collection:**
   ```javascript
   db.orders.findOne({_id: ObjectId('...')}, {riderEarnings: 1})
   // Should show riderEarnings object with 6 fields
   ```

2. **RiderWallet Collection:**
   ```javascript
   db.riderwallets.findOne({rider: ObjectId('...')})
   // Check: totalEarnings increased, availableBalance increased
   ```

3. **PaymentTransaction Collection:**
   ```javascript
   db.paymenttransactions.findOne({order: ObjectId('...'), type: 'rider_earning_credit'})
   // Should exist with breakdown object
   ```

4. **Console Logs:**
   - Filter for "crediting rider earnings"
   - Look for any error messages in paymentService.js

---

## Rollback Plan

If issues occur:

1. **Pause Earning Credits:**
   - Comment out `creditRiderEarnings()` call in paymentService.js
   - Earnings won't be recorded but system remains stable

2. **Disable New System:**
   - Keep legacy `riderEarning` field calculation as backup
   - Revert paymentService.js changes

3. **Data Cleanup:**
   - If duplicate earnings created:
     ```javascript
     db.paymenttransactions.deleteMany({type: 'rider_earning_credit', createdAt: {$gt: ISODate('...')}})
     ```

---

## Success Criteria

System is complete when:

✅ Order marked as 'delivered' → earnings automatically calculated and credited
✅ Rider can see earnings breakdown (delivery charge, platform fee, incentive)
✅ Admin can see rider earnings leaderboard
✅ All earnings transactions logged in PaymentTransaction
✅ RiderWallet correctly tracks totalEarnings and availableBalance
✅ Test suite passes all 5 test cases
✅ No errors in console logs
✅ Rider receives notification with earnings breakdown

---

## Next Immediate Action

**START HERE:**

```javascript
// File: Backend/services/paymentService.js
// Function: processCODDelivery()

// ADD AT TOP:
const { creditRiderEarnings } = require('./riderEarningsService');

// FIND: Where payment.status is set to 'paid'
// ADD AFTER:
const riderEarningsResult = await creditRiderEarnings(orderId);
if (!riderEarningsResult.success) {
  throw new Error(`Failed to credit rider: ${riderEarningsResult.error}`);
}
```

This one change connects the entire system and makes earnings actually get credited!

---

## Questions?

Refer to: `Backend/RIDER_EARNINGS_SYSTEM.md` for detailed documentation
