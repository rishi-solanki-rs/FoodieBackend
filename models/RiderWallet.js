const mongoose = require('mongoose');
const riderWalletSchema = new mongoose.Schema({
  rider: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Rider',
    required: true,
    unique: true
  },
  totalEarnings: { type: Number, default: 0 },
  availableBalance: { type: Number, default: 0 },
  lastDepositAt: { type: Date },
  lastDepositAmount: { type: Number },
  lastPayoutAt: { type: Date },
  lastPayoutAmount: { type: Number },
  totalPayouts: { type: Number, default: 0 }
}, { timestamps: true });
module.exports = mongoose.model('RiderWallet', riderWalletSchema);
