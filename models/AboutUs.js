const mongoose = require('mongoose');
const aboutUsSchema = new mongoose.Schema({
    title: {
        type: String,
        default: 'About Us'
    },
    content: {
        type: String,
        required: true
    },
    lastRevised: {
        type: Date,
        default: Date.now
    },
    lastRevisedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
    },
    isActive: {
        type: Boolean,
        default: true
    },
    version: {
        type: Number,
        default: 1
    }
}, { timestamps: true });
module.exports = mongoose.model('AboutUs', aboutUsSchema);
