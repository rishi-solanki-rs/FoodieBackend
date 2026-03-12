# Frontend Breaking Changes — Backend Update (March 12, 2026)

This document covers every change made in this update that requires a frontend code change.
Changes are grouped by app area. **Anything marked ⛔ REMOVED will return HTTP 410 — remove all calls to it.**

---

## 1. COD (Cash on Delivery) — FULLY REMOVED

COD is no longer supported anywhere in the system.

### What to change

| Area | Change required |
|------|----------------|
| Order placement screens | Remove "Cash on Delivery" option from payment method selector |
| Checkout flow | `paymentMethod` must be `"wallet"` or `"online"` only |
| Rider app | Remove "Collect Cash" button / workflow entirely |
| Admin panel | Remove COD collection, frozen-rider, and cash-deposit screens |
| Wallet / earnings displays | Remove `cashInHand`, `cashLimit`, `isFrozen`, `frozenReason` fields from all UI |

### Removed / dead endpoints — stop calling these

| Endpoint | Previous purpose | Now returns |
|----------|-----------------|-------------|
| `POST /api/payment/cod/confirm` | Rider confirms COD collection | **410 Gone** |
| `POST /api/payment/rider/deposit` | Admin records cash deposit from rider | **410 Gone** |
| `POST /api/payment/rider/cash-limit` | Admin sets rider cash limit | **410 Gone** |
| `GET /api/payment/rider/frozen-riders` | Admin lists frozen riders | **410 Gone** |
| `PUT /api/orders/:id/collect-cash` | Rider marks cash collected | **410 Gone** |
| `POST /api/payment/admin/weekly-payout` | Trigger automated weekly payouts | **501 Not Implemented** |

---

## 2. Order Placement — `POST /api/orders/place`

### Request body (unchanged shape, but `cod` value is now invalid)

```json
{
  "addressId": "<savedAddressId>",
  "paymentMethod": "wallet" | "online"
}
```

`paymentMethod: "cod"` now returns **400 Bad Request**.

### Response — wallet payment (`paymentMethod: "wallet"`)

Order is created and confirmed immediately. `paymentStatus` will be `"paid"` and `status` will be `"placed"`.

```json
{
  "success": true,
  "message": "Order placed successfully",
  "order": { ... },
  "totalPayment": 345.00
}
```

**Frontend flow:** Show order confirmation screen directly. No Razorpay step needed.

### Response — online payment (`paymentMethod: "online"`)

Order is created but NOT confirmed. `status` is `"pending"`, `paymentStatus` is `"pending"`.

```json
{
  "success": true,
  "message": "Order created. Complete payment to confirm.",
  "orderId": "<orderId>",
  "totalPayment": 345.00,
  "requiresPayment": true
}
```

**Frontend flow:** Take the `orderId`, call `POST /api/payment/create-order` → open Razorpay → call `POST /api/payment/verify-payment`. Only after verification does the order move to `"placed"`.

### Wallet insufficient balance

```json
{ "success": false, "message": "Insufficient Wallet Balance" }
```
HTTP status: **400**. Show a recharge prompt.

---

## 3. Razorpay Order Payment Flow (online orders)

**Step 1 — Create Razorpay order**

```
POST /api/payment/create-order
Authorization: Bearer <token>
{ "orderId": "<orderId>" }
```

Response:
```json
{
  "success": true,
  "razorpayOrderId": "order_xxx",
  "amount": 34500,       // in paise
  "currency": "INR",
  "keyId": "rzp_..."
}
```

**Step 2 — Open Razorpay checkout** using `razorpayOrderId`, `amount`, `keyId`.

**Step 3 — Verify payment**

```
POST /api/payment/verify-payment
Authorization: Bearer <token>
{
  "orderId": "<appOrderId>",
  "razorpayOrderId": "order_xxx",
  "razorpayPaymentId": "pay_xxx",
  "razorpaySignature": "..."
}
```

On success: order status becomes `"placed"`, restaurant is notified via socket.

---

## 4. Wallet Recharge Flow

**Step 1 — Create recharge order**

```
POST /api/wallet/create-recharge-order
Authorization: Bearer <token>
{ "amount": 500 }
```

Response:
```json
{
  "success": true,
  "orderId": "<rechargeOrderId>",
  "razorpayOrderId": "order_xxx",
  "amount": 50000,
  "currency": "INR",
  "keyId": "rzp_..."
}
```

**Step 2 — Open Razorpay checkout** using the returned values.

**Step 3 — Verify and credit wallet**

```
POST /api/wallet/verify-payment
Authorization: Bearer <token>
{
  "razorpay_order_id": "order_xxx",
  "razorpay_payment_id": "pay_xxx",
  "razorpay_signature": "..."
}
```

Response:
```json
{
  "success": true,
  "message": "Wallet recharged successfully",
  "amount": 500,
  "newBalance": 850.00
}
```

---

## 5. Customer Wallet — `GET /api/wallet`

No change to the endpoint. Returns:

```json
{
  "balance": 850.00,
  "history": [ ... ]
}
```

---

## 6. Order Cancellation & Refunds — `POST /api/orders/:id/cancel`

Refund is always credited to the **wallet** (COD orders no longer exist). No change to the request body.

Response:
```json
{
  "success": true,
  "message": "Order cancelled successfully. Refund: ₹345",
  "refund": {
    "amount": 345.00,
    "percentage": 100,
    "method": "wallet"
  }
}
```

Refund percentage rules:
- Cancelled before restaurant accepts → **100%** refunded to wallet
- Cancelled after restaurant accepts → **50%** refunded to wallet

---

## 7. Rider App — Wallet / Earnings Changes

### `GET /api/payment/rider/wallet`

Fields **removed** from response (stop reading these — they will be `undefined`):
- `cashInHand`
- `cashLimit`
- `isFrozen`
- `frozenReason`
- `frozenAt`

Current response shape:
```json
{
  "success": true,
  "data": {
    "wallet": {
      "availableBalance": 1200.00,
      "totalEarnings": 5400.00,
      "totalPayouts": 4200.00,
      "lastPayoutAt": "2026-03-10T12:00:00Z",
      "lastPayoutAmount": 800.00,
      "lastDepositAt": "2026-03-10T12:00:00Z"
    },
    "recentTransactions": [ ... ]
  }
}
```

### `GET /api/riders/earnings/summary`

Fields **removed** from `wallet` block in response:
- `isFrozen`

### `GET /api/riders/earnings/payouts`

Fields **removed** from `wallet` block in response:
- `cashInHand`
- `cashLimit`
- `isFrozen`
- `frozenReason`
- `transactions` (array was incorrect here — use `GET /api/wallet/:userId/transactions` instead)

---

## 8. Admin Panel Changes

### `GET /api/payment/admin/summary`

Fields **removed** from response:
- `totalCODCollected`
- `frozenRidersCount`

Current response shape:
```json
{
  "success": true,
  "data": {
    "totalOnlinePayments": 125000.00,
    "totalCommissionEarned": 18000.00,
    "totalPaidOut": 95000.00,
    "pendingRestaurantPayouts": 12000.00
  }
}
```

### `GET /api/payment/riders/wallets`

Field **removed** from each wallet object in the list:
- `cashInHand`

### Rider transaction type filter

These transaction `type` values no longer exist — **remove from any type filter dropdowns**:
- `cod_collected`
- `cod_deposit`
- `rider_freeze`
- `rider_unfreeze`

Valid rider transaction types are now:
- `rider_earning_credit`
- `rider_weekly_payout`
- `rider_manual_payout`

---

## 9. Delivery Fee Calculator — `POST /api/payment/calculate-delivery-fee`

No change to calling convention. Now computed inline from `AdminSetting`.

Request:
```json
{ "distanceKm": 5.2 }
```

Response:
```json
{
  "success": true,
  "data": {
    "distanceKm": 5.2,
    "baseFee": 20,
    "perKmRate": 5,
    "deliveryCharge": 46
  }
}
```

---

## 10. Socket Events — changes

The `rider:earnings_updated` and `restaurant:earnings_updated` socket payloads no longer contain:
- `rider.cashInHand`
- `rider.isFrozen`

Updated rider portion of the payload:
```json
{
  "rider": {
    "availableBalance": 1200.00,
    "totalEarnings": 5400.00
  }
}
```

---

## Summary Checklist for Frontend Teams

### Customer App
- [ ] Remove COD from payment method options
- [ ] Implement wallet recharge flow (Razorpay → `/api/wallet/create-recharge-order` → verify)
- [ ] Show wallet balance before checkout; display "Insufficient Balance" with recharge CTA
- [ ] Wallet payment → go straight to order confirmed screen (no Razorpay step)
- [ ] Online payment → open Razorpay → verify → then show confirmed screen
- [ ] Cancellation refund always goes to wallet — update cancel confirmation copy

### Rider App
- [ ] Remove cash collection screen and all COD UI
- [ ] Remove `cashInHand` / `isFrozen` / `frozenReason` displays from wallet/earnings screens
- [ ] Update earnings summary and payout history to use the new wallet shape

### Admin Panel
- [ ] Remove COD management section (frozen riders, cash deposit, cash limit)
- [ ] Remove `totalCODCollected` and `frozenRidersCount` from payment summary dashboard
- [ ] Remove `cod_collected`, `cod_deposit`, `rider_freeze`, `rider_unfreeze` from transaction type filter
- [ ] Remove `cashInHand` column from rider wallets table
- [ ] Weekly payout trigger button should be hidden or disabled (501 — not implemented)
