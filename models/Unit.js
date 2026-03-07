const mongoose = require('mongoose');
const unitSchema = new mongoose.Schema({
    symbol: { 
        type: String, // e.g., "kg", "ltr", "pcs"
        required: true 
    },
    status: { 
        type: String, 
        enum: ['active', 'inactive'], 
        default: 'active' 
    }
}, { timestamps: true });
module.exports = mongoose.model('Unit', unitSchema);
