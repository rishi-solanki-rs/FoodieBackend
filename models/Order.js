const mongoose = require("mongoose");

const MONEY_SCALE = 5;

function roundMoney(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return 0;
  return Number(numeric.toFixed(MONEY_SCALE));
}

function splitGst(total) {
  const safeTotal = roundMoney(total);
  const cgst = roundMoney(safeTotal / 2);
  const sgst = roundMoney(safeTotal - cgst);
  return { cgst, sgst, total: safeTotal };
}

function normalizePaymentBreakdown(pb) {
  if (!pb || typeof pb !== 'object') return;

  pb.priceAfterRestaurantDiscount = roundMoney(
    pb.priceAfterRestaurantDiscount ?? pb.taxableAmountFood ?? ((pb.itemTotal || 0) - (pb.restaurantDiscount || 0)),
  );
  pb.taxableAmountFood = roundMoney(pb.taxableAmountFood ?? pb.priceAfterRestaurantDiscount);

  const foodSplit = splitGst(pb.gstOnFood || 0);
  pb.cgstOnFood = foodSplit.cgst;
  pb.sgstOnFood = foodSplit.sgst;

  const packagingSplit = splitGst(pb.packagingGST || 0);
  pb.cgstOnPackaging = packagingSplit.cgst;
  pb.sgstOnPackaging = packagingSplit.sgst;

  pb.deliveryGST = roundMoney(pb.deliveryGST || 0);
  const deliverySplit = splitGst(pb.deliveryGST || 0);
  pb.cgstDelivery = deliverySplit.cgst;
  pb.sgstDelivery = deliverySplit.sgst;

  pb.platformGST = roundMoney(pb.platformGST || 0);
  const platformSplit = splitGst(pb.platformGST || 0);
  pb.cgstPlatform = platformSplit.cgst;
  pb.sgstPlatform = platformSplit.sgst;

  const adminCommissionSplit = splitGst(pb.adminCommissionGst || 0);
  pb.cgstAdminCommission = adminCommissionSplit.cgst;
  pb.sgstAdminCommission = adminCommissionSplit.sgst;

  pb.totalGstCollected = roundMoney(
    (pb.gstOnFood || 0)
    + (pb.packagingGST || 0)
    + (pb.deliveryGST || 0)
    + (pb.platformGST || 0)
    + (pb.adminCommissionGst || 0),
  );

  const cgstTotal = roundMoney(
    (pb.cgstOnFood || 0)
    + (pb.cgstOnPackaging || 0)
    + (pb.cgstDelivery || 0)
    + (pb.cgstPlatform || 0)
    + (pb.cgstAdminCommission || 0),
  );
  const sgstTotal = roundMoney(
    (pb.sgstOnFood || 0)
    + (pb.sgstOnPackaging || 0)
    + (pb.sgstDelivery || 0)
    + (pb.sgstPlatform || 0)
    + (pb.sgstAdminCommission || 0),
  );

  const existingSummary = pb.totalGstBreakdownForAdmin || {};
  pb.totalGstBreakdownForAdmin = {
    ...existingSummary,
    foodGst: roundMoney(pb.gstOnFood || 0),
    packagingGst: roundMoney(pb.packagingGST || 0),
    deliveryGST: roundMoney(pb.deliveryGST || 0),
    platformGST: roundMoney(pb.platformGST || 0),
    adminCommissionGst: roundMoney(pb.adminCommissionGst || 0),
    cgstTotal,
    sgstTotal,
  };
}
const orderSchema = new mongoose.Schema(
  {
    customer: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    restaurant: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Restaurant",
      required: true,
    },
    rider: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Rider",
    },
    idempotencyKey: {
      type: String,
      required: true,
      index: true,
    },
    items: [
      {
        product: { type: mongoose.Schema.Types.ObjectId, ref: "Product" },
        name: String,
        quantity: Number,
        basePrice: { type: Number, default: 0 },
        variationPrice: { type: Number, default: 0 },
        addonPrice: { type: Number, default: 0 },
        originalPrice: { type: Number, default: 0 },
        restaurantDiscountPercent: { type: Number, default: 0 },
        restaurantDiscountAmount: { type: Number, default: 0 },
        priceAfterDiscount: { type: Number, default: 0 },
        gstOnDiscountedPrice: { type: Number, default: 0 },
        price: Number,
        lineTotal: { type: Number, default: 0 },
        gstPercent: { type: Number, default: 0 },
        itemGstAmount: { type: Number, default: 0 },
        cgst: { type: Number, default: 0 },
        sgst: { type: Number, default: 0 },
        packagingCharge: { type: Number, default: 0 },
        packagingGstPercent: { type: Number, default: 0 },
        packagingGstAmount: { type: Number, default: 0 },
        commissionPercent: { type: Number, default: 0 },
        adminCommissionAmount: { type: Number, default: 0 },
        restaurantEarningAmount: { type: Number, default: 0 },
        variation: { name: String, price: Number },
        addOns: [{ name: String, price: Number }],
      },
    ],
    itemTotal: { type: Number, required: true },
    tax: { type: Number, default: 0 },
    packaging: { type: Number, default: 0 },
    deliveryFee: { type: Number, required: true },
    platformFee: { type: Number, default: 0 },
    tip: { type: Number, default: 0 },
    discount: { type: Number, default: 0 },
    couponCode: { type: String },
    couponType: { type: String, default: null },
    totalAmount: { type: Number, required: true },
    paymentBreakdown: {
      itemTotal: { type: Number, default: 0 },
      restaurantDiscount: { type: Number, default: 0 },
      priceAfterRestaurantDiscount: { type: Number, default: 0 },
      gstOnFood: { type: Number, default: 0 },
      packagingCharge: { type: Number, default: 0 },
      packagingGST: { type: Number, default: 0 },
      restaurantBillTotal: { type: Number, default: 0 },
      foodierDiscount: { type: Number, default: 0 },
      couponType: { type: String, default: null },
      gstOnDiscount: { type: Number, default: 0 },
      // finalPayableToRestaurant = customer-facing: what customer pays toward restaurant bill
      //   (settlement formula: restaurantBillTotal; platform coupons do not affect this)
      finalPayableToRestaurant: { type: Number, default: 0 },
      // Alias of finalPayableToRestaurant — explicit name for clarity
      customerRestaurantBill: { type: Number, default: 0 },
      // restaurantNetEarning = restaurant-facing: what restaurant actually keeps after admin commission
      //   (= Σ items[].restaurantEarningAmount = itemTotal − adminCommission)
      restaurantNetEarning: { type: Number, default: 0 },
      gstPercentOnFood: { type: Number, default: 0 },
      gstPercentOnPackaging: { type: Number, default: 0 },
      gstPercentOnDiscount: { type: Number, default: 0 },
      gstPercentOnPlatform: { type: Number, default: 0 },
      // GST split fields — restaurant bill (invoice v2)
      taxableAmountFood: { type: Number, default: 0 },
      cgstOnFood: { type: Number, default: 0 },
      sgstOnFood: { type: Number, default: 0 },
      cgstOnPackaging: { type: Number, default: 0 },
      sgstOnPackaging: { type: Number, default: 0 },
      // Platform bill section (invoice v2)
      deliveryCharge: { type: Number, default: 0 },
      deliveryGST: { type: Number, default: 0 },
      cgstDelivery: { type: Number, default: 0 },
      sgstDelivery: { type: Number, default: 0 },
      deliveryChargeGstPercent: { type: Number, default: 18 },
      platformGST: { type: Number, default: 0 },
      cgstPlatform: { type: Number, default: 0 },
      sgstPlatform: { type: Number, default: 0 },
      platformBillTotal: { type: Number, default: 0 },
      // Discount distribution (invoice v2)
      platformDiscountUsed: { type: Number, default: 0 },
      restaurantDiscountUsed: { type: Number, default: 0 },
      // Coupon discount split (settlement-v3)
      deliveryDiscountUsed: { type: Number, default: 0 },     // coupon portion applied to delivery fee
      platformDiscountSplit: { type: Number, default: 0 },    // coupon portion applied to platform fee
      couponDiscountAmount: { type: Number, default: 0 },     // total coupon discount (= platformDiscountUsed)
      deliveryFeeAfterDiscount: { type: Number, default: 0 }, // delivery fee customer is charged
      platformFeeAfterDiscount: { type: Number, default: 0 }, // platform fee customer is charged
      adminDeliverySubsidy: { type: Number, default: 0 },     // platform absorbs this to pay rider full fee
      // Settlement clarity fields (v2)
      restaurantGross: { type: Number, default: 0 },        // priceAfterRestaurantDiscount + packaging (for audit trail)
      restaurantNet: { type: Number, default: 0 },          // alias for restaurantNetEarning
      riderDeliveryEarning: { type: Number, default: 0 },   // delivery fee credited to rider
      riderIncentive: { type: Number, default: 0 },         // incentive bonus credited to rider
      riderPlatformFeeShare: { type: Number, default: 0 },  // platform fee portion to rider (pre-GST)
      adminPlatformFeeShare: { type: Number, default: 0 },  // = platformGST: GST on platform fee → admin wallet
      // Admin commission GST (invoice v2) — GST on restaurant commission, deducted from restaurant earnings
      adminCommissionGst: { type: Number, default: 0 },            // adminCommission × 18%
      cgstAdminCommission: { type: Number, default: 0 },
      sgstAdminCommission: { type: Number, default: 0 },
      adminCommissionGstPercent: { type: Number, default: 18 },    // GST rate applied
      totalAdminCommissionDeduction: { type: Number, default: 0 }, // adminCommission + adminCommissionGst
      totalGstCollected: { type: Number, default: 0 },
      totalGstBreakdownForAdmin: {
        foodGst: { type: Number, default: 0 },
        packagingGst: { type: Number, default: 0 },
        deliveryGST: { type: Number, default: 0 },
        platformGST: { type: Number, default: 0 },
        adminCommissionGst: { type: Number, default: 0 },
        cgstTotal: { type: Number, default: 0 },
        sgstTotal: { type: Number, default: 0 },
      },
      computedVersion: { type: String, default: "settlement-v1" },
      computedAt: { type: Date, default: Date.now },
    },
    paymentMethod: {
      type: String,
      enum: ["wallet", "online"],
    },
    paymentStatus: {
      type: String,
      enum: ["pending", "processing", "paid", "failed", "refunded", "refunding", "cancelled"],
      default: "pending",
    },
    razorpayOrderId: { type: String },
    transactionId: { type: String },
    paidAt: { type: Date },
    settlementStatus: {
      type: String,
      enum: ["pending", "processing", "processed"],
      default: "pending",
    },
    settlementProcessedAt: { type: Date },
    status: {
      type: String,
      enum: [
        "pending",             // 0. Order created, awaiting payment verification
        "placed",              // 1. Customer placed order
        "accepted",            // 2. Restaurant accepted (started preparing)
        "preparing",           // 3. Kitchen is cooking
        "ready",               // 4. Food is ready, waiting for rider
        "assigned",            // 5. Rider assigned and heading to restaurant
        "reached_restaurant",  // 6. Rider physically at restaurant, awaiting pickup OTP
        "picked_up",           // 7. Rider picked up food (OUT FOR DELIVERY)
        "delivery_arrived",    // 8. Rider at customer location
        "delivered",           // 9. Order completed
        "cancelled",           // Order cancelled
        "failed",              // Payment failed
      ],
      default: "pending",
      index: true,
    },
    pickupOtp: { type: String },
    pickupOtpExpiresAt: { type: Date },
    pickupOtpVerifiedAt: { type: Date },
    deliveryOtp: { type: String },
    deliveryOtpExpiresAt: { type: Date },
    deliveryOtpVerifiedAt: { type: Date },
    timeline: [
      {
        status: String,          // What status changed to
        timestamp: { type: Date, default: Date.now },
        label: String,           // Human-readable: "Order Placed", "Out for Delivery"
        by: {
          type: String,
          enum: ["system", "customer", "restaurant_owner", "rider", "admin"],
        },
        description: String,     // Details: "Restaurant is preparing your order"
      },
    ],
    riderNotificationStatus: {
      notified: { type: Boolean, default: false },
      notifiedAt: { type: Date },
      notifiedRiders: [
        {
          riderId: { type: mongoose.Schema.Types.ObjectId, ref: "Rider" },
          notifiedAt: Date,
          status: {
            type: String,
            enum: ["sent", "opened", "accepted", "declined","rejected"],
          },
        },
      ],
      acceptedBy: { type: mongoose.Schema.Types.ObjectId, ref: "Rider" },
    },
    estimatedDeliveryTime: { type: Date },
    pickedUpAt: { type: Date },
    deliveredAt: { type: Date },

    // ════════════════════════════════════════════════════════════════════════════
    // RIDER EARNINGS BREAKDOWN - Detailed breakdown of rider earnings per delivery
    // Updated when order is delivered
    // ════════════════════════════════════════════════════════════════════════════
    riderEarnings: {
      // COMPONENT 1: Delivery Charge - Base charge for completing the delivery
      // Calculation: admin-configured baseEarning + distance-based bonus
      // Example: ₹30 (base) + ₹10 (distance bonus) = ₹40
      deliveryCharge: { type: Number, default: 0 },
      
      // COMPONENT 2: Platform Fee - Share of platform fee given to rider
      // Calculation: platformFee from order × riderPlatformSharePercent (if configured)
      // Example: ₹9 (platform fee) = credited to rider
      platformFee: { type: Number, default: 0 },
      
      // COMPONENT 3: Incentive - Performance/volume bonus based on order value
      // Calculation: (priceAfterRestaurantDiscount) × riderIncentivePercent
      // Example: ₹1000 item total - ₹200 restaurant discount = ₹800; incentive at 5% = ₹40
      incentive: { type: Number, default: 0 },

      // COMPONENT 4: Tip - Customer tip passed 100% to rider
      tip: { type: Number, default: 0 },
      
      // TOTAL: Sum of all rider-side components
      // totalRiderEarning = deliveryCharge + platformFee + incentive + tip
      // This amount is credited to rider wallet immediately after delivery
      totalRiderEarning: { type: Number, default: 0 },
      
      // Snapshot of the incentive percentage used at time of order completion
      // Stored for audit/transparency (admin might change settings later)
      incentivePercentAtCompletion: { type: Number, default: 0 },
      
      // Timestamp when earnings were calculated and credited
      earnedAt: { type: Date }
    },
    
    cancellationReason: { type: String },
    cancellationInitiatedBy: {
      type: String,
      enum: ["customer", "restaurant_owner", "rider", "system"],
    },
    cancelledAt: { type: Date },
    refund: {
      status: {
        type: String,
        enum: ["none", "in_progress", "completed"],
        default: "none",
      },
      amount: { type: Number, default: 0 },
      refundedAt: { type: Date },
      refundedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
      method: { type: String, enum: ["wallet", "gateway"], default: "wallet" },
      gatewayTransactionId: { type: String },
      note: { type: String },
    },
    deliveryAddress: {
      addressLine: String,
      coordinates: [Number], // [longitude, latitude]
    },
    deliveryDistanceKm: { type: Number, default: 0 }, // Distance between restaurant and customer
    isRated: { type: Boolean, default: false },
    restaurantRatedRider: { type: Boolean, default: false },
    riderRating: {
      rating: { type: Number, min: 1, max: 5 },
      ratedAt: { type: Date },
      feedback: { type: String },
    },
    issueReported: { type: String },
    issueReportedAt: { type: Date },
    failedAt: { type: Date },
    failureReason: { type: String },
    failureType: { type: String },
    retryCount: { type: Number, default: 0 },
    lastRetryAt: { type: Date },
  },
  { timestamps: true }
);
orderSchema.index({ customer: 1, createdAt: -1 });
orderSchema.index({ rider: 1 });
orderSchema.index({ "deliveryAddress.coordinates": "2dsphere" });
orderSchema.index({ restaurant: 1 });
orderSchema.index({ paymentStatus: 1 });
orderSchema.index({ status: 1, restaurant: 1 });

orderSchema.pre('validate', function normalizeFinancialSnapshot() {
  normalizePaymentBreakdown(this.paymentBreakdown);
  if (this.paymentBreakdown && typeof this.paymentBreakdown === 'object') {
    this.tax = roundMoney(this.paymentBreakdown.totalGstCollected || 0);
  }
});

module.exports = mongoose.model("Order", orderSchema);
