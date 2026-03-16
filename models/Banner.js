const mongoose = require("mongoose");

function resolveNavigationType(type) {
  switch (type) {
    case "restaurant":
      return "restaurant";
    case "item":
      return "product";
    case "category":
      return "category";
    case "external":
      return "external";
    default:
      return "none";
  }
}

const bannerSchema = new mongoose.Schema(
  {
    title: { type: String, required: true },
    image: { type: String, required: true }, // URL
    type: {
      type: String,
      enum: ["restaurant", "item", "category", "external", "static"],
      default: "static",
    },
    targetId: { type: mongoose.Schema.Types.ObjectId, refPath: "targetModel" },
    targetModel: {
      type: String,
      enum: ["Restaurant", "Product", "Category"],
    },
    externalUrl: { type: String, trim: true, default: null },
    navigationType: {
      type: String,
      enum: ["restaurant", "product", "category", "external", "none"],
      default: "none",
    },
    isActive: { type: Boolean, default: true },
    position: { type: Number, default: 0 }, // For sorting order
  },
  { timestamps: true }
);

bannerSchema.pre("validate", function syncNavigationShape() {
  this.navigationType = resolveNavigationType(this.type);

  if (this.type === "external") {
    this.targetId = undefined;
    this.targetModel = undefined;
  }

  if (this.type === "static") {
    this.targetId = undefined;
    this.targetModel = undefined;
    this.externalUrl = null;
  }

  if (this.type !== "external") {
    this.externalUrl = null;
  }
});

module.exports = mongoose.model("Banner", bannerSchema);
