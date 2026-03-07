const mongoose = require('mongoose');
const addonSchema = new mongoose.Schema({
    restaurant: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Restaurant',
        required: true
    },
    name: { type: String, required: true },
    price: { type: Number, required: true },
    status: { 
        type: String, 
        enum: ['active', 'inactive'], 
        default: 'active' 
    }
}, { timestamps: true });
module.exports = mongoose.model('Addon', addonSchema);
