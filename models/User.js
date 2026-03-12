const mongoose = require("mongoose");
const addressSchema = new mongoose.Schema({
  label: { type: String, enum: ["Home", "Work", "Other"], required: true },
  addressLine: { type: String, required: true },
  city: { type: String },
  zipCode: { type: String },
  location: {
    type: { type: String, default: "Point" },
    coordinates: { type: [Number], required: true }, // [Longitude, Latitude]
  },
  deliveryInstructions: { type: String, default: "" },
  isDefault: { type: Boolean, default: false },
});
const paymentMethodSchema = new mongoose.Schema({
  type: { type: String, enum: ["Card", "Wallet", "UPI"], required: true },
  provider: { type: String },
  token: { type: String },
  last4: { type: String },
  isDefault: { type: Boolean, default: false },
});
const userSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
    },
    email: {
      type: String,
      unique: true,
      sparse: true, 
      required: true,
    },
    mobile: { type: String, required: true, unique: true },
    password: { type: String, required: true },
    role: {
      type: String,
      enum: ["customer", "admin", "restaurant_owner", "rider"],
      default: "customer",
    },
    profilePic: { type: String },
    language: {
      type: String,
      enum: ["en", "de", "ar"],
      default: "en",
    },
    savedAddresses: [addressSchema],
    savedPaymentMethods: [paymentMethodSchema],
    favoriteRestaurants: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Restaurant",
      },
    ],
    favoriteProducts: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Product",
      },
    ],
    walletBalance: { type: Number, default: 0 },
    totalOrders: { type: Number, default: 0 },
    totalAmountSpent: { type: Number, default: 0 },
    totalEarnings: { type: Number, default: 0 }, 
    isDeleted: { type: Boolean, default: false },
    deletedAt: { type: Date },
    isBlocked: { type: Boolean, default: false },
    blockedAt: { type: Date },
    blockReason: { type: String, default: "" },
    otp: { type: String },
    otpExpires: { type: Date },
    isVerified: { type: Boolean, default: false },
    pendingProfileUpdate: {
      email: { type: String },
      mobile: { type: String },
      name: { type: String },
      language: { type: String },
      profilePic: { type: String }
    },
    fcmToken: { type: String },
    recentSearches: [{ type: String }],
    codActive: { type: Boolean, default: true },
  },
  { timestamps: true }
);
userSchema.index({ email: 1, isDeleted: 1 });
userSchema.index({ mobile: 1, isDeleted: 1 });
userSchema.index({ role: 1 });
userSchema.index({ "savedAddresses.location": "2dsphere" });
module.exports = mongoose.model("User", userSchema);
