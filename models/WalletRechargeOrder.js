const mongoose = require('mongoose');

/**
 * Tracks every Razorpay order created for a wallet recharge.
 * The `credited` flag is the idempotency guard — once true the wallet
 * must not be credited again even if the webhook or verify API is called
 * a second time.
 */
const walletRechargeOrderSchema = new mongoose.Schema({
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    amount: { type: Number, required: true },          // INR (not paise)
    razorpayOrderId: { type: String, required: true, unique: true },
    razorpayPaymentId: { type: String, sparse: true }, // set after successful payment
    status: {
        type: String,
        enum: ['created', 'paid', 'failed'],
        default: 'created'
    },
    // Idempotency guard — wallet is credited ONLY when this flips to true
    credited: { type: Boolean, default: false },
    // Reference to the WalletTransaction created on successful credit
    walletTransactionId: { type: mongoose.Schema.Types.ObjectId, ref: 'WalletTransaction' },
    failureReason: { type: String },
}, { timestamps: true });

walletRechargeOrderSchema.index({ user: 1, createdAt: -1 });
walletRechargeOrderSchema.index({ status: 1 });

module.exports = mongoose.model('WalletRechargeOrder', walletRechargeOrderSchema);
