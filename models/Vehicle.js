const mongoose = require('mongoose');
const vehicleSchema = new mongoose.Schema({
  name: { type: String, required: true },
  number: { type: String },
  vehicleImage: { type: String },
  rcNumber: { type: String },
  rcImage: { type: String },
  rcExpiryDate: { type: Date },
  insuranceNumber: { type: String },
  insuranceImage: { type: String },
  insuranceExpiryDate: { type: Date },
  description: { type: String },
  status: { type: String, enum: ['active','inactive'], default: 'active' }
}, { timestamps: true });
module.exports = mongoose.model('Vehicle', vehicleSchema);
