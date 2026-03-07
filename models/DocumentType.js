const mongoose = require('mongoose');
const documentTypeSchema = new mongoose.Schema({
    name: { type: String, required: true }, // e.g. "FSSAI Certificate"
    type: { 
        type: String, 
        enum: ['restaurant', 'driver'], 
        required: true 
    },
    hasExpiry: { type: Boolean, default: false }, // "Expiry Date Needed?"
    status: { 
        type: String, 
        enum: ['active', 'inactive'], 
        default: 'active' 
    }
}, { timestamps: true });
module.exports = mongoose.model('DocumentType', documentTypeSchema);
