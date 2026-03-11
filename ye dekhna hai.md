# Frontend Integration Guide
> Last updated: March 11, 2026  
> Covers all backend changes made in the current development cycle.

---

## Table of Contents

1. [Authentication & OTP](#1-authentication--otp)
2. [Product Unit System](#2-product-unit-system)
3. [Multi-Party Billing System](#3-multi-party-billing-system)
4. [Admin Order Detail with Billing](#4-admin-order-detail-with-billing)
5. [Admin Order List — Billing Status Flag](#5-admin-order-list--billing-status-flag)

---

## 1. Authentication & OTP

### What Changed
- Mobile numbers are now **normalized to 10 digits** on the backend before saving to or querying the database.
- You can send `+919876543210`, `919876543210`, or `9876543210` — all three work identically.
- The backend rejects any number that doesn't match these formats with a `400` error.

### Registration Flow

#### Step 1 — Initiate Registration
```
POST /api/auth/register/initiate
```
**Request Body:**
```json
{
  "name": "Ravi Kumar",
  "email": "ravi@example.com",
  "password": "secure123",
  "mobile": "9876543210",
  "role": "customer"
}
```
- `role` is optional — defaults to `"customer"`. Allowed: `customer`, `restaurant_owner`, `rider`.
- `mobile` accepts `9876543210`, `+919876543210`, or `919876543210`.

**Success Response `200`:**
```json
{
  "message": "OTP sent to mobile. Verify to complete registration.",
  "mobile": "9876543210",
  "testOtp": "482910"
}
```
> **Note:** `testOtp` is included for development/testing. Remove dependency on it in production.

**Error Responses:**
| Status | Message |
|--------|---------|
| `400` | `"All fields are required"` |
| `400` | `"Invalid mobile number format. Use 10-digit or +91XXXXXXXXXX."` |
| `400` | `"User already registered. Please Login."` |
| `400` | `"Invalid role"` |

---

#### Step 2 — Verify OTP
```
POST /api/auth/register/verify
```
**Request Body:**
```json
{
  "mobile": "9876543210",
  "otp": "482910"
}
```

**Success Response `200`:**
```json
{
  "message": "Registration Verified & Logged In Successfully",
  "token": "<jwt>",
  "user": {
    "_id": "...",
    "name": "Ravi Kumar",
    "email": "ravi@example.com",
    "role": "customer"
  }
}
```

---

#### Resend OTP
```
POST /api/auth/resend-otp
```
**Request Body** (either field):
```json
{ "mobile": "9876543210" }
```
or
```json
{ "email": "ravi@example.com" }
```

**Success Response `200`:**
```json
{
  "message": "OTP resent successfully",
  "mobile": "9876543210",
  "email": "ravi@example.com",
  "testOtp": "123456",
  "expiresIn": "5 minutes"
}
```

---

#### Check Verification Status
```
POST /api/auth/check-verification-status
```
**Request Body:**
```json
{ "mobile": "9876543210" }
```

**Success Response `200`:**
```json
{
  "exists": true,
  "isVerified": false,
  "name": "Ravi Kumar",
  "email": "ravi@example.com",
  "mobile": "9876543210",
  "needsOTP": true,
  "message": "User needs OTP verification. Call resend-otp endpoint."
}
```

---

### Login
```
POST /api/auth/login
```
**Request Body:**
```json
{
  "mobile": "9876543210",
  "password": "secure123"
}
```
or use `email` instead of `mobile`.

**Success Response `200`:**
```json
{
  "token": "<jwt>",
  "message": "Login Successfully",
  "user": {
    "_id": "...",
    "name": "Ravi Kumar",
    "email": "ravi@example.com",
    "role": "customer",
    "restaurantId": null,
    "riderId": null
  }
}
```

> If `isVerified` is false: `401` with `{ "needsOTP": true, "nextStep": "..." }`

---

### Forgot Password Flow

#### Step 1 — Initiate
```
POST /api/auth/forgot-password
```
**Request Body:**
```json
{ "mobile": "9876543210" }
```

**Success Response `200`:**
```json
{
  "message": "Password reset OTP sent successfully",
  "mobile": "9876543210",
  "email": "ravi@example.com",
  "testOtp": "654321",
  "expiresIn": "10 minutes"
}
```

#### Step 2 — Verify OTP
```
POST /api/auth/forgot-password/verify-otp
```
```json
{
  "mobile": "9876543210",
  "otp": "654321"
}
```

**Success Response `200`:**
```json
{
  "message": "OTP verified successfully",
  "resetToken": "<short-lived-jwt>",
  "expiresIn": "15 minutes"
}
```

#### Step 3 — Reset Password
```
POST /api/auth/reset-password
```
```json
{
  "resetToken": "<resetToken from step 2>",
  "newPassword": "newSecure456"
}
```

#### Resend Forgot Password OTP
```
POST /api/auth/forgot-password/resend-otp
```
```json
{ "mobile": "9876543210" }
```

---

## 2. Product Unit System

### What Changed
Products and variations now support a `unit` field and quantity-based variations (e.g. 250g, 1kg, 500ml).

### Product Fields — New
| Field | Type | Allowed Values | Default |
|-------|------|---------------|---------|
| `unit` | String | `kg`, `gram`, `litre`, `ml`, `piece`, `packet`, `dozen` | `"piece"` |
| `quantity` | String | Free text (e.g. `"250ml"`, `"1 plate"`) | `""` |

### Variation Fields — New / Updated
Each variation inside `variations[]` now has:
| Field | Type | Notes |
|-------|------|-------|
| `name.en` | String | Optional — use for label-style variants (e.g. "Small", "Large") |
| `quantity` | Number | Optional — numeric quantity (e.g. `250`, `1`) |
| `unit` | String | One of the unit enums above |
| `price` | Number | **Required** |
| `stock` | Number | `null` = unlimited |

> A variation is valid if it has **either** a non-empty `name.en` **or** a numeric `quantity`. Both are optional but at least one must exist.

### Example — Adding a Product with Variations
```
POST /api/menu/add
Authorization: Bearer <restaurant_owner_token>
```
```json
{
  "name": { "en": "Fresh Juice" },
  "basePrice": 60,
  "unit": "ml",
  "quantity": "250ml",
  "gstPercent": 5,
  "variations": [
    { "quantity": 250, "unit": "ml", "price": 60 },
    { "quantity": 500, "unit": "ml", "price": 110 },
    { "quantity": 1000, "unit": "ml", "price": 200 }
  ]
}
```

### Example — Named Variation (e.g. size)
```json
{
  "name": { "en": "Biryani" },
  "basePrice": 180,
  "unit": "piece",
  "variations": [
    { "name": { "en": "Half" }, "price": 180 },
    { "name": { "en": "Full" }, "price": 340 }
  ]
}
```

### Product in API Response
The `unit` field is now included in all product responses:
```json
{
  "_id": "...",
  "name": { "en": "Fresh Juice" },
  "basePrice": 60,
  "unit": "ml",
  "quantity": "250ml",
  "variations": [
    { "quantity": 250, "unit": "ml", "price": 60 },
    { "quantity": 500, "unit": "ml", "price": 110 }
  ]
}
```

---

## 3. Multi-Party Billing System

### Overview
After every order is delivered and settled, the backend **automatically generates three billing records**:

| Bill | Who Sees It | What It Contains |
|------|------------|-----------------|
| `CustomerBill` | Customer | Itemised receipt with GST breakdown |
| `RestaurantBill` | Restaurant Owner | Earnings minus platform commission |
| `RiderBill` | Rider | Delivery earnings, incentive, tip |

Bills are generated **once per order** (idempotent). They appear only after the order reaches `delivered` status and payment is settled.

> **GST Note:** All GST is split equally as CGST and SGST (Indian intrastate standard). Each GST block has: `{ percent, base, total, cgst, sgst }`.

---

### 3.1 Customer Bill

#### Get Bill for an Order
```
GET /api/orders/:id/customer-bill
Authorization: Bearer <customer_token>
```

**Success Response `200`:**
```json
{
  "success": true,
  "bill": {
    "_id": "...",
    "order": {
      "_id": "...",
      "status": "delivered",
      "createdAt": "2026-03-11T10:00:00.000Z",
      "deliveredAt": "2026-03-11T10:45:00.000Z",
      "paymentMethod": "online"
    },
    "customer": "...",
    "restaurant": {
      "_id": "...",
      "name": "Veg Affair",
      "address": "...",
      "image": "..."
    },
    "itemsTotal": 340,
    "restaurantDiscount": 0,
    "platformDiscount": 20,
    "discountTotal": 20,
    "gstOnFood": {
      "percent": 5,
      "base": 320,
      "total": 16,
      "cgst": 8,
      "sgst": 8
    },
    "packagingCharge": 20,
    "gstOnPackaging": {
      "percent": 0,
      "base": 20,
      "total": 0,
      "cgst": 0,
      "sgst": 0
    },
    "platformFee": 10,
    "gstOnPlatform": {
      "percent": 18,
      "base": 10,
      "total": 1.8,
      "cgst": 0.9,
      "sgst": 0.9
    },
    "deliveryCharge": 30,
    "gstOnDelivery": {
      "percent": 18,
      "base": 30,
      "total": 5.4,
      "cgst": 2.7,
      "sgst": 2.7
    },
    "tip": 0,
    "totalGst": {
      "cgst": 11.6,
      "sgst": 11.6,
      "total": 23.2
    },
    "finalPayableAmount": 403.2,
    "paymentMethod": "online",
    "paymentStatus": "paid",
    "couponCode": "FIRST20",
    "generatedAt": "2026-03-11T10:46:00.000Z"
  }
}
```

**Error Responses:**
| Status | Message |
|--------|---------|
| `404` | `"Bill not yet generated for this order"` |
| `403` | `"Access denied"` (customer trying to view another user's bill) |

---

### 3.2 Restaurant Bill

#### Get Bill for an Order
```
GET /api/orders/:id/restaurant-bill
Authorization: Bearer <restaurant_owner_token>
```

**Success Response `200`:**
```json
{
  "success": true,
  "bill": {
    "_id": "...",
    "order": { "_id": "...", "status": "delivered", "paymentMethod": "online" },
    "restaurant": "...",
    "customer": "...",
    "itemsTotal": 340,
    "gstOnFood": { "percent": 5, "base": 340, "total": 17, "cgst": 8.5, "sgst": 8.5 },
    "restaurantDiscount": 0,
    "packagingCharge": 20,
    "gstOnPackaging": { "percent": 0, "base": 20, "total": 0, "cgst": 0, "sgst": 0 },
    "adminCommissionPercent": 15,
    "adminCommissionAmount": 54,
    "gstOnAdminCommission": { "percent": 18, "base": 54, "total": 9.72, "cgst": 4.86, "sgst": 4.86 },
    "restaurantNetEarning": 306,
    "generatedAt": "2026-03-11T10:46:00.000Z"
  }
}
```

**Formula:**
```
restaurantNetEarning = (itemsTotal + packagingCharge) - adminCommissionAmount
```

---

#### Restaurant Billing History (Paginated)
```
GET /api/orders/billing/restaurant-history?page=1&limit=20
Authorization: Bearer <restaurant_owner_token>
```

**Query Params:**
| Param | Default | Description |
|-------|---------|-------------|
| `page` | `1` | Page number |
| `limit` | `20` | Items per page |

**Success Response `200`:**
```json
{
  "success": true,
  "bills": [ ...RestaurantBill objects... ],
  "total": 53,
  "page": 1,
  "limit": 20
}
```

---

### 3.3 Rider Bill

#### Get Bill for an Order
```
GET /api/orders/:id/rider-bill
Authorization: Bearer <rider_token>
```

**Success Response `200`:**
```json
{
  "success": true,
  "bill": {
    "_id": "...",
    "order": { "_id": "...", "status": "delivered", "deliveredAt": "...", "paymentMethod": "cod" },
    "rider": "...",
    "restaurant": "...",
    "customer": "...",
    "deliveryCharge": 30,
    "platformFeeCredit": 0,
    "incentive": 5.1,
    "incentivePercent": 1.5,
    "tip": 10,
    "riderTotalEarning": 45.1,
    "paymentMethod": "cod",
    "cashCollected": 403.2,
    "generatedAt": "2026-03-11T10:46:00.000Z"
  }
}
```

**Formula:**
```
riderTotalEarning = deliveryCharge + platformFeeCredit + incentive + tip
```

---

#### Rider Billing History (Paginated)
```
GET /api/orders/billing/rider-history?page=1&limit=20
Authorization: Bearer <rider_token>
```

**Success Response `200`:**
```json
{
  "success": true,
  "bills": [ ...RiderBill objects... ],
  "total": 120,
  "page": 1,
  "limit": 20
}
```

---

### 3.4 Admin — All Bills for an Order
```
GET /api/orders/:id/bills
Authorization: Bearer <admin_token>
```

**Success Response `200`:**
```json
{
  "success": true,
  "bills": {
    "customerBill": { ...CustomerBill... },
    "restaurantBill": { ...RestaurantBill... },
    "riderBill": { ...RiderBill... }
  }
}
```

> Any bill will be `null` if not yet generated (e.g. `riderBill` is null for self-pickup orders with no rider).

---

## 4. Admin Order Detail with Billing

The admin order detail endpoint now returns the full order with all three billing records included.

```
GET /api/orders/admin/:id
Authorization: Bearer <admin_token>
```

**Success Response `200`:**
```json
{
  "success": true,
  "order": {
    "_id": "...",
    "status": "delivered",
    "totalAmount": 403.2,
    "paymentMethod": "online",
    "paymentStatus": "paid",
    "createdAt": "2026-03-11T10:00:00.000Z",
    "deliveredAt": "2026-03-11T10:45:00.000Z",

    "customer": {
      "_id": "...",
      "name": "Ravi Kumar",
      "email": "ravi@example.com",
      "mobile": "9876543210",
      "profilePic": "...",
      "walletBalance": 50,
      "totalOrders": 12
    },

    "restaurant": {
      "_id": "...",
      "name": "Veg Affair",
      "email": "restaurant@example.com",
      "contactNumber": "...",
      "address": "...",
      "city": "...",
      "image": "...",
      "adminCommission": 15,
      "packagingCharge": 20
    },

    "rider": {
      "_id": "...",
      "user": {
        "name": "Amit Rider",
        "email": "rider@example.com",
        "mobile": "9123456789",
        "profilePic": "..."
      },
      "vehicle": { ... },
      "rating": 4.8,
      "totalEarnings": 12000,
      "currentBalance": 340
    },

    "items": [
      {
        "product": {
          "_id": "...",
          "name": { "en": "Veg Biryani" },
          "image": "...",
          "basePrice": 180,
          "gstPercent": 5,
          "adminCommissionPercent": 15
        },
        "quantity": 2,
        "price": 180,
        "variationId": null
      }
    ],

    "timeline": [ ... ],
    "paymentBreakdown": { ... }
  },

  "billing": {
    "generated": true,
    "customerBill": { ...CustomerBill... },
    "restaurantBill": { ...RestaurantBill... },
    "riderBill": { ...RiderBill or null if no rider... }
  }
}
```

**Key fields in `billing`:**
| Field | Type | Notes |
|-------|------|-------|
| `generated` | Boolean | `true` if bills have been created for this order |
| `customerBill` | Object \| null | Full customer receipt |
| `restaurantBill` | Object \| null | Restaurant earnings record |
| `riderBill` | Object \| null | Rider earnings record; `null` for orders without a rider |

---

## 5. Admin Order List — Billing Status Flag

The admin order list now includes a `billingGenerated` boolean on each order object.

```
GET /api/orders/admin/all?page=1&limit=20&status=delivered
Authorization: Bearer <admin_token>
```

**Each order in the `orders[]` array now has:**
```json
{
  "_id": "...",
  "status": "delivered",
  "totalAmount": 403.2,
  "paymentMethod": "online",
  "createdAt": "2026-03-11T10:00:00.000Z",
  "billingGenerated": true
}
```

| Field | Type | Notes |
|-------|------|-------|
| `billingGenerated` | Boolean | `true` = all three bills exist. Use this to show a "View Bill" button in the list UI |

---

## GST Breakdown Object Reference

Every `gstOn*` field in all bills follows this schema:

```json
{
  "percent": 18,
  "base": 100,
  "total": 18,
  "cgst": 9,
  "sgst": 9
}
```

| Field | Description |
|-------|-------------|
| `percent` | GST rate applied (0, 5, 12, or 18) |
| `base` | The amount on which GST was calculated |
| `total` | `base × percent / 100` |
| `cgst` | Central GST = `total / 2` |
| `sgst` | State GST = `total / 2` |

---

## Authentication Header

All protected routes require:
```
Authorization: Bearer <jwt_token>
```

Role-based access summary:
| Role | Token From |
|------|-----------|
| `customer` | `/auth/login` or `/auth/register/verify` |
| `restaurant_owner` | `/auth/login` |
| `rider` | `/auth/login` |
| `admin` | `/auth/login` |

---

## Error Response Format

All API errors follow this format:
```json
{
  "message": "Human-readable error description"
}
```
Or for newer billing/order endpoints:
```json
{
  "success": false,
  "message": "Human-readable error description"
}
```

Common HTTP status codes:
| Code | Meaning |
|------|---------|
| `200` | Success |
| `400` | Bad request / validation error |
| `401` | Not authenticated |
| `403` | Forbidden (wrong role or not your resource) |
| `404` | Resource not found |
| `429` | Rate limited |
| `500` | Server error |
