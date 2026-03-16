# Coupon Frontend Integration Guide

This guide explains how frontend should integrate the current coupon flow in this backend.

## 1. Base APIs

Backend route mounts:
- /api/cart (Server.js)
- /api/admin (Server.js)
- /api/restaurants (Server.js)

Coupon-related endpoints:
- POST /api/cart/validate-coupon
- GET /api/cart
- POST /api/admin/promocode
- GET /api/admin/promocode
- GET /api/admin/promocode/:id
- PUT /api/admin/promocode/:id
- DELETE /api/admin/promocode/:id
- POST /api/restaurants/promocode
- GET /api/restaurants/promocode
- GET /api/restaurants/promocode/:id
- PUT /api/restaurants/promocode/:id
- DELETE /api/restaurants/promocode/:id

## 2. Coupon Creation (Admin/Restaurant Panel)

### 2.1 Required/important payload fields

- title: string
- description: string
- code: string (stored uppercase)
- offerType: percent | amount | free_delivery
- discountValue: number
- minOrderValue: number
- availableFrom: ISO datetime
- expiryDate: ISO datetime
- usageLimitPerCoupon: number
- usageLimitPerUser: number
- status: active | inactive

Optional:
- maxDiscountAmount (for percent)
- restaurant (null means global)
- image (multipart file)
- promoType
- paymentMethods
- isTimeBound, activeDays, timeSlots

### 2.2 Example create request (admin)

POST /api/admin/promocode

```json
{
  "title": "Welcome 20",
  "description": "20% off on platform charges",
  "code": "WELCOME20",
  "offerType": "percent",
  "discountValue": 20,
  "maxDiscountAmount": 100,
  "minOrderValue": 199,
  "availableFrom": "2026-03-16T00:00:00.000Z",
  "expiryDate": "2026-12-31T23:59:59.000Z",
  "usageLimitPerCoupon": 0,
  "usageLimitPerUser": 1,
  "status": "active"
}
```

Success response:

```json
{
  "message": "Promocode created successfully",
  "data": {
    "_id": "...",
    "code": "WELCOME20"
  }
}
```

## 3. Customer Apply/Validate Flow

### 3.1 Validate endpoint

POST /api/cart/validate-coupon

```json
{
  "couponCode": "WELCOME20",
  "addressId": "<optional-address-id>"
}
```

Behavior:
- Backend writes couponCode into cart.
- Backend recalculates bill through the same pricing engine used for order placement.
- If invalid, returns 400 with reason.

Success:

```json
{
  "valid": true,
  "message": "Coupon is valid",
  "bill": {
    "itemTotal": 500,
    "deliveryFee": 30,
    "platformFee": 9,
    "discount": 7.8,
    "couponDiscountAmount": 7.8,
    "deliveryDiscountUsed": 6,
    "deliveryFeeAfterDiscount": 24,
    "platformFeeAfterDiscount": 7.2,
    "adminDeliverySubsidy": 6,
    "toPay": 546.26,
    "appliedCoupon": "WELCOME20",
    "couponError": null
  }
}
```

Failure:

```json
{
  "valid": false,
  "message": "Add items worth Rs 50.00 more to use this coupon"
}
```

## 4. Where Frontend Should Read Coupon Data

### 4.1 Cart screen

Use GET /api/cart response:
- cart.couponCode
- bill.discount
- bill.couponDiscountAmount
- bill.deliveryDiscountUsed
- bill.deliveryFeeAfterDiscount
- bill.platformFeeAfterDiscount
- bill.toPay
- bill.couponError

### 4.2 Checkout screen

Use same GET /api/cart bill payload just before place-order.
Do not recompute discount in frontend.

### 4.3 Order placed response

Current placeOrder response includes bill summary but not full coupon split fields.
Available immediately after place order:
- bill.itemTotal
- bill.tax
- bill.packaging
- bill.platformFee
- bill.tip
- bill.discount
- bill.totalAmount

If frontend needs detailed coupon split after order creation, use order details API and paymentBreakdown fields.

## 5. Current Discount Rules (Important)

Coupon discount base is platform-controlled charges only:
- deliveryFee
- platformFee

Coupon does not reduce:
- food item totals
- restaurant GST
- restaurant net settlement
- rider delivery earning snapshot

Discount split logic:
- discount distributed proportionally into deliveryDiscountUsed and platformDiscountSplit
- deliveryFeeAfterDiscount = deliveryFee - deliveryDiscountUsed
- platformFeeAfterDiscount = platformFee - platformDiscountSplit

GST logic:
- delivery GST calculated on deliveryFeeAfterDiscount
- platform GST calculated on platformFeeAfterDiscount

## 6. UI Recommendations

### 6.1 Coupon card state
- Idle: input + apply button
- Applying: loading spinner
- Success: show applied coupon code and discount amount
- Failure: show backend message from validate-coupon

### 6.2 Bill breakdown rows
Show these rows if present:
- Delivery Fee (original)
- Delivery Discount
- Delivery Fee After Discount
- Platform Fee (original)
- Platform Discount
- Platform Fee After Discount
- Coupon Discount Total
- Final Payable

### 6.3 Address dependency
Delivery fee depends on distance, so always pass selected addressId when validating coupon and when fetching final cart bill.

## 7. Edge Cases to Handle

- Coupon expired/not active
- Coupon not valid for restaurant
- Min order not met
- User usage limit reached
- Global usage limit reached
- Time/day restriction failed
- Cart changed after coupon applied (re-fetch cart bill)

## 8. Known Backend Notes

- There is no dedicated remove-coupon endpoint currently.
- To remove coupon in UI flow, clear coupon input and refresh cart state (or replace with another coupon).
- paymentMethods field exists in coupon model, but current validator does not enforce payment-method restriction.

## 9. Suggested Frontend Integration Sequence

1. User enters coupon code on cart.
2. Call POST /api/cart/validate-coupon with couponCode and selected addressId.
3. If valid=true, update UI from returned bill.
4. Keep rendering totals from GET /api/cart bill (single source of truth).
5. At checkout, re-fetch GET /api/cart to avoid stale pricing.
6. Place order.
7. For final invoice-like details, read order details paymentBreakdown.
