const mongoose = require('mongoose');
const rideRequestSchema = new mongoose.Schema({
    order: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Order',
        required: true
    },
    rider: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Rider',
        required: true
    },
    status: {
        type: String,
        enum: ['pending', 'accepted', 'rejected', 'timeout'],
        default: 'pending'
    },
    createdAt: {
        type: Date,
        default: Date.now,
        index: { expires: '15m' } // Auto-delete old requests after 15 mins to save space
    }
});
rideRequestSchema.index({ order: 1, rider: 1 }, { unique: true });
module.exports = mongoose.model('RideRequest', rideRequestSchema);
