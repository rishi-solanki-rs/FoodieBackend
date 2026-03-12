const mongoose = require('mongoose');
const walletTransactionSchema = new mongoose.Schema({
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    amount: { type: Number, required: true }, // Positive amount (type determines credit/debit)
    type: {
        type: String,
        enum: ['credit', 'debit'],
        required: true
    },
    // Where this transaction originated
    source: {
        type: String,
        enum: ['recharge', 'order_payment', 'refund', 'payout', 'admin_credit', 'admin_debit'],
        required: true
    },
    status: {
        type: String,
        enum: ['completed', 'pending', 'failed'],
        default: 'completed'
    },
    description: { type: String, required: true }, // e.g., "Wallet recharge via Razorpay"
    orderId: { type: mongoose.Schema.Types.ObjectId, ref: 'Order' }, // Optional: for order_payment/refund
    // Razorpay references (for recharge transactions)
    razorpayOrderId: { type: String, index: true },
    razorpayPaymentId: { type: String, unique: true, sparse: true }, // idempotency guard
    transactionId: { type: String }, // Legacy / generic reference
    adminAction: { type: Boolean, default: false },
    adminId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }
}, { timestamps: true });

walletTransactionSchema.index({ user: 1, createdAt: -1 });
walletTransactionSchema.index({ source: 1, status: 1 });

module.exports = mongoose.model('WalletTransaction', walletTransactionSchema);
