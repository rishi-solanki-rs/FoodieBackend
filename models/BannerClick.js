const mongoose = require("mongoose");

const bannerClickSchema = new mongoose.Schema(
  {
    bannerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Banner",
      required: true,
      index: true,
    },
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
      index: true,
    },
    clickedAt: {
      type: Date,
      default: Date.now,
      index: true,
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model("BannerClick", bannerClickSchema);
