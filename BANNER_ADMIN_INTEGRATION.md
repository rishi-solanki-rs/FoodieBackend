# Banner Admin Integration Guide

This document explains how the admin panel should create and manage banners after backend navigation enhancements.

## Base Admin Endpoints

- Create banner: `POST /api/admin/banner`
- List banners: `GET /api/admin/banner`
- Get one banner: `GET /api/admin/banner/:id`
- Update banner: `PUT /api/admin/banner/:id`
- Delete banner: `DELETE /api/admin/banner/:id`

All admin endpoints require admin authentication.

## Supported Banner Types

- `restaurant`
- `item`
- `category`
- `external`
- `static`

## Required Fields by Type

### 1) Restaurant Banner

Required:
- `type = "restaurant"`
- `targetModel = "Restaurant"`
- `targetId = <restaurantId>`

Backend validation:
- Restaurant must exist
- Restaurant must be approved and active
- Restaurant must not be temporarily closed

### 2) Item Banner

Required:
- `type = "item"`
- `targetModel = "Product"`
- `targetId = <productId>`

Backend validation:
- Product must exist
- Product must be available
- Product's restaurant must be approved and active

### 3) Category Banner

Required:
- `type = "category"`
- `targetModel = "Category"`
- `targetId = <categoryId>`

Backend validation:
- Category must exist

### 4) External Banner

Required:
- `type = "external"`
- `externalUrl = <https://...>`

Notes:
- `targetId` and `targetModel` are ignored for external banners

### 5) Static Banner

Required:
- `type = "static"`

Notes:
- No navigation target needed
- `navigationType` becomes `none`

## Common Fields

- `title` (required)
- `image` (required URL or uploaded file)
- `position` (optional, numeric, lower shows earlier)
- `isActive` (optional, default true)

## Request Examples

### Create Restaurant Banner

```json
{
  "title": "Weekend Restaurant Offer",
  "type": "restaurant",
  "targetModel": "Restaurant",
  "targetId": "65f1b5d6cc9f0f0012ab3411",
  "position": 1,
  "isActive": true
}
```

### Create Item Banner

```json
{
  "title": "Top Selling Burger",
  "type": "item",
  "targetModel": "Product",
  "targetId": "65f1b5d6cc9f0f0012ab3412",
  "position": 2
}
```

### Create Category Banner

```json
{
  "title": "Pizza Category",
  "type": "category",
  "targetModel": "Category",
  "targetId": "65f1b5d6cc9f0f0012ab3413",
  "position": 3
}
```

### Create External Banner

```json
{
  "title": "Visit Partner Site",
  "type": "external",
  "externalUrl": "https://example.com/deal",
  "position": 4
}
```

### Create Static Banner

```json
{
  "title": "Festival Creative",
  "type": "static",
  "position": 5
}
```

## Validation Error Examples

- `targetModel must be Restaurant for restaurant banner`
- `Restaurant not available for banner`
- `targetModel must be Product for item banner`
- `Product not available for banner`
- `targetModel must be Category for category banner`
- `Category not found for banner`
- `externalUrl is required for external banner`

## Data Persisted Per Banner

Backend stores:
- `title`
- `image`
- `type`
- `targetId`
- `targetModel`
- `externalUrl`
- `navigationType`
- `isActive`
- `position`
