const mongoose = require('mongoose');
const withdrawalSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  amount: { type: Number, required: true },
  method: { type: String, enum: ['bank','upi','manual'], default: 'bank' },
  bankDetails: { type: Object },
  status: { type: String, enum: ['pending','approved','rejected','processed'], default: 'pending' },
  adminNote: { type: String },
  processedAt: { type: Date }
}, { timestamps: true });
module.exports = mongoose.model('WithdrawalRequest', withdrawalSchema);
