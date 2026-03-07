const FilterCategory = require('../models/FilterCategory');
exports.addFilterCategory = async (req, res) => {
  try {
    const { name, description, isActive } = req.body;
    const cat = await FilterCategory.create({ name, description, isActive });
    res.status(201).json({ message: 'Filter category created', category: cat });
  } catch (error) {
    if (error.code === 11000) return res.status(400).json({ message: 'Filter category already exists' });
    res.status(500).json({ message: error.message });
  }
};
exports.getAllFilterCategories = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const search = req.query.search || '';
    const query = {};
    if (search) query.name = { $regex: search, $options: 'i' };
    const total = await FilterCategory.countDocuments(query);
    const categories = await FilterCategory.find(query).skip((page - 1) * limit).limit(limit).sort({ createdAt: -1 });
    res.status(200).json({ categories, total, page, limit });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};
exports.getFilterCategoryById = async (req, res) => {
  try {
    const cat = await FilterCategory.findById(req.params.id);
    if (!cat) return res.status(404).json({ message: 'Filter category not found' });
    res.status(200).json(cat);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};
exports.updateFilterCategory = async (req, res) => {
  try {
    const { name, description, isActive } = req.body;
    const cat = await FilterCategory.findByIdAndUpdate(req.params.id, { name, description, isActive }, { new: true, runValidators: true });
    if (!cat) return res.status(404).json({ message: 'Filter category not found' });
    res.status(200).json({ message: 'Filter category updated', category: cat });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};
exports.deleteFilterCategory = async (req, res) => {
  try {
    const del = await FilterCategory.findByIdAndDelete(req.params.id);
    if (!del) return res.status(404).json({ message: 'Filter category not found' });
    res.status(200).json({ message: 'Filter category deleted' });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};
exports.addSubcategory = async (req, res) => {
  try {
    const { name, isActive } = req.body;
    const cat = await FilterCategory.findById(req.params.id);
    if (!cat) return res.status(404).json({ message: 'Filter category not found' });
    cat.subcategories.push({ name, isActive });
    await cat.save();
    res.status(201).json({ message: 'Subcategory added', subcategory: cat.subcategories[cat.subcategories.length - 1] });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};
exports.searchSubcategories = async (req, res) => {
  try {
    const q = req.query.search || '';
    if (!q) return res.status(200).json([]);
    const agg = [
      { $unwind: '$subcategories' },
      { $match: { 'subcategories.name': { $regex: q, $options: 'i' } } },
      { $project: { categoryId: '$_id', categoryName: '$name', subcategory: '$subcategories' } },
      { $limit: 50 }
    ];
    const results = await FilterCategory.aggregate(agg);
    res.status(200).json(results.map(r => ({ categoryId: r.categoryId, categoryName: r.categoryName, subcategory: r.subcategory })));
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};
