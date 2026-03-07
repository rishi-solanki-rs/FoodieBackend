const mongoose = require('mongoose');
const cuisineSchema = new mongoose.Schema({
    name: { type: String, required: true },
    image: { type: String }, // Optional if you want icons for cuisines later
    isActive: { type: Boolean, default: true }
}, { timestamps: true });
module.exports = mongoose.model('Cuisine', cuisineSchema);
