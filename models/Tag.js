const mongoose = require('mongoose');
const tagSchema = new mongoose.Schema({
    name: { type: String, required: true },
    type: { type: String, default: "Product" }, 
    description: String,
    image: String,
    color: { type: String, default: "#000000" },
    status: { 
        type: String, 
        enum: ['active', 'inactive'], 
        default: 'active' 
    }
}, { timestamps: true });
module.exports = mongoose.model('Tag', tagSchema);
