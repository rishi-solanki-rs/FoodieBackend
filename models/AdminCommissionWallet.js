const mongoose = require('mongoose');

const adminCommissionWalletSchema = new mongoose.Schema({
  // Admin commission tracking (single document)
  balance: { type: Number, default: 0 },           // Current pending commission
  totalCommission: { type: Number, default: 0 },   // All-time commissions earned
  totalPaidOut: { type: Number, default: 0 },      // Already paid out
  lastPayoutAt: { type: Date },                    // Last payout date
  lastPayoutAmount: { type: Number, default: 0 }, // Last payout amount
  nextPayoutDate: { type: Date },                  // Next scheduled payout (Sunday)
  
  // Breakdown
  commissionFromRestaurants: { type: Number, default: 0 },
  commissionFromDelivery: { type: Number, default: 0 },
  
  // Metadata
  lastUpdated: { type: Date, default: Date.now },
}, { timestamps: true });

// Static method to get or create the singleton document
adminCommissionWalletSchema.statics.getInstance = async function() {
  let wallet = await this.findOne();
  if (!wallet) {
    wallet = await this.create({});
  }
  return wallet;
};

module.exports = mongoose.model('AdminCommissionWallet', adminCommissionWalletSchema);