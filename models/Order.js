const mongoose = require("mongoose");
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
        price: Number,
        variation: { name: String, price: Number },
        addOns: [{ name: String, price: Number }],
      },
    ],
    itemTotal: { type: Number, required: true },
    tax: { type: Number, default: 0 },
    deliveryFee: { type: Number, required: true },
    platformFee: { type: Number, default: 0 },
    tip: { type: Number, default: 0 },
    discount: { type: Number, default: 0 },
    couponCode: { type: String },
    totalAmount: { type: Number, required: true },
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
            enum: ["sent", "opened", "accepted", "declined"],
          },
        },
      ],
      acceptedBy: { type: mongoose.Schema.Types.ObjectId, ref: "Rider" },
    },
    estimatedDeliveryTime: { type: Date },
    pickedUpAt: { type: Date },
    deliveredAt: { type: Date },
    riderEarning: { type: Number, default: 0 },
    adminCommission: { type: Number, default: 0 },
    restaurantCommission: { type: Number, default: 0 },
    riderCommission: { type: Number, default: 0 },
    riderIncentive: { type: Number, default: 0 },       // % of itemTotal — admin-configured
    riderIncentivePercent: { type: Number, default: 0 }, // snapshot of the % at time of order

    cashCollected: { type: Number, default: 0 },
    cashCollectedAt: { type: Date },
    cashCollectedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
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
module.exports = mongoose.model("Order", orderSchema);
