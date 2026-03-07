const mongoose = require('mongoose');
const faqSchema = new mongoose.Schema({
    category: {
        type: String,
        enum: ['Customer', 'Restaurant', 'Rider', 'General', 'Help'],
        default: 'General'
    },
    title: {
        type: String,
        required: true
    },
    answer: {
        type: String,
        required: true
    },
    order: {
        type: Number,
        default: 0
    },
    isActive: {
        type: Boolean,
        default: true
    },
    views: {
        type: Number,
        default: 0
    },
    helpful: {
        type: Number,
        default: 0
    },
    notHelpful: {
        type: Number,
        default: 0
    },
    createdBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
    },
    updatedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
    }
}, { timestamps: true });
faqSchema.index({ category: 1, isActive: 1 });
faqSchema.index({ title: 'text', answer: 'text' });
module.exports = mongoose.model('FAQ', faqSchema);
