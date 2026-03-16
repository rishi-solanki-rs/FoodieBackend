const mongoose = require('mongoose');
const promocodeSchema = new mongoose.Schema({
    title: { type: String, required: true },
    description: { type: String, required: true },
    code: { 
        type: String, 
        required: true, 
        unique: true, 
        uppercase: true, 
        trim: true 
    },
    image: { type: String }, // URL from upload
    restaurant: { 
        type: mongoose.Schema.Types.ObjectId, 
        ref: 'Restaurant', 
        default: null // Null means "All Restaurants" (Global)
    },
    offerType: { 
        type: String, 
        enum: ['percent', 'amount', 'free_delivery'], 
        required: true 
    },
    discountValue: { type: Number, required: true }, // e.g. 20 (%) or 100 ($)
    maxDiscountAmount: { type: Number }, // Cap for percentage offers (e.g. Max $50 off)
    minOrderValue: { type: Number, default: 0 },
    adminContribution: { type: Number, default: 0 }, 
    usageLimitPerCoupon: { type: Number, default: 0 }, // 0 = Unlimited
    usedCount: { type: Number, default: 0 }, // Incremented on successful paid orders
    usageLimitPerUser: { type: Number, default: 1 },   // How many times 1 user can use it
    availableFrom: { type: Date, required: true },
    expiryDate: { type: Date, required: true },
    promoType: { type: String, default: 'general' }, // e.g. "General", "Hidden", "Welcome"
    isTimeBound: { type: Boolean, default: false },
    activeDays: {
        type: [String], // ["Monday", "Wednesday", "Friday"]
        default: []
    },
    timeSlots: [{
        startTime: String, // "10:00"
        endTime: String    // "14:00"
    }],
    status: { 
        type: String, 
        enum: ['active', 'inactive'], 
        default: 'active' 
    }
}, { timestamps: true });
module.exports = mongoose.model('Promocode', promocodeSchema);
