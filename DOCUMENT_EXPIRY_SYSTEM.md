# Document Expiry Management System

## Overview
This system tracks document expiry dates for **Riders** and **Restaurants** and automatically flags documents that are expiring or have expired. It helps the admin panel identify which accounts need document renewal.

---

## Database Schema Updates

### Rider Model (`Backend/models/Rider.js`)

#### Documents with Expiry Tracking:
```javascript
documents: {
  // Driving License - REQUIRED & EXPIRES
  license: {
    frontImage: String,
    backImage: String,
    number: String,
    expiryDate: Date,      // ⭐ CRITICAL - License expiry date
    verifiedAt: Date,
    verifiedBy: ObjectId
  },

  // Registration Certificate - REQUIRED & EXPIRES
  rc: {
    number: String,
    image: String,
    expiryDate: Date,      // Vehicle registration validity
    verifiedAt: Date,
    verifiedBy: ObjectId
  },

  // Insurance - REQUIRED & EXPIRES
  insurance: {
    number: String,
    image: String,
    expiryDate: Date,      // Vehicle insurance validity
    verifiedAt: Date,
    verifiedBy: ObjectId
  },

  // PAN Card - Tax Identification
  panCard: {
    number: String,
    image: String,
    verifiedAt: Date,
    verifiedBy: ObjectId
  },

  // Aadhar Card - Identification Proof
  aadharCard: {
    number: String,
    image: String,
    verifiedAt: Date,
    verifiedBy: ObjectId
  },

  // Medical Certificate - EXPIRES
  medicalCertificate: {
    image: String,
    expiryDate: Date,      // Medical certificate validity period
    verifiedAt: Date,
    verifiedBy: ObjectId
  },

  // Policy Verification - EXPIRES
  policyVerification: {
    image: String,
    expiryDate: Date,      // Policy expiry date
    verifiedAt: Date,
    verifiedBy: ObjectId
  }
}

// Document Expiry Status Flags
documentsExpiryStatus: {
  licenseExpiring: Boolean,      // Expires within 30 days
  licenseExpired: Boolean,       // Has expired
  rcExpiring: Boolean,
  rcExpired: Boolean,
  insuranceExpiring: Boolean,
  insuranceExpired: Boolean,
  medicalExpiring: Boolean,
  medicalExpired: Boolean,
  policyExpiring: Boolean,
  policyExpired: Boolean,
  lastCheckedAt: Date            // When status was last verified
}
```

---

### Restaurant Model (`Backend/models/Restaurant.js`)

#### Documents with Expiry Tracking:
```javascript
documents: {
  // FSSAI Food Safety License - CRITICAL & EXPIRES
  license: {
    url: String,
    backUrl: String,
    number: String,
    expiry: Date,          // ⭐ CRITICAL - License expiry date
    verifiedAt: Date,
    verifiedBy: ObjectId
  },

  // PAN Card - Tax Identification
  pan: {
    url: String,
    number: String,
    verifiedAt: Date,
    verifiedBy: ObjectId
  },

  // GST Registration - TAX COMPLIANCE & EXPIRES
  gst: {
    url: String,
    number: String,
    expiryDate: Date,      // GST certificate validity
    verifiedAt: Date,
    verifiedBy: ObjectId
  }
}

// Document Expiry Status Flags
documentsExpiryStatus: {
  licenseExpiring: Boolean,      // FSSAI expires within 30 days
  licenseExpired: Boolean,       // FSSAI has expired
  gstExpiring: Boolean,
  gstExpired: Boolean,
  lastCheckedAt: Date            // When status was last verified
}
```

---

## Document Expiry Checker Utility

**Location:** `Backend/utils/documentExpiryChecker.js`

### Key Functions:

#### 1. **Check Expiry Status**
```javascript
checkExpiryStatus(expiryDate, warningDays = 30)
// Returns: { expired: boolean, expiring: boolean }
// Expiring: within 30 days before expiry date
// Expired: past the expiry date
```

#### 2. **Update Rider Document Status**
```javascript
updateRiderDocumentStatus(riderId)
// Checks all rider documents and updates documentsExpiryStatus flags
// Returns updated status object
```

#### 3. **Update Restaurant Document Status**
```javascript
updateRestaurantDocumentStatus(restaurantId)
// Checks all restaurant documents and updates documentsExpiryStatus flags
// Returns updated status object
```

#### 4. **Get All Riders with Expiring Docs**
```javascript
getRidersWithExpiringDocs()
// Returns array of riders with any expiring/expired documents
// Useful for admin dashboard alerts
```

#### 5. **Get All Restaurants with Expiring Docs**
```javascript
getRestaurantsWithExpiringDocs()
// Returns array of restaurants with expiring/expired documents
// Useful for admin dashboard alerts
```

#### 6. **Refresh All Riders Status** (Batch)
```javascript
refreshAllRidersDocumentStatus()
// Updates all riders' document status
// Returns { updated: number, failed: number }
```

#### 7. **Refresh All Restaurants Status** (Batch)
```javascript
refreshAllRestaurantsDocumentStatus()
// Updates all restaurants' document status
// Returns { updated: number, failed: number }
```

---

## Cron Jobs

### Daily Document Expiry Check (2 AM)
**Location:** `Backend/services/cronService.js`

Runs automatically every day at 2:00 AM:
- Calls `refreshAllRidersDocumentStatus()`
- Calls `refreshAllRestaurantsDocumentStatus()`
- Updates all `documentsExpiryStatus` flags in the database
- Logs results for monitoring

```javascript
// Runs at 02:00 AM every day
cron.schedule('0 2 * * *', async () => { ... });
```

---

## Admin Panel Implementation Guide

### 1. **Show Document Expiry Status in Rider List**
```javascript
// Check the documentsExpiryStatus flags:
if (rider.documentsExpiryStatus.licenseExpired) {
  // Show RED alert badge: "EXPIRED"
} else if (rider.documentsExpiryStatus.licenseExpiring) {
  // Show YELLOW alert badge: "EXPIRING SOON"
}
```

### 2. **Show Document Expiry Status in Restaurant List**
```javascript
// Check the documentsExpiryStatus flags:
if (restaurant.documentsExpiryStatus.licenseExpired) {
  // Show RED alert badge: "FSSAI EXPIRED"
  // Recommend account freeze
} else if (restaurant.documentsExpiryStatus.licenseExpiring) {
  // Show YELLOW alert badge: "FSSAI EXPIRING"
  // Recommend renewal
}
```

### 3. **Create an Admin Expiry Dashboard**
```javascript
// Query riders/restaurants with expiring documents:
const expiringRiders = await getRidersWithExpiringDocs();
const expiringRestaurants = await getRestaurantsWithExpiringDocs();

// Display in a dedicated dashboard with:
// - List of accounts needing attention
// - Days until expiry
// - Quick action buttons to contact/freeze accounts
```

### 4. **Export Functions for Controllers**

**Example Controller Usage:**
```javascript
// In a controller endpoint
const { getRidersWithExpiringDocs, getRestaurantsWithExpiringDocs } = require('../utils/documentExpiryChecker');

// GET /api/admin/documents/expiring
router.get('/expiring', async (req, res) => {
  const expiringRiders = await getRidersWithExpiringDocs();
  const expiringRestaurants = await getRestaurantsWithExpiringDocs();
  
  res.json({
    riders: expiringRiders,
    restaurants: expiringRestaurants,
    totalAlerts: expiringRiders.length + expiringRestaurants.length
  });
});
```

---

## Frontend Requirements

### Display Fields in Admin Panel:

#### For Riders:
- License Expiry Date
- RC Expiry Date
- Insurance Expiry Date
- Medical Certificate Expiry Date
- Policy Verification Expiry Date
- **Current Status Badges** (Expired / Expiring Soon / Valid)

#### For Restaurants:
- FSSAI License Expiry Date
- GST Registration Expiry Date
- **Current Status Badges** (Expired / Expiring Soon / Valid)

### Suggested UI Components:
```jsx
// Color coding:
- ❌ RED (Expired): "Expired - Action Required"
- ⚠️  YELLOW (Expiring): "Expiring Soon - Renew Needed"
- ✅ GREEN (Valid): "Valid"

// Badge example:
<Chip 
  label={expiring ? "EXPIRING SOON" : "VALID"}
  color={expiring ? "warning" : "success"}
  icon={expiring ? <AlertIcon /> : <CheckIcon />}
/>
```

---

## Warning Threshold

- **Expiry Warning Days:** 30 days before expiry date
- If a document expires on April 10, it will be flagged "expiring" from March 11 to April 10
- After April 10, it will be flagged "expired"

---

## Auto-Freeze Logic (Restaurant)

When FSSAI License expires:
1. The existing Cron Job [Cleanup Job 5] automatically freezes the account
2. Sets `isActive = false`
3. Sets `frozenReason = "Food licence expired or expiring"`
4. Notifies admin via socket event

---

## Integration Checklist

- ✅ Models updated with expiry fields
- ✅ Document expiry checker utility created
- ✅ Daily cron job added
- ⚠️  Admin panel components need to be created (show in FrozenRestaurantsList, etc.)
- ⚠️  Create new Rider expiry status page
- ⚠️  Create an admin Dashboard showing all expiring documents

---

## Example API Query

**Get all restaurants with expiring FSSAI licenses:**
```javascript
const expiringRestaurants = await Restaurant.find({
  'documentsExpiryStatus.licenseExpiring': true
}).select('name email documents.license.expiry documentsExpiryStatus');
```

**Get all riders with expired insurance:**
```javascript
const expiredInsurance = await Rider.find({
  'documentsExpiryStatus.insuranceExpired': true
}).select('user documents.insurance.expiryDate documentsExpiryStatus');
```

---

## Monitoring & Logging

Check logs for the daily cron job output:
```
🔍 [DAILY JOB] Starting Document Expiry Status Check...
[Daily Job] Updating all riders document expiry status...
✅ Riders: 150 updated, 0 failed
[Daily Job] Updating all restaurants document expiry status...
✅ Restaurants: 89 updated, 0 failed
🔍 [DAILY JOB] Document Expiry Status Check Completed
```

---

## Next Steps for Admin Panel

1. Update `FrozenRestaurantsList.jsx` to show FSSAI expiry status
2. Create `RiderDocumentsExpiry.jsx` to show rider document expiry status
3. Create `DocumentsExpiryDashboard.jsx` for admin overview
4. Add expiry information to respective detail pages
5. Implement email/notification reminders for account owners
