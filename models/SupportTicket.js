const mongoose = require('mongoose');
const ticketSchema = new mongoose.Schema({
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    userType: { type: String, enum: ['customer','rider','restaurant_owner','admin'], default: 'rider' },
    subject: { type: String, required: true },
    message: { type: String, required: true },
    status: { type: String, enum: ['open','in_progress','resolved','closed'], default: 'open' },
    assignedTo: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    reply: [{ by: String, message: String, createdAt: Date }]
}, { timestamps: true });
module.exports = mongoose.model('SupportTicket', ticketSchema);
