const mongoose = require('mongoose');
const riderWalletSchema = new mongoose.Schema({
  rider: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Rider',
    required: true,
    unique: true
  },
  cashInHand: { type: Number, default: 0 },
  cashLimit: { type: Number, default: 2000 },
  totalEarnings: { type: Number, default: 0 },
  availableBalance: { type: Number, default: 0 },
  isFrozen: { type: Boolean, default: false },
  frozenAt: { type: Date },
  frozenReason: { type: String },
  lastDepositAt: { type: Date },
  lastDepositAmount: { type: Number },
  lastPayoutAt: { type: Date },
  lastPayoutAmount: { type: Number },
  totalPayouts: { type: Number, default: 0 }
}, { timestamps: true });
riderWalletSchema.methods.checkAndFreeze = function () {
  if (this.cashInHand >= this.cashLimit && !this.isFrozen) {
    this.isFrozen = true;
    this.frozenAt = new Date();
    this.frozenReason = `COD cash limit of ₹${this.cashLimit} reached. Please deposit ₹${this.cashInHand} to admin.`;
    return true; // Was frozen
  }
  return false;
};
riderWalletSchema.methods.depositCash = function (amount) {
  if (amount <= 0) throw new Error('Invalid deposit amount');
  this.cashInHand = Math.max(0, this.cashInHand - amount);
  this.lastDepositAt = new Date();
  this.lastDepositAmount = amount;
  if (this.cashInHand < this.cashLimit) {
    this.isFrozen = false;
    this.frozenAt = null;
    this.frozenReason = null;
  }
};
module.exports = mongoose.model('RiderWallet', riderWalletSchema);
