const mongoose = require('mongoose');
const trainingSchema = new mongoose.Schema({
    title: { type: String, required: true },
    url: { type: String, required: true },
    description: { type: String }
}, { timestamps: true });
module.exports = mongoose.model('TrainingMaterial', trainingSchema);
