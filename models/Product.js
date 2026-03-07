const mongoose = require("mongoose");
const productSchema = new mongoose.Schema(
  {
    restaurant: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Restaurant",
      required: true,
    },
    category: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "FoodCategory",
      required: true,
    },

    // ── Core product info (set by restaurant) ──────────────────────────────
    name: {
      en: { type: String, required: true },
      de: { type: String },
      ar: { type: String },
    },
    description: {                          // Short description shown on menu card
      en: { type: String },
      de: { type: String },
      ar: { type: String },
    },
    image: { type: String },

    // Serving size / unit quantity label  e.g. "250ml", "1 plate", "500g"
    quantity: { type: String, trim: true, default: '' },

    // ── Pricing (set by restaurant) ────────────────────────────────────────
    basePrice: { type: Number, required: true, min: 0 },

    // HSN code for GST compliance (India). Set by restaurant when listing.
    // e.g. "2106" for food preparations, "0901" for coffee
    hsnCode: { type: String, trim: true, default: '' },

    // GST slab — set by restaurant when listing (0 / 5 / 12 / 18 %)
    gstPercent: {
      type: Number,
      enum: [0, 5, 12, 18],
      default: 5,
    },

    // ── Discount (admin-only, restaurants cannot set this) ─────────────────
    discount: {
      type: {
        type: String,
        enum: ['percent', 'flat'],
        default: 'percent',
      },
      value: { type: Number, default: 0, min: 0 },   // e.g. 10 = 10% or ₹10 flat
      reason: { type: String, default: '' },          // e.g. "Festival offer"
      active: { type: Boolean, default: true },
      setAt: { type: Date },
      setBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    },

    // ── Availability & approval ────────────────────────────────────────────
    available: { type: Boolean, default: true },
    isApproved: { type: Boolean, default: false },
    isRejected: { type: Boolean, default: false },
    rejectedAt: { type: Date },
    seasonal: { type: Boolean, default: false },
    seasonTag: { type: String },
    approvedAt: { type: Date },
    approvalNotes: { type: String },

    // ── Pending updates (restaurant-proposed, needs admin approval) ─────────
    // NOTE: discount, hsnCode are NOT in pendingUpdate — admin controls those directly.
    pendingUpdate: {
      type: {
        name: { en: String, de: String, ar: String },
        description: { en: String, de: String, ar: String },
        image: { type: String },
        basePrice: { type: Number },
        quantity: { type: String },
        gstPercent: { type: Number },
        seasonal: { type: Boolean },
        seasonTag: { type: String },
        category: { type: mongoose.Schema.Types.ObjectId, ref: "FoodCategory" },
        variations: [
          {
            name: {
              en: { type: String, required: true },
              de: { type: String },
              ar: { type: String },
            },
            price: { type: Number, required: true, min: 0 },
          },
        ],
        addOns: [
          {
            name: {
              en: { type: String, required: true },
              de: { type: String },
              ar: { type: String },
            },
            price: { type: Number, required: true, min: 0 },
            image: { type: String },
          },
        ],
      },
      default: undefined,
    },
    pendingUpdateAt: { type: Date },

    // ── Variations & add-ons ───────────────────────────────────────────────
    variations: [
      {
        name: {
          en: { type: String, required: true },
          de: { type: String },
          ar: { type: String },
        },
        price: { type: Number, required: true, min: 0 },
      },
    ],
    addOns: [
      {
        name: {
          en: { type: String, required: true },
          de: { type: String },
          ar: { type: String },
        },
        price: { type: Number, required: true, min: 0 },
        image: { type: String },
      },
    ],
  },
  { timestamps: true, minimize: true }
);

module.exports = mongoose.model("Product", productSchema);

