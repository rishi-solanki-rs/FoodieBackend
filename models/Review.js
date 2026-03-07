const mongoose = require('mongoose');
const reviewSchema = new mongoose.Schema({
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    order: { type: mongoose.Schema.Types.ObjectId, ref: 'Order', required: true },
    restaurant: { type: mongoose.Schema.Types.ObjectId, ref: 'Restaurant' },
    rider: { type: mongoose.Schema.Types.ObjectId, ref: 'Rider' },
    restaurantRating: { type: Number, min: 1, max: 5 },
    riderRating: { type: Number, min: 1, max: 5 },
    comment: { type: String },
    photos: [{ type: String }], // URLs
    isHidden: { type: Boolean, default: false },
    flaggedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    flagReason: { type: String },
}, { timestamps: true });
reviewSchema.index({ order: 1 }, { unique: true }); // Prevent duplicate reviews per order
reviewSchema.index({ restaurant: 1, createdAt: -1 }); // Fast restaurant review queries
reviewSchema.index({ rider: 1, createdAt: -1 }); // Fast rider review queries
reviewSchema.index({ user: 1, createdAt: -1 }); // Fast user review history
reviewSchema.index({ restaurantRating: 1 }); // For rating filters
reviewSchema.index({ riderRating: 1 }); // For rating filters
module.exports = mongoose.model('Review', reviewSchema);
