/**
 * @deprecated This model is deprecated as of [current date].
 * Use FoodCategory model instead for all category management.
 * 
 * MasterCategory has been replaced by the more comprehensive FoodCategory system.
 * Routes: /api/food-categories
 * Controller: foodCategoryController.js
 * Model: FoodCategory.js
 * 
 * Migration path:
 * - FoodCategory includes: name, description, image, sortOrder, isActive
 * - Old 'status' field → new 'isActive' boolean field
 * - Additional features: sortOrder, description, unique name constraint
 */

const mongoose = require('mongoose');
const masterCategorySchema = new mongoose.Schema({
    name: { 
        type: String, 
        required: true 
    },
    image: { 
        type: String, 
        required: true 
    },
    status: { 
        type: String, 
        enum: ['active', 'inactive'], 
        default: 'active' 
    }
}, { timestamps: true });
module.exports = mongoose.model('MasterCategory', masterCategorySchema);
