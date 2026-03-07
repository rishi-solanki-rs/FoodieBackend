const mongoose = require('mongoose');
const foodQuantitySchema = new mongoose.Schema({
  name: { type: String, required: true },
  isActive: { type: Boolean, default: true },
  meta: { type: mongoose.Schema.Types.Mixed }
}, { timestamps: true });
foodQuantitySchema.index({ name: 1 }, { unique: true });
module.exports = mongoose.model('FoodQuantity', foodQuantitySchema);
