const mongoose = require('mongoose');
const groupSchema = new mongoose.Schema({
  name: { type: String, required: true },
  description: { type: String, default: '' },
  image: { type: String, default: '' }, // URL for now
  isActive: { type: Boolean, default: true },
  meta: { type: mongoose.Schema.Types.Mixed }
}, { timestamps: true });
groupSchema.index({ name: 1 }, { unique: true });
module.exports = mongoose.model('Group', groupSchema);
