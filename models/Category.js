const mongoose = require("mongoose");
const categorySchema = new mongoose.Schema(
  {
    restaurant: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Restaurant",
      required: true,
    },
    name: {
      en: { type: String, required: true },
      de: { type: String },
      ar: { type: String },
    },
    image: { type: String },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
);
module.exports = mongoose.model("Category", categorySchema);
