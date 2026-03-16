# Banner User App Integration Guide

This document explains how mobile/web clients should consume banner APIs and navigate on click.

## Endpoints

- Fetch active banners: `GET /api/banners`
- Track click analytics: `POST /api/banner/click/:bannerId`

Notes:
- `GET /api/banners` returns only active banners sorted by `position ASC`
- Click tracking endpoint expects authenticated user context

## Banner Fetch Response Shape

Response is an array:

```json
[
  {
    "_id": "65f1b5d6cc9f0f0012ab3490",
    "title": "Best Restaurant Deals",
    "image": "https://cdn.example.com/banner1.jpg",
    "type": "restaurant",
    "targetId": "65f1b5d6cc9f0f0012ab3411",
    "targetModel": "Restaurant",
    "externalUrl": null,
    "navigationType": "restaurant"
  }
]
```

Returned fields:
- `_id`
- `title`
- `image`
- `type`
- `targetId`
- `targetModel`
- `externalUrl`
- `navigationType`

## Navigation Rules

Use `navigationType` as the source of truth.

### restaurant

- Navigate to restaurant detail page
- Use `targetId` as restaurant id

### product

- Navigate to product detail page
- Use `targetId` as product id

### category

- Navigate to category listing page
- Use `targetId` as category id

### external

- Open `externalUrl` in external browser/webview

### none

- No navigation action

## Suggested Client Handler

```ts
function onBannerClick(banner) {
  if (!banner) return;

  // Fire and forget analytics call
  fetch(`/api/banner/click/${banner._id}`, { method: 'POST', headers: authHeaders });

  switch (banner.navigationType) {
    case 'restaurant':
      navigateToRestaurant(banner.targetId);
      break;
    case 'product':
      navigateToProduct(banner.targetId);
      break;
    case 'category':
      navigateToCategory(banner.targetId);
      break;
    case 'external':
      if (banner.externalUrl) openExternalLink(banner.externalUrl);
      break;
    default:
      // static banner, no-op
      break;
  }
}
```

## Click Tracking API Response

Success:

```json
{
  "message": "Banner click tracked",
  "data": {
    "bannerId": "65f1b5d6cc9f0f0012ab3490",
    "userId": "65f1b5d6cc9f0f0012ab1111",
    "clickedAt": "2026-03-16T12:00:00.000Z"
  }
}
```

## Fallback Notes

- If `navigationType` is missing (older data), treat as `none`
- If `navigationType` is `external` and `externalUrl` is empty, do not navigate
- If `targetId` is missing for internal navigation types, ignore click
