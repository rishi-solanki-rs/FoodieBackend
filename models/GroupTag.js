const mongoose = require('mongoose');
const groupTagSchema = new mongoose.Schema({
  name: { type: String, required: true },
  description: { type: String, default: '' },
  image: { type: String, default: '' }, // URL
  group: { type: mongoose.Schema.Types.ObjectId, ref: 'Group', required: true },
  isActive: { type: Boolean, default: true },
  meta: { type: mongoose.Schema.Types.Mixed }
}, { timestamps: true });
groupTagSchema.index({ name: 1, group: 1 }, { unique: true });
module.exports = mongoose.model('GroupTag', groupTagSchema);
