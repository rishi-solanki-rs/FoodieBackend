const mongoose = require("mongoose");
const bannerSchema = new mongoose.Schema(
  {
    title: { type: String, required: true },
    image: { type: String, required: true }, // URL
    type: {
      type: String,
      enum: ["restaurant", "item", "external", "static"],
      default: "static",
    },
    targetId: { type: mongoose.Schema.Types.ObjectId, refPath: "targetModel" },
    targetModel: {
      type: String,
      enum: ["Restaurant", "Product", "Category"],
    },
    isActive: { type: Boolean, default: true },
    position: { type: Number, default: 0 }, // For sorting order
  },
  { timestamps: true }
);
module.exports = mongoose.model("Banner", bannerSchema);
