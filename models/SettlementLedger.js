
const mongoose = require('mongoose');
const settlementLedgerSchema = new mongoose.Schema({
  order: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Order',
    required: true,
    index: true
  },
  restaurant: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Restaurant',
    required: true,
    index: true
  },
  orderAmount: {
    type: Number,
    required: true,
    comment: 'Total order amount paid by customer'
  },
  platformCommission: {
    type: Number,
    required: true,
    comment: 'Platform fee/commission amount'
  },
  platformCommissionPercent: {
    type: Number,
    required: true,
    default: 15,
    comment: 'Commission percentage applied'
  },
  deliveryFee: {
    type: Number,
    default: 0,
    comment: 'Delivery fee (usually kept by platform)'
  },
  tax: {
    type: Number,
    default: 0,
    comment: 'Tax collected'
  },
  restaurantEarning: {
    type: Number,
    required: true,
    comment: 'Net amount payable to restaurant (orderAmount - commission - fees)'
  },
  status: {
    type: String,
    enum: ['pending', 'processing', 'completed', 'failed', 'disputed'],
    default: 'pending',
    index: true
  },
  settlementBatchId: {
    type: String,
    index: true,
    comment: 'Batch ID if settled as part of bulk payment'
  },
  settledAt: {
    type: Date,
    index: true
  },
  settledBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    comment: 'Admin who marked as settled'
  },
  settlementMethod: {
    type: String,
    enum: ['bank_transfer', 'cheque', 'wallet', 'other'],
    comment: 'How restaurant was paid'
  },
  externalReference: {
    type: String,
    comment: 'Bank transaction ID or other external reference'
  },
  notes: {
    type: String
  },
  disputeReason: {
    type: String
  },
  disputedAt: {
    type: Date
  },
  disputeResolvedAt: {
    type: Date
  }
}, {
  timestamps: true
});
settlementLedgerSchema.index({ restaurant: 1, status: 1, createdAt: -1 });
settlementLedgerSchema.index({ settlementBatchId: 1 });
settlementLedgerSchema.index({ status: 1, createdAt: -1 });
settlementLedgerSchema.virtual('settlementAge').get(function() {
  if (this.settledAt) {
    return null; // Already settled
  }
  const ageInDays = Math.floor((Date.now() - this.createdAt) / (1000 * 60 * 60 * 24));
  return ageInDays;
});
settlementLedgerSchema.statics.createFromOrder = async function(order, restaurant) {
  const commissionPercent = restaurant.commissionRate || 15;
  const baseAmount = order.totalAmount - (order.tip || 0);
  const platformCommission = (baseAmount * commissionPercent) / 100;
  const restaurantEarning = baseAmount - platformCommission - (order.deliveryFee || 0);
  return await this.create({
    order: order._id,
    restaurant: restaurant._id,
    orderAmount: order.totalAmount,
    platformCommission: platformCommission,
    platformCommissionPercent: commissionPercent,
    deliveryFee: order.deliveryFee || 0,
    tax: order.tax || 0,
    restaurantEarning: restaurantEarning,
    status: 'pending'
  });
};
settlementLedgerSchema.statics.getPendingForRestaurant = async function(restaurantId) {
  const settlements = await this.find({
    restaurant: restaurantId,
    status: 'pending'
  })
  .populate('order', 'orderNumber createdAt')
  .sort({ createdAt: -1 });
  const totalPending = settlements.reduce((sum, s) => sum + s.restaurantEarning, 0);
  return {
    settlements,
    totalPending,
    count: settlements.length
  };
};
settlementLedgerSchema.statics.processBulkSettlement = async function({
  settlementIds,
  batchId,
  settledBy,
  settlementMethod,
  externalReference,
  notes
}) {
  const result = await this.updateMany(
    { _id: { $in: settlementIds }, status: 'pending' },
    {
      $set: {
        status: 'completed',
        settledAt: new Date(),
        settledBy: settledBy,
        settlementBatchId: batchId,
        settlementMethod: settlementMethod,
        externalReference: externalReference,
        notes: notes
      }
    }
  );
  return result;
};
module.exports = mongoose.model('SettlementLedger', settlementLedgerSchema);
