const mongoose = require('mongoose');
const walletTransactionSchema = new mongoose.Schema({
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    amount: { type: Number, required: true }, // Positive amount (type determines credit/debit)
    type: { 
        type: String, 
        enum: ['credit', 'debit'], 
        required: true 
    },
    description: { type: String, required: true }, // e.g., "Order #1234 Payment"
    orderId: { type: mongoose.Schema.Types.ObjectId, ref: 'Order' }, // Optional link
    transactionId: { type: String }, // Gateway ID if added via card
    adminAction: { type: Boolean, default: false }, // Track if admin initiated this
    adminId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' } // Which admin did this action
}, { timestamps: true });
module.exports = mongoose.model('WalletTransaction', walletTransactionSchema);
