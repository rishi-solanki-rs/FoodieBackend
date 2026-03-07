const mongoose = require('mongoose');
const restaurantWalletSchema = new mongoose.Schema({
  restaurant: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Restaurant',
    required: true,
    unique: true
  },
  balance: { type: Number, default: 0 },
  totalEarnings: { type: Number, default: 0 },
  totalPaidOut: { type: Number, default: 0 },
  lastPayoutAt: { type: Date },
  lastPayoutAmount: { type: Number, default: 0 },
  nextPayoutDate: { type: Date }, // Next Sunday
  pendingAmount: { type: Number, default: 0 },
}, { timestamps: true });
module.exports = mongoose.model('RestaurantWallet', restaurantWalletSchema);
