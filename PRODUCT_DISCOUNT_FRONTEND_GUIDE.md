# Product Discount System — Frontend Integration Guide

> **Backend stack:** Node.js · Express · MongoDB · Mongoose  
> **Base URL:** `https://<your-api-domain>/api`  
> All protected endpoints require a valid **JWT Bearer token** in the `Authorization` header.

---

## Table of Contents

1. [Overview](#overview)
2. [Discount Types](#discount-types)
3. [Who Can Set What](#who-can-set-what)
4. [API Reference — Restaurant Owner](#api-reference--restaurant-owner)
   - [Create Product with Discount](#1-create-product-with-discount)
   - [Edit Product Discount](#2-edit-product-discount)
   - [Bulk Update Discount](#3-bulk-update-discount)
5. [API Reference — Admin](#api-reference--admin)
   - [Set Admin Discount on a Product](#4-set-admin-discount-on-a-product)
   - [Approve Product / Menu (applies pending discount)](#5-approve-product--menu)
6. [API Reference — Customer App](#api-reference--customer-app)
   - [Get Restaurant Menu](#6-get-restaurant-menu)
7. [Discount Fields in API Responses](#discount-fields-in-api-responses)
8. [Final Discount Calculation Logic](#final-discount-calculation-logic)
9. [UI Display Rules](#ui-display-rules)
10. [Complete Code Examples](#complete-code-examples)
11. [Error Reference](#error-reference)

---

## Overview

The product discount system supports **two independent discount types**:

| Type | Set by | Goes through approval? | Field name |
|------|--------|------------------------|------------|
| **Restaurant Discount** | Restaurant owner | ✅ Yes — goes to `pendingUpdate` | `restaurantDiscount` |
| **Admin Discount** | Admin only | ❌ No — applied immediately | `adminDiscount` |

The customer app always receives a pre-computed `finalDiscount` and `discountTag` (e.g. `"10% OFF"`) — no calculation needed on the frontend.

---

## Discount Types

Both discounts support two modes:

| Mode | `type` value | Example | Display |
|------|-------------|---------|---------|
| Percentage | `"percent"` | `10` | `"10% OFF"` |
| Flat amount | `"flat"` | `20` | `"₹20 OFF"` |

### Validation Rules

- `value` must be a **non-negative number**
- `type: "percent"` → `value` must be **≤ 100**
- `type: "flat"` → no upper limit (platform may want to add one in UI)
- Setting `value: 0` deactivates the discount automatically

---

## Who Can Set What

```
Restaurant Owner  →  can set/update restaurantDiscount
                  →  cannot touch adminDiscount (backend ignores it even if sent)

Admin             →  can set/update adminDiscount via dedicated endpoint
                  →  cannot directly modify restaurantDiscount (read-only for admin)

Customer          →  read-only (receives finalDiscount, discountTag)
```

---

## API Reference — Restaurant Owner

### 1. Create Product with Discount

**`POST /api/menu/item`**  
Creates a new menu item. `restaurantDiscount` is optional.

#### Request Headers

```
Authorization: Bearer <restaurant_owner_jwt>
Content-Type: multipart/form-data   (if uploading image)
             OR application/json    (if no image)
```

#### Request Body

```json
{
  "categoryId": "6604abc123def456",
  "name": { "en": "Malai Chaap", "de": "Malai Chaap", "ar": "مالاي تشاب" },
  "description": { "en": "Creamy grilled chaap" },
  "basePrice": 449,
  "quantity": "1 plate",
  "unit": "piece",
  "gstPercent": 5,
  "restaurantDiscount": {
    "type": "percent",
    "value": 10
  }
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `categoryId` | string | ✅ | Must be a valid active FoodCategory ID |
| `name.en` | string | ✅ | English product name |
| `basePrice` | number | ✅ | Price in INR |
| `gstPercent` | number | — | One of: `0, 5, 12, 18`. Default: `5` |
| `restaurantDiscount` | object | — | Optional. See structure below |
| `restaurantDiscount.type` | string | — | `"percent"` or `"flat"` |
| `restaurantDiscount.value` | number | — | Discount value |

#### Success Response — `201 Created`

```json
{
  "message": "Food Item added successfully. Awaiting admin approval.",
  "product": { "_id": "...", "name": {...}, "basePrice": 449, "restaurantDiscount": {...} },
  "status": "pending_approval"
}
```

> The product is not visible to customers until admin approves it.

---

### 2. Edit Product Discount

**`PUT /api/menu/item/:id`**

Updates a product. If the product is **already approved**, discount changes go to `pendingUpdate` and wait for admin re-approval. If the product is **not yet approved**, changes apply directly.

#### Request Body

```json
{
  "restaurantDiscount": {
    "type": "flat",
    "value": 30
  }
}
```

To **remove** the restaurant discount, set `value: 0`:

```json
{
  "restaurantDiscount": {
    "type": "percent",
    "value": 0
  }
}
```

#### Success Responses

**If product was already approved (goes to queue):**
```json
{
  "message": "Product updated and sent for admin approval. Current menu unaffected.",
  "status": "pending_approval"
}
```

**If product was not yet approved (applied directly):**
```json
{
  "message": "Product updated",
  "product": { ... }
}
```

---

### 3. Bulk Update Discount

**`PUT /api/menu/bulk/items`**

Update `restaurantDiscount` on multiple products at once.

#### Request Body

```json
{
  "updates": [
    {
      "productId": "6604abc001",
      "restaurantDiscount": { "type": "percent", "value": 15 }
    },
    {
      "productId": "6604abc002",
      "restaurantDiscount": { "type": "percent", "value": 0 }
    }
  ]
}
```

#### Success Response — `200 OK`

```json
{
  "message": "Bulk update completed",
  "results": [
    { "productId": "6604abc001", "status": "pending_approval" },
    { "productId": "6604abc002", "status": "pending_approval" }
  ]
}
```

Possible `status` values per item:

| Status | Meaning |
|--------|---------|
| `pending_approval` | Product was approved — changes queued for admin review |
| `updated` | Product was not yet approved — changes applied directly |
| `not_found` | Product ID not found or doesn't belong to this restaurant |
| `invalid_payload` | Missing required fields |

---

## API Reference — Admin

### 4. Set Admin Discount on a Product

**`PUT /api/admin/products/:id/discount`**

Admin-only. Sets or removes the `adminDiscount` on a product. Takes effect **immediately** without going through the approval queue.

#### Request Headers

```
Authorization: Bearer <admin_jwt>
Content-Type: application/json
```

#### Request Body

```json
{
  "type": "percent",
  "value": 20,
  "reason": "Holi festival offer",
  "active": true
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `type` | string | — | `"percent"` or `"flat"`. Default: `"percent"` |
| `value` | number | ✅ | Discount value. Set `0` to remove |
| `reason` | string | — | Internal note for the campaign |
| `active` | boolean | — | Override active flag. Defaults to `value > 0` |

**To remove admin discount:**

```json
{ "value": 0 }
```
or:
```json
{ "active": false }
```

#### Success Response — `200 OK`

```json
{
  "success": true,
  "message": "Admin discount of 20% set on product",
  "productId": "6604abc123",
  "productName": "Malai Chaap",
  "adminDiscount": {
    "type": "percent",
    "value": 20,
    "reason": "Holi festival offer",
    "active": true,
    "setAt": "2026-03-12T10:00:00.000Z",
    "setBy": "<admin_user_id>"
  }
}
```

---

### 5. Approve Product / Menu

When admin approves a product that has a **pending `restaurantDiscount`** change, the discount is automatically applied as part of the approval.

**`PUT /api/admin/products/:id/approve`**

```json
{
  "approved": true,
  "notes": "Looks good"
}
```

**`PUT /api/admin/restaurants/:id/approve-menu`**

```json
{
  "approved": true,
  "notes": "Full menu approved"
}
```

No extra fields needed — `restaurantDiscount` from `pendingUpdate` is merged automatically.

---

## API Reference — Customer App

### 6. Get Restaurant Menu

**`GET /api/menu/:restaurantId`**  
Public. No auth required.

#### Success Response — `200 OK`

```json
{
  "menu": {
    "Starters": [
      {
        "_id": "6604abc123",
        "name": "Malai Chaap",
        "basePrice": 449,
        "restaurantDiscount": { "type": "percent", "value": 10 },
        "adminDiscount": { "type": "percent", "value": 20, "reason": "Holi festival offer" },
        "finalDiscount": 20,
        "finalDiscountType": "percent",
        "discountSource": "admin",
        "discountTag": "20% OFF",
        "unit": "piece",
        "variations": [],
        "addOns": [],
        "available": true
      }
    ]
  },
  "menuByCategoryId": { ... },
  "categories": [ ... ]
}
```

---

## Discount Fields in API Responses

| Field | Type | Description |
|-------|------|-------------|
| `restaurantDiscount` | object \| null | Active restaurant discount, or `null` if none |
| `restaurantDiscount.type` | string | `"percent"` or `"flat"` |
| `restaurantDiscount.value` | number | Discount value |
| `adminDiscount` | object \| null | Active admin discount, or `null` if none |
| `adminDiscount.type` | string | `"percent"` or `"flat"` |
| `adminDiscount.value` | number | Discount value |
| `adminDiscount.reason` | string | Campaign/reason text (can be shown to user) |
| `finalDiscount` | number | **The discount to apply in price calculations** |
| `finalDiscountType` | string | `"percent"` or `"flat"` |
| `discountSource` | string \| null | `"admin"`, `"restaurant"`, or `null` |
| `discountTag` | string \| null | Ready-to-display tag e.g. `"20% OFF"`, `"₹30 OFF"` |

---

## Final Discount Calculation Logic

The backend uses this priority rule (both computed server-side):

```
1. If both adminDiscount and restaurantDiscount are active:
      → show the HIGHER value
2. If only adminDiscount is active:
      → use adminDiscount
3. If only restaurantDiscount is active:
      → use restaurantDiscount
4. If neither is active:
      → finalDiscount = 0, discountTag = null
```

### Price Calculation for Frontend

Use `finalDiscount` and `finalDiscountType` from the API to compute the display price:

```js
function getDiscountedPrice(basePrice, finalDiscount, finalDiscountType) {
  if (!finalDiscount || finalDiscount <= 0) return basePrice;

  if (finalDiscountType === 'percent') {
    return basePrice - (basePrice * finalDiscount) / 100;
  } else {
    // flat discount
    return Math.max(0, basePrice - finalDiscount);
  }
}

// Example
const displayPrice = getDiscountedPrice(449, 20, 'percent'); // → 359.2
```

---

## UI Display Rules

### Menu Card (Customer App)

```
┌─────────────────────────────┐
│  [Product Image]            │
│  Malai Chaap          ←name │
│  ₹359  ~~₹449~~       ←strikethrough original, show discounted │
│  [20% OFF]            ←discountTag badge │
└─────────────────────────────┘
```

**Render logic:**

```jsx
{item.discountTag && (
  <span className="discount-badge">{item.discountTag}</span>
)}

<span className="price-discounted">
  ₹{getDiscountedPrice(item.basePrice, item.finalDiscount, item.finalDiscountType).toFixed(0)}
</span>

{item.finalDiscount > 0 && (
  <span className="price-original" style={{ textDecoration: 'line-through' }}>
    ₹{item.basePrice}
  </span>
)}
```

### Admin Discount Badge vs Restaurant Discount Badge

If you want to differentiate visually:

```jsx
{item.discountSource === 'admin' && (
  <span className="badge badge-admin">
    {item.adminDiscount.reason || 'Special Offer'} — {item.discountTag}
  </span>
)}

{item.discountSource === 'restaurant' && (
  <span className="badge badge-restaurant">
    {item.discountTag}
  </span>
)}
```

### Restaurant Owner — Discount Form

Show a simple toggle + input, and indicate the pending-approval state:

```jsx
<form onSubmit={handleSubmit}>
  <label>Discount Type</label>
  <select name="type" value={form.type} onChange={handleChange}>
    <option value="percent">Percent (%)</option>
    <option value="flat">Flat (₹)</option>
  </select>

  <label>Discount Value</label>
  <input
    type="number"
    name="value"
    min={0}
    max={form.type === 'percent' ? 100 : undefined}
    value={form.value}
    onChange={handleChange}
  />

  <button type="submit">Save (Requires Admin Approval)</button>
</form>

{product.pendingUpdate?.restaurantDiscount && (
  <p className="info">⏳ Discount change pending admin approval</p>
)}
```

---

## Complete Code Examples

### React — Create Product with Discount

```jsx
import axios from 'axios';

const API = axios.create({
  baseURL: 'https://<your-api-domain>/api',
  headers: { Authorization: `Bearer ${localStorage.getItem('token')}` },
});

async function createProduct(formData) {
  const payload = {
    categoryId: formData.categoryId,
    name: { en: formData.name },
    description: { en: formData.description },
    basePrice: Number(formData.basePrice),
    quantity: formData.quantity,
    gstPercent: Number(formData.gstPercent),
    // Optional restaurant discount
    ...(formData.discountValue > 0 && {
      restaurantDiscount: {
        type: formData.discountType,   // "percent" or "flat"
        value: Number(formData.discountValue),
      },
    }),
  };

  const { data } = await API.post('/menu/item', payload);
  // data.status === "pending_approval"
  return data;
}
```

---

### React — Edit Restaurant Discount

```jsx
async function updateDiscount(productId, type, value) {
  const { data } = await API.put(`/menu/item/${productId}`, {
    restaurantDiscount: { type, value: Number(value) },
  });

  if (data.status === 'pending_approval') {
    alert('Discount update submitted for admin approval.');
  } else {
    alert('Discount updated successfully.');
  }
}

// To remove discount:
// updateDiscount(productId, 'percent', 0);
```

---

### React — Admin Set Discount

```jsx
async function setAdminDiscount(productId, type, value, reason) {
  const { data } = await API.put(`/admin/products/${productId}/discount`, {
    type,                    // "percent" or "flat"
    value: Number(value),
    reason,                  // e.g. "Weekend sale"
    active: value > 0,
  });

  alert(data.message); // "Admin discount of 20% set on product"
}

// To remove:
// setAdminDiscount(productId, 'percent', 0, '');
```

---

### React — Render Menu with Discounts

```jsx
function MenuItemCard({ item }) {
  const discountedPrice = item.finalDiscount > 0
    ? item.finalDiscountType === 'percent'
      ? item.basePrice - (item.basePrice * item.finalDiscount) / 100
      : Math.max(0, item.basePrice - item.finalDiscount)
    : item.basePrice;

  return (
    <div className="menu-card">
      {item.image && <img src={item.image} alt={item.name.en || item.name} />}

      <div className="menu-card-body">
        <h3>{item.name.en || item.name}</h3>
        <p>{item.description?.en || ''}</p>

        <div className="price-row">
          <span className="price">₹{discountedPrice.toFixed(0)}</span>
          {item.finalDiscount > 0 && (
            <span className="price-original">₹{item.basePrice}</span>
          )}
          {item.discountTag && (
            <span className={`badge ${item.discountSource === 'admin' ? 'badge-promo' : 'badge-restaurant'}`}>
              {item.discountTag}
            </span>
          )}
        </div>

        {item.discountSource === 'admin' && item.adminDiscount?.reason && (
          <p className="promo-reason">{item.adminDiscount.reason}</p>
        )}
      </div>
    </div>
  );
}
```

---

### React Native — Render Discount Badge

```jsx
import { View, Text, StyleSheet } from 'react-native';

function DiscountBadge({ item }) {
  if (!item.discountTag) return null;

  const badgeStyle = item.discountSource === 'admin'
    ? styles.adminBadge
    : styles.restaurantBadge;

  return (
    <View style={badgeStyle}>
      <Text style={styles.badgeText}>{item.discountTag}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  adminBadge:      { backgroundColor: '#E53E3E', borderRadius: 4, padding: 4 },
  restaurantBadge: { backgroundColor: '#38A169', borderRadius: 4, padding: 4 },
  badgeText:       { color: '#fff', fontSize: 11, fontWeight: 'bold' },
});
```

---

## Error Reference

| Endpoint | Status | Message | Fix |
|----------|--------|---------|-----|
| `POST /menu/item` | `400` | `"restaurantDiscount.value must be a non-negative number"` | Send a number ≥ 0 |
| `POST /menu/item` | `400` | `"restaurantDiscount percent cannot exceed 100%"` | Value must be ≤ 100 for percent type |
| `PUT /menu/item/:id` | `404` | `"Product not found"` | Wrong product ID or product doesn't belong to this restaurant |
| `PUT /admin/products/:id/discount` | `400` | `"Discount value must be a non-negative number"` | Send a number ≥ 0 |
| `PUT /admin/products/:id/discount` | `400` | `"Percent discount cannot exceed 100%"` | Value must be ≤ 100 |
| `PUT /admin/products/:id/discount` | `403` | Unauthorized | Token must have admin role |
| Any | `401` | `"Not authorized, token failed"` | Refresh JWT and retry |

---

## Pending Approval States Reference

When a restaurant owner edits a product that is already live (approved), all changes go to `pendingUpdate` and are not visible to customers until admin approves.

| `status` in response | Meaning | What to show restaurant owner |
|---------------------|---------|-------------------------------|
| `"pending_approval"` | Changes queued, not yet live | "Your changes are under review" |
| `"updated"` | Changes applied directly (product not yet approved) | "Changes saved" |

**Check if a product has a pending discount change:**

```js
// product.pendingUpdate?.restaurantDiscount exists
// → show a "Pending" indicator next to the discount field
```
