# Promocode Frontend Integration (Canonical)

This document explains the correct frontend flow after promocode cleanup.

## Core Rules

- Only one coupon can be active per cart/order.
- Coupon code is case-insensitive from frontend, but backend normalizes to uppercase.
- Only these offer types are supported:
  - `percentage`
  - `free_delivery`
- Coupon validation is based on canonical backend fields only:
  - `availableFrom`
  - `expiryDate`
  - `activeDays`
  - `timeSlots`
  - `usageLimitPerCoupon`
  - `usageLimitPerUser`

## Customer API Flow

### 1) Apply/Validate Coupon

- Endpoint: `POST /api/cart/validate-coupon`
- Auth: Required (customer token)

Request:

```json
{
  "couponCode": "SAVE20",
  "addressId": "optional_address_id"
}
```

Success response (example):

```json
{
  "valid": true,
  "message": "Coupon is valid",
  "bill": {
    "appliedCoupon": "SAVE20",
    "couponType": "percentage",
    "couponDiscountAmount": 15,
    "platformDiscountUsed": 15,
    "deliveryDiscountApplied": 0,
    "deliveryDiscountUsed": 0,
    "platformDiscountApplied": 15,
    "deliveryFee": 24,
    "discountedDeliveryFee": 24,
    "platformFee": 9,
    "discountedPlatformFee": 0,
    "total": 198.5
  }
}
```

Failure response (example):

```json
{
  "valid": false,
  "message": "Coupon expired or not yet active"
}
```

Notes:

- Backend saves coupon to cart only when validation succeeds.
- If another coupon is already applied, backend returns error:
  - `Only one coupon can be applied per order.`

### 2) Remove Coupon

- Endpoint: `DELETE /api/cart/coupon`
- Auth: Required

Optional request body:

```json
{
  "addressId": "optional_address_id"
}
```

Success response (example):

```json
{
  "success": true,
  "message": "Coupon removed",
  "bill": {
    "appliedCoupon": null,
    "couponDiscountAmount": 0,
    "total": 213.5
  }
}
```

### 3) Fetch Cart with Bill

- Endpoint: `GET /api/cart`
- Auth: Required

Frontend should always trust `bill` returned by backend and render totals from it.

## Order Placement Behavior

- Coupon comes from the current cart (`cart.couponCode`).
- Frontend does not need a separate coupon apply call during place-order if cart already has valid coupon.
- On successful paid order flow, coupon usage is incremented by backend.

## UI Implementation Checklist

- Keep local coupon input state (`text`) separate from server-applied coupon state.
- After successful apply:
  - Update UI from returned `bill`.
  - Show applied code from `bill.appliedCoupon` (or cart coupon from cart API).
- After remove:
  - Clear applied coupon UI state.
  - Re-render totals from returned `bill`.
- Disable applying a second code while one is active.
- Show backend message directly for coupon failures (expiry, usage limits, invalid scope).

## Recommended Frontend Data Mapping

Use these bill fields directly:

- `couponType`
- `couponDiscountAmount`
- `platformDiscountUsed`
- `deliveryDiscountUsed`
- `discountedPlatformFee`
- `discountedDeliveryFee`
- `total`

Do not recalculate coupon math in frontend.

## Quick Integration Example (Pseudo)

```js
async function applyCoupon(couponCode, addressId) {
  const res = await api.post('/api/cart/validate-coupon', { couponCode, addressId });
  setBill(res.data.bill);
  setAppliedCoupon(res.data.bill?.appliedCoupon || couponCode.toUpperCase());
}

async function removeCoupon(addressId) {
  const res = await api.delete('/api/cart/coupon', { data: { addressId } });
  setBill(res.data.bill);
  setAppliedCoupon(null);
}
```

## Common Errors To Handle

- `Coupon code is required.`
- `Only one coupon can be applied per order.`
- `Coupon expired or not yet active`
- `Coupon is not active today`
- `Coupon is not active at this time`
- `You have reached coupon usage limit`
- `Coupon usage limit exceeded`
- `Coupon does not apply to this order`

