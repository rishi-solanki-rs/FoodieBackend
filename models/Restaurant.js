const mongoose = require("mongoose");
const translationSchema = {
  en: { type: String, required: true },
  de: { type: String },
  ar: { type: String },
};
const dailyTimingSchema = {
  open: { type: String }, // e.g., "09:00"
  close: { type: String }, // e.g., "22:00"
  isClosed: { type: Boolean, default: false } // For holidays/closed days
};
const restaurantSchema = new mongoose.Schema(
  {
    owner: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    product: [{
      type: mongoose.Schema.Types.ObjectId,
      ref: "Product",
    }], // Products offered by the restaurant - synced when items are added
    name: translationSchema, // Form: Restaurant Name
    description: translationSchema,
    restaurantType: { type: String },
    image: { type: String },
    bannerImage: { type: String },
    restaurantImages: [{ type: String }],
    cuisine: [{ type: String }], // Form: Cuisines
    brand: { type: String },
    email: { type: String, required: true }, // Form: Email (Public contact email)
    contactNumber: { type: String, required: true }, // Form: Contact Number
    address: { type: String, required: true }, // Form: Address
    city: { type: String, required: true }, // Form: Select City
    area: { type: String, required: true }, // Form: Select Area
    location: {
      type: { type: String, default: "Point" },
      coordinates: { type: [Number], index: "2dsphere" }, // [long, lat]
    },
    deliveryTime: { type: Number, required: true }, // Form: Estimated Delivery Time (Mins)
    geofenceRadius: { type: Number, default: 5 }, // Form: Geofence Radius (km)
    deliveringZones: [{ type: String }], // Form: Delivering Zones
    deliveryType: [{
      type: String,
      enum: ['Home Delivery', 'Pickup', 'Dining']
    }],
    paymentMethods: {
      type: String,
      enum: ['Online', 'Wallet', 'Both'],
      default: 'Both'
    },
    packagingCharge: { type: Number, default: 0 },
    adminCommission: { type: Number, default: 10 },  // ✅ FIXED: 10% default commission instead of 0
    isFreeDelivery: { type: Boolean, default: false },
    freeDeliveryContribution: { type: Number, default: 0 },
    totalFreeDeliverySpend: { type: Number, default: 0 },
    isActive: { type: Boolean, default: true }, // Form: Status (Active/Inactive)
    restaurantApproved: { type: Boolean, default: false },
    menuApproved: { type: Boolean, default: false }, // Admin approval for menu
    menuApprovedAt: { type: Date },
    menuApprovalNotes: { type: String },
    rating: {
      average: { type: Number, default: 0, min: 0, max: 5 },
      count: { type: Number, default: 0 },
      breakdown: {
        five: { type: Number, default: 0 },
        four: { type: Number, default: 0 },
        three: { type: Number, default: 0 },
        two: { type: Number, default: 0 },
        one: { type: Number, default: 0 }
      },
      lastRatedAt: { type: Date }
    },
    totalOrders: { type: Number, default: 0 },
    totalEarnings: { type: Number, default: 0 },
    totalDeliveries: { type: Number, default: 0 },
    averageOrderValue: { type: Number, default: 0 },
    successfulOrders: { type: Number, default: 0 },
    bankDetails: {
      accountName: { type: String },
      bankName: { type: String },
      accountAddress: { type: String },
      branchName: { type: String },
      accountNumber: { type: String },
      branchAddress: { type: String },
      swiftCode: { type: String },
      routingNumber: { type: String }
    },
    documents: {
      // FSSAI Food Safety License - CRITICAL & EXPIRES
      license: { 
        url: { type: String },
        backUrl: { type: String },
        number: { type: String },
        expiry: { type: Date }, // License expiry date - customer-facing critical field
        verifiedAt: { type: Date },
        verifiedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }
      },
      // PAN Card - TAX IDENTIFICATION
      pan: { 
        url: { type: String },
        number: { type: String },
        verifiedAt: { type: Date },
        verifiedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }
      },
      // GST Registration - TAX COMPLIANCE & EXPIRES
      gst: { 
        url: { type: String },
        number: { type: String },
        expiryDate: { type: Date }, // GST certificate validity (can be cancelled/renewed)
        verifiedAt: { type: Date },
        verifiedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }
      }
    },
    verificationStatus: { type: String, enum: ['pending', 'verified', 'rejected'], default: 'pending' },
    accountStatus: {
      type: String,
      enum: ['active', 'blocked', 'suspended'],
      default: 'active'
    },
    blockedReason: { type: String },
    blockedAt: { type: Date },
    blockedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    verificationNotes: { type: String },
    rejectionReason: { type: String },
    rejectionDate: { type: Date },
    rejectedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    // Document Expiry Tracking - for admin alerts
    documentsExpiryStatus: {
        licenseExpiring: { type: Boolean, default: false },  // FSSAI expires within 30 days
        licenseExpired: { type: Boolean, default: false },   // FSSAI has expired
        gstExpiring: { type: Boolean, default: false },      // GST expires within 30 days
        gstExpired: { type: Boolean, default: false },       // GST has expired
        lastCheckedAt: { type: Date }                        // When expiry was last checked
    },
    // Account Freeze Status (for licence expiry or violations)
    frozenReason: { type: String }, // Reason for freezing
    frozenDate: { type: Date }, // When the account was frozen
    frozenBy: { type: String, enum: ['system', 'admin'], default: 'admin' }, // Who froze it
    // Account Unfreeze Status (tracking manual reactivation)
    unfreezedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" }, // Admin who unfroze it
    unfreezedDate: { type: Date }, // When the account was unfrozen
    unfreezeReason: { type: String }, // Reason for unfreezing/verification passed
    pendingUpdate: {
      email: { type: String },
      contactNumber: { type: String },
      otp: { type: String },
      otpExpires: { type: Date },
      otpAttempts: { type: Number, default: 0 }
    },
    minOrderValue: { type: Number, default: 0 },
    priceRange: {
      min: { type: Number, default: 0 },
      max: { type: Number, default: 0 },
      average: { type: Number, default: 0 },
      lastCalculated: { type: Date }
    },
    taxConfig: {
      gstNumber: { type: String },
      gstPercent: { type: Number, default: 0 }
    },
    estimatedPreparationTime: { type: Number, default: 15 }, // in minutes
    autoAccept: { type: Boolean, default: false },
    orderScheduling: { type: Boolean, default: false },
    dailyOrderLimitType: { type: String, enum: ['unlimited', 'custom'], default: 'unlimited' },
    dailyOrderLimit: { type: Number, default: null },
    notificationSettings: {
      newOrderAlert: { type: Boolean, default: true },
      cancellationAlert: { type: Boolean, default: true },
      foodReadyAlert: { type: Boolean, default: true },
      orderDelayAlert: { type: Boolean, default: false },
      riderAssignedAlert: { type: Boolean, default: true },
      riderArrivedAlert: { type: Boolean, default: true },
      orderPickedUpAlert: { type: Boolean, default: true },
      promotionalAlert: { type: Boolean, default: false },
    },
    isTemporarilyClosed: { type: Boolean, default: false },
    timing: {
      monday: dailyTimingSchema,
      tuesday: dailyTimingSchema,
      wednesday: dailyTimingSchema,
      thursday: dailyTimingSchema,
      friday: dailyTimingSchema,
      saturday: dailyTimingSchema,
      sunday: dailyTimingSchema,
      isHoliday: { type: Boolean, default: false } // Global Holiday Switch
    }
  },
  { timestamps: true }
);
module.exports = mongoose.model("Restaurant", restaurantSchema);
