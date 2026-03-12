const mongoose = require('mongoose');
const cartItemSchema = new mongoose.Schema({
    product: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', required: true },
    restaurant: { type: mongoose.Schema.Types.ObjectId, ref: 'Restaurant', required: true }, // NEW: Track which restaurant
    name: String, // Cache name for display
    image: String, // Cache product image for display
    price: Number, // Unit price (basePrice + variation.price + Σ addOns.price)
    quantity: { type: Number, required: true, min: 1 },
    variation: {
        _id: String, // Variation ID
        name: String,
        price: Number
    },
    addOns: [{
        _id: String,
        name: String,
        price: Number
    }]
});
const cartSchema = new mongoose.Schema({
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, unique: true },
    restaurant: { type: mongoose.Schema.Types.ObjectId, ref: 'Restaurant' }, // Single restaurant per cart
    items: [cartItemSchema],
    couponCode: { type: String, default: null },
    tip: { type: Number, default: 0 },
}, { timestamps: true });
cartSchema.index({ restaurant: 1 });
module.exports = mongoose.model('Cart', cartSchema);
