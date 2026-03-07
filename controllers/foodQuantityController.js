const FoodQuantity = require('../models/FoodQuantity');
exports.addFoodQuantity = async (req, res) => {
  try {
    const { name, isActive } = req.body;
    const fq = await FoodQuantity.create({ name, isActive });
    res.status(201).json({ message: 'Food quantity created', quantity: fq });
  } catch (error) {
    if (error.code === 11000) return res.status(400).json({ message: 'Food quantity already exists' });
    res.status(500).json({ message: error.message });
  }
};
exports.getAllFoodQuantities = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 50;
    const search = req.query.search || '';
    const query = {};
    if (search) query.name = { $regex: search, $options: 'i' };
    const total = await FoodQuantity.countDocuments(query);
    const list = await FoodQuantity.find(query).skip((page - 1) * limit).limit(limit).sort({ createdAt: -1 });
    res.status(200).json({ list, total, page, limit });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};
exports.getFoodQuantityById = async (req, res) => {
  try {
    const q = await FoodQuantity.findById(req.params.id);
    if (!q) return res.status(404).json({ message: 'Food quantity not found' });
    res.status(200).json(q);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};
exports.updateFoodQuantity = async (req, res) => {
  try {
    const { name, isActive } = req.body;
    const updated = await FoodQuantity.findByIdAndUpdate(req.params.id, { name, isActive }, { new: true, runValidators: true });
    if (!updated) return res.status(404).json({ message: 'Food quantity not found' });
    res.status(200).json({ message: 'Food quantity updated', quantity: updated });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};
exports.deleteFoodQuantity = async (req, res) => {
  try {
    const del = await FoodQuantity.findByIdAndDelete(req.params.id);
    if (!del) return res.status(404).json({ message: 'Food quantity not found' });
    res.status(200).json({ message: 'Food quantity deleted' });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};
exports.getPublicFoodQuantities = async (req, res) => {
  try {
    const list = await FoodQuantity.find({ isActive: true }).sort({ name: 1 });
    res.status(200).json(list);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};
