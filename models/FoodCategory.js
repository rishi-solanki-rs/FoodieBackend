const mongoose = require('mongoose');

/**
 * FoodCategory — Admin-managed global food categories.
 * e.g., Starters, Main Course, Desserts, Beverages, Breads, Rice & Biryani, etc.
 * Restaurants pick from this list when adding products. They cannot create their own.
 */
const foodCategorySchema = new mongoose.Schema({
    name: {
        type: String,
        required: true,
        trim: true,
        unique: true,
    },
    description: {
        type: String,
        trim: true,
    },
    image: {
        type: String,
    },
    sortOrder: {
        type: Number,
        default: 0, // Lower number = appears first
    },
    isActive: {
        type: Boolean,
        default: true,
    },
}, { timestamps: true });

foodCategorySchema.index({ isActive: 1, sortOrder: 1 });

module.exports = mongoose.model('FoodCategory', foodCategorySchema);
