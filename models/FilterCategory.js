const mongoose = require('mongoose');
const subCategorySchema = new mongoose.Schema({
  name: { type: String, required: true },
  isActive: { type: Boolean, default: true },
  meta: { type: mongoose.Schema.Types.Mixed }
}, { timestamps: true });
const filterCategorySchema = new mongoose.Schema({
  name: { type: String, required: true },
  description: { type: String, default: '' },
  isActive: { type: Boolean, default: true },
  subcategories: [subCategorySchema],
  meta: { type: mongoose.Schema.Types.Mixed }
}, { timestamps: true });
filterCategorySchema.index({ name: 1 }, { unique: true });
module.exports = mongoose.model('FilterCategory', filterCategorySchema);
