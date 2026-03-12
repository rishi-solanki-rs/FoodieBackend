# Wallet Recharge — Frontend Integration Guide

> **Backend stack:** Node.js · Express · MongoDB · Razorpay  
> **Base URL:** `https://<your-api-domain>/api`  
> All endpoints require a valid **JWT Bearer token** in the `Authorization` header.

---

## Table of Contents

1. [Overview](#overview)
2. [Environment Variables Needed](#environment-variables-needed)
3. [Step-by-Step Flow](#step-by-step-flow)
4. [API Reference](#api-reference)
   - [Create Recharge Order](#1-create-recharge-order)
   - [Verify Payment](#2-verify-payment)
   - [Get Wallet Balance & History](#3-get-wallet-balance--history)
5. [Complete Code Example (React / React Native)](#complete-code-example)
6. [Error Reference](#error-reference)
7. [Security Notes](#security-notes)

---

## Overview

Wallet top-up uses a **two-step Razorpay flow**:

```
1. Your app  →  POST /wallet/create-recharge-order   →  Backend creates Razorpay order
2. Razorpay checkout popup opens on the user's device
3. User completes payment
4. Your app  →  POST /wallet/verify-payment          →  Backend verifies signature & credits wallet
```

> ⚠️ **Never** send the wallet credit directly from the frontend. The backend only credits the wallet **after** cryptographic signature verification.

---

## Environment Variables Needed

You only need the **public** Razorpay key on the frontend:

| Variable | Where to get it |
|----------|----------------|
| `RAZORPAY_KEY_ID` | Returned by the `/create-recharge-order` API response as `keyId` |

Do **not** store `RAZORPAY_KEY_SECRET` in the frontend — it lives only on the backend.

---

## Step-by-Step Flow

```
User taps "Add Money"
        │
        ▼
Enter amount (₹1 – ₹1,00,000)
        │
        ▼
POST /wallet/create-recharge-order  ◄── Step 1
        │
        ▼
Receive { razorpayOrderId, amount, currency, keyId }
        │
        ▼
Open Razorpay Checkout popup with above details
        │
        ▼
User completes / cancels payment
        │
   ┌────┴────┐
 Success   Cancel / Failure
   │              │
   ▼          Show error
POST /wallet/verify-payment  ◄── Step 2
 { razorpay_order_id,
   razorpay_payment_id,
   razorpay_signature }
        │
        ▼
Backend verifies signature → credits wallet
        │
        ▼
Receive { newBalance } → refresh UI
```

---

## API Reference

### 1. Create Recharge Order

**`POST /api/wallet/create-recharge-order`**

Creates a Razorpay order on the backend and returns the details needed to open the Razorpay checkout popup.

#### Request Headers

```
Authorization: Bearer <jwt_token>
Content-Type: application/json
```

#### Request Body

```json
{
  "amount": 500
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `amount` | number | ✅ | Top-up amount in **INR** (₹1 – ₹1,00,000) |

#### Success Response — `201 Created`

```json
{
  "success": true,
  "orderId": "6604abc123def456",
  "razorpayOrderId": "order_PQRxyz123456",
  "amount": 50000,
  "currency": "INR",
  "keyId": "rzp_test_XXXXXXXXXXXXXXXX"
}
```

| Field | Type | Description |
|-------|------|-------------|
| `orderId` | string | Internal DB order ID (not used in the popup) |
| `razorpayOrderId` | string | Pass this to the Razorpay checkout as `order_id` |
| `amount` | number | Amount in **paise** (₹500 = 50000 paise) — pass directly to Razorpay |
| `currency` | string | Always `"INR"` |
| `keyId` | string | Your Razorpay public key — pass as `key` to the Razorpay checkout |

#### Error Responses

| Status | Message |
|--------|---------|
| `400` | `"Amount must be between ₹1 and ₹100000"` |
| `401` | `"Not authorized, token failed"` |
| `404` | `"User not found"` |
| `500` | Server error message |

---

### 2. Verify Payment

**`POST /api/wallet/verify-payment`**

Call this immediately after Razorpay's `handler` callback fires (successful payment). The backend verifies the HMAC-SHA256 signature and credits the wallet exactly once.

#### Request Headers

```
Authorization: Bearer <jwt_token>
Content-Type: application/json
```

#### Request Body

```json
{
  "razorpay_order_id": "order_PQRxyz123456",
  "razorpay_payment_id": "pay_ABCdef789012",
  "razorpay_signature": "abc123...hex_string"
}
```

> All three values come directly from Razorpay's `handler` callback object — do **not** alter them.

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `razorpay_order_id` | string | ✅ | Razorpay order ID from Step 1 |
| `razorpay_payment_id` | string | ✅ | Provided by Razorpay after payment |
| `razorpay_signature` | string | ✅ | HMAC signature provided by Razorpay |

#### Success Response — `200 OK`

```json
{
  "success": true,
  "message": "Wallet recharged successfully",
  "amount": 500,
  "newBalance": 1050.00
}
```

| Field | Type | Description |
|-------|------|-------------|
| `amount` | number | Amount credited (INR) |
| `newBalance` | number | User's updated wallet balance (INR) |

#### Error Responses

| Status | Message |
|--------|---------|
| `400` | `"razorpay_order_id, razorpay_payment_id, and razorpay_signature are required"` |
| `400` | `"Payment signature verification failed"` — tampered data, do not retry |
| `404` | `"Recharge order not found"` |
| `500` | Server error message |

---

### 3. Get Wallet Balance & History

**`GET /api/wallet/`**

Returns the current wallet balance and recent transaction history for the logged-in user.

#### Request Headers

```
Authorization: Bearer <jwt_token>
```

#### Success Response — `200 OK`

```json
{
  "balance": 1050.00,
  "history": [
    {
      "id": "txn_001",
      "amount": 500,
      "type": "credit",
      "source": "recharge",
      "description": "Wallet recharge via Razorpay",
      "status": "completed",
      "createdAt": "2026-03-12T10:30:00.000Z"
    },
    {
      "id": "txn_002",
      "amount": 250,
      "type": "debit",
      "source": "order_payment",
      "description": "Order #A3F9 Payment",
      "status": "completed",
      "createdAt": "2026-03-11T18:15:00.000Z"
    }
  ]
}
```

#### Transaction `source` values

| Value | Meaning |
|-------|---------|
| `recharge` | Wallet top-up via Razorpay |
| `order_payment` | Deducted for placing an order |
| `refund` | Refund credited back |
| `payout` | Rider / restaurant payout |
| `admin_credit` | Manual credit by admin |
| `admin_debit` | Manual debit by admin |

---

## Complete Code Example

### React (Web) — using `razorpay` npm package or CDN Script

```jsx
// Install: npm install razorpay  (or load via CDN <script src="https://checkout.razorpay.com/v1/checkout.js">)

import axios from 'axios';

const API = axios.create({
  baseURL: 'https://<your-api-domain>/api',
  headers: { Authorization: `Bearer ${localStorage.getItem('token')}` },
});

async function handleWalletRecharge(amountInRupees) {
  try {
    // ── STEP 1: Create Razorpay order ──────────────────────────────
    const { data } = await API.post('/wallet/create-recharge-order', {
      amount: amountInRupees,
    });

    const { razorpayOrderId, amount, currency, keyId } = data;

    // ── STEP 2: Open Razorpay Checkout ────────────────────────────
    const options = {
      key: keyId,
      amount,                       // in paise — already correct from backend
      currency,
      name: 'Foodie',
      description: 'Wallet Recharge',
      order_id: razorpayOrderId,

      handler: async function (response) {
        // ── STEP 3: Verify payment on backend ──────────────────────
        const verify = await API.post('/wallet/verify-payment', {
          razorpay_order_id: response.razorpay_order_id,
          razorpay_payment_id: response.razorpay_payment_id,
          razorpay_signature: response.razorpay_signature,
        });

        if (verify.data.success) {
          alert(`✅ ₹${amountInRupees} added! New balance: ₹${verify.data.newBalance}`);
          // TODO: refresh wallet balance in your state/store
        }
      },

      prefill: {
        name: 'User Name',          // pre-fill from your user state
        email: 'user@example.com',
        contact: '9999999999',
      },

      theme: { color: '#F97316' },  // your brand colour

      modal: {
        ondismiss: () => {
          console.log('User closed the Razorpay popup without paying');
        },
      },
    };

    const rzp = new window.Razorpay(options);
    rzp.open();

  } catch (error) {
    const message = error.response?.data?.message || error.message;
    alert(`Payment failed: ${message}`);
  }
}
```

---

### React Native — using `react-native-razorpay`

```js
// Install: npm install react-native-razorpay

import RazorpayCheckout from 'react-native-razorpay';
import axios from 'axios';

const API = axios.create({
  baseURL: 'https://<your-api-domain>/api',
  headers: { Authorization: `Bearer ${userToken}` },
});

async function handleWalletRecharge(amountInRupees) {
  try {
    // ── STEP 1: Create Razorpay order ──────────────────────────────
    const { data } = await API.post('/wallet/create-recharge-order', {
      amount: amountInRupees,
    });

    const { razorpayOrderId, amount, currency, keyId } = data;

    // ── STEP 2: Open Razorpay Checkout ────────────────────────────
    const options = {
      key: keyId,
      amount: String(amount),       // string in paise
      currency,
      name: 'Foodie',
      description: 'Wallet Recharge',
      order_id: razorpayOrderId,
      prefill: {
        name: 'User Name',
        email: 'user@example.com',
        contact: '9999999999',
      },
      theme: { color: '#F97316' },
    };

    const paymentResponse = await RazorpayCheckout.open(options);

    // ── STEP 3: Verify payment on backend ──────────────────────────
    const verify = await API.post('/wallet/verify-payment', {
      razorpay_order_id: paymentResponse.razorpay_order_id,
      razorpay_payment_id: paymentResponse.razorpay_payment_id,
      razorpay_signature: paymentResponse.razorpay_signature,
    });

    if (verify.data.success) {
      Alert.alert('Success', `₹${amountInRupees} added!\nNew balance: ₹${verify.data.newBalance}`);
      // TODO: refresh wallet balance in your state/store
    }

  } catch (error) {
    if (error.code === 'PAYMENT_CANCELLED') {
      console.log('User cancelled the payment');
    } else {
      const message = error.response?.data?.message || error.message;
      Alert.alert('Payment Failed', message);
    }
  }
}
```

---

## Error Reference

| Scenario | What to show the user |
|----------|-----------------------|
| `400 Amount must be between…` | "Please enter an amount between ₹1 and ₹1,00,000" |
| `400 Payment signature verification failed` | "Payment could not be verified. Please contact support." (do **not** retry silently) |
| `401 Not authorized` | Redirect to login screen |
| `404 Recharge order not found` | "Session expired. Please try again." |
| User closes Razorpay popup | "Recharge cancelled." (no API call needed) |
| Network error on verify step | Show retry button — calling `/verify-payment` again is safe (idempotent) |

---

## Security Notes

1. **Never credit the wallet from the frontend.** Only the backend does this, after signature verification.
2. **Do not store `RAZORPAY_KEY_SECRET`** anywhere in the app or app bundle.
3. The `razorpay_signature` must be passed **exactly as received** from Razorpay — any modification will fail verification.
4. If the app crashes between Razorpay success and the `/verify-payment` call, the backend **webhook** (`payment.captured`) will automatically credit the wallet as a safety net. The credit is **idempotent** — even if both verify and webhook fire, the wallet is only credited once.
5. Always call `/verify-payment` over HTTPS.
