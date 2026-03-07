const mongoose = require('mongoose');
const paymentTransactionSchema = new mongoose.Schema({
  order: { type: mongoose.Schema.Types.ObjectId, ref: 'Order' },
  rider: { type: mongoose.Schema.Types.ObjectId, ref: 'Rider' },
  restaurant: { type: mongoose.Schema.Types.ObjectId, ref: 'Restaurant' },
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }, // customer
  type: {
    type: String,
    enum: [
      'cod_collected',          // Rider collected cash from customer
      'cod_deposit',            // Rider deposited cash to admin
      'rider_earning_credit',   // Platform credits rider for delivery
      'rider_weekly_payout',    // Weekly payout to rider
      'rider_manual_payout',    // Manual payout by admin
      'restaurant_commission',  // Commission auto-credited to restaurant wallet
      'restaurant_weekly_payout', // Weekly payout to restaurant
      'distance_surcharge',     // Extra fee for distance > 2km
      'rider_freeze',           // Rider account frozen
      'rider_unfreeze',         // Rider account unfrozen
      'online_payment',         // Customer paid online
      'wallet_payment',         // Customer paid via wallet
      'refund',                 // Refund issued
    ],
    required: true
  },
  amount: { type: Number, required: true },
  currency: { type: String, default: 'INR' },
  breakdown: {
    orderAmount: Number,
    commissionPercent: Number,
    commissionAmount: Number,
    deliveryFee: Number,
    distanceSurcharge: Number,    // Extra amount for >2km
    restaurantNet: Number,        // What restaurant gets
    riderEarning: Number,         // What rider gets
    platformEarning: Number,      // What platform keeps
  },
  deliveryDistanceKm: { type: Number },
  isLongDistance: { type: Boolean, default: false }, // > 2km
  status: {
    type: String,
    enum: ['pending', 'completed', 'failed', 'reversed'],
    default: 'completed'
  },
  note: { type: String },
  processedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }, // admin
}, { timestamps: true });
paymentTransactionSchema.index({ order: 1 });
paymentTransactionSchema.index({ rider: 1, createdAt: -1 });
paymentTransactionSchema.index({ restaurant: 1, createdAt: -1 });
paymentTransactionSchema.index({ type: 1, createdAt: -1 });
module.exports = mongoose.model('PaymentTransaction', paymentTransactionSchema);
