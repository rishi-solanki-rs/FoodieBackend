const mongoose = require("mongoose");

function resolveNavigationType(type) {
  return "restaurant";
}

const bannerSchema = new mongoose.Schema(
  {
    title: { type: String, required: true },
    image: { type: String, required: true }, // URL
    type: {
      type: String,
      enum: ["restaurant"],
      default: "restaurant",
    },
    targetId: { type: mongoose.Schema.Types.ObjectId, ref: "Restaurant", required: true },
    targetModel: {
      type: String,
      enum: ["Restaurant"],
      default: "Restaurant",
    },
    navigationType: {
      type: String,
      enum: ["restaurant"],
      default: "restaurant",
    },
    isActive: { type: Boolean, default: true },
    position: { type: Number, default: 0 }, // For sorting order
  },
  { timestamps: true }
);

bannerSchema.pre("validate", function syncNavigationShape() {
  this.type = "restaurant";
  this.navigationType = resolveNavigationType(this.type);
  this.targetModel = "Restaurant";
});

module.exports = mongoose.model("Banner", bannerSchema);
