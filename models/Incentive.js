const mongoose = require('mongoose');
const incentiveSchema = new mongoose.Schema({
  title: { type: String, required: true },
  description: { type: String },
  type: { type: String, enum: ['discount','wallet_credit','free_delivery'], required: true },
  value: { type: Number, required: true },
  restaurant: { type: mongoose.Schema.Types.ObjectId, ref: 'Restaurant', default: null },
  target: { type: String, enum: ['user','rider','restaurant','all'], default: 'user' },
  assignedTo: [{ type: mongoose.Schema.Types.ObjectId }],
  usageLimitPerUser: { type: Number, default: 1 },
  usageLimitPerIncentive: { type: Number, default: 0 },
  availableFrom: { type: Date, default: Date.now },
  expiryDate: { type: Date },
  status: { type: String, enum: ['active','inactive'], default: 'active' },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }
}, { timestamps: true });
module.exports = mongoose.model('Incentive', incentiveSchema);
