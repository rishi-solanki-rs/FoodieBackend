const Vehicle = require('../models/Vehicle');
const { getPaginationParams, buildSearchQuery } = require('../utils/pagination');
const { getFileUrl } = require('../utils/upload');
exports.addVehicle = async (req, res) => {
  try {
    const body = req.body || {};
    const vehicleData = {
      name: body.name,
      number: body.number,
      rcNumber: body.rcNumber,
      rcExpiryDate: body.rcExpiryDate ? new Date(body.rcExpiryDate) : undefined,
      insuranceNumber: body.insuranceNumber,
      insuranceExpiryDate: body.insuranceExpiryDate ? new Date(body.insuranceExpiryDate) : undefined,
      description: body.description,
      status: body.status || body.isActive === 'false' ? 'inactive' : (body.isActive === 'true' ? 'active' : body.status)
    };
    if (req.files) {
      if (req.files.vehicleImage && req.files.vehicleImage[0]) vehicleData.vehicleImage = getFileUrl(req.files.vehicleImage[0]);
      if (req.files.rcImage && req.files.rcImage[0]) vehicleData.rcImage = getFileUrl(req.files.rcImage[0]);
      if (req.files.insuranceImage && req.files.insuranceImage[0]) vehicleData.insuranceImage = getFileUrl(req.files.insuranceImage[0]);
    }
    if (!vehicleData.vehicleImage && req.file) vehicleData.vehicleImage = getFileUrl(req.file);
    const v = await Vehicle.create(vehicleData);
    res.status(201).json({ message: 'Vehicle created', vehicle: v });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};
exports.getAllVehicles = async (req, res) => {
  try {
    const { page, limit, skip } = getPaginationParams(req, 50);
    const search = req.query.search || '';
    const query = buildSearchQuery(search, ['name', 'number', 'rcNumber', 'insuranceNumber']);
    const total = await Vehicle.countDocuments(query);
    const vehicles = await Vehicle.find(query)
      .skip(skip)
      .limit(limit)
      .sort({ createdAt: -1 });
    res.status(200).json({
      vehicles,
      total,
      page,
      limit,
      pages: Math.ceil(total / limit)
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};
exports.getVehicleById = async (req, res) => {
  try {
    const vehicle = await Vehicle.findById(req.params.id);
    if (!vehicle) {
      return res.status(404).json({ message: 'Vehicle not found' });
    }
    res.status(200).json(vehicle);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};
exports.updateVehicle = async (req, res) => {
  try {
    const body = req.body || {};
    const update = {
      name: body.name,
      number: body.number,
      rcNumber: body.rcNumber,
      rcExpiryDate: body.rcExpiryDate ? new Date(body.rcExpiryDate) : undefined,
      insuranceNumber: body.insuranceNumber,
      insuranceExpiryDate: body.insuranceExpiryDate ? new Date(body.insuranceExpiryDate) : undefined,
      description: body.description,
      status: body.status || (body.isActive === 'false' ? 'inactive' : (body.isActive === 'true' ? 'active' : undefined))
    };
    if (req.files) {
      if (req.files.vehicleImage && req.files.vehicleImage[0]) update.vehicleImage = getFileUrl(req.files.vehicleImage[0]);
      if (req.files.rcImage && req.files.rcImage[0]) update.rcImage = getFileUrl(req.files.rcImage[0]);
      if (req.files.insuranceImage && req.files.insuranceImage[0]) update.insuranceImage = getFileUrl(req.files.insuranceImage[0]);
    }
    if (!update.vehicleImage && req.file) update.vehicleImage = getFileUrl(req.file);
    Object.keys(update).forEach(k => update[k] === undefined && delete update[k]);
    const v = await Vehicle.findByIdAndUpdate(req.params.id, update, { new: true, runValidators: true });
    if (!v) return res.status(404).json({ message: 'Vehicle not found' });
    res.status(200).json({ message: 'Vehicle updated', vehicle: v });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};
exports.deleteVehicle = async (req, res) => {
  try {
    const v = await Vehicle.findByIdAndDelete(req.params.id);
    if (!v) return res.status(404).json({ message: 'Vehicle not found' });
    res.status(200).json({ message: 'Vehicle deleted' });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};
