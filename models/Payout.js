const mongoose = require('mongoose');

const payoutSchema = new mongoose.Schema({
    // Reference to either rider or restaurant
    rider: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Rider',
    },
    restaurant: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Restaurant',
    },

    // Payout details
    amount: {
        type: Number,
        required: true,
    },

    status: {
        type: String,
        enum: ['pending', 'processing', 'completed', 'failed', 'cancelled'],
        default: 'pending',
    },

    paymentMethod: {
        type: String,
        enum: ['bank_transfer', 'upi', 'cash', 'wallet'],
        default: 'bank_transfer',
    },

    referenceNumber: {
        type: String,
    },

    processedAt: {
        type: Date,
    },

    completedAt: {
        type: Date,
    },

    failureReason: {
        type: String,
    },

    notes: {
        type: String,
    },

    // Admin who processed the payout
    processedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
    },

}, { timestamps: true });

// Index for faster queries
payoutSchema.index({ rider: 1, createdAt: -1 });
payoutSchema.index({ restaurant: 1, createdAt: -1 });
payoutSchema.index({ status: 1 });

module.exports = mongoose.model('Payout', payoutSchema);
