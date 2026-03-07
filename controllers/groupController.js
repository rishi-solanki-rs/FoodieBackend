const Group = require('../models/Group');
const { getFileUrl } = require('../utils/upload');
const { getPaginationParams } = require('../utils/pagination');
exports.addGroup = async (req, res) => {
  try {
    const { name, description, isActive } = req.body;
    const image = req.file ? getFileUrl(req.file) : req.body.image;
    const group = await Group.create({ name, description, image, isActive });
    res.status(201).json({ message: 'Group created', group });
  } catch (error) {
    if (error.code === 11000) return res.status(400).json({ message: 'Group with this name already exists' });
    res.status(500).json({ message: error.message });
  }
};
exports.getAllGroups = async (req, res) => {
  try {
    const { page, limit, skip } = getPaginationParams(req, 20);
    const search = req.query.search || '';
    const query = {};
    if (search) query.name = { $regex: search, $options: 'i' };
    const total = await Group.countDocuments(query);
    const groups = await Group.find(query)
      .skip(skip)
      .limit(limit)
      .sort({ createdAt: -1 });
    res.status(200).json({
      groups,
      total,
      page,
      limit,
      pages: Math.ceil(total / limit)
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};
exports.getGroupById = async (req, res) => {
  try {
    const group = await Group.findById(req.params.id);
    if (!group) return res.status(404).json({ message: 'Group not found' });
    res.status(200).json(group);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};
exports.updateGroup = async (req, res) => {
  try {
    const { name, description, isActive } = req.body;
    const updateData = { name, description, isActive };
    if (req.file) {
      updateData.image = getFileUrl(req.file);
    } else if (req.body.image !== undefined) {
      updateData.image = req.body.image;
    }
    const group = await Group.findByIdAndUpdate(req.params.id, updateData, { new: true, runValidators: true });
    if (!group) return res.status(404).json({ message: 'Group not found' });
    res.status(200).json({ message: 'Group updated', group });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};
exports.deleteGroup = async (req, res) => {
  try {
    const del = await Group.findByIdAndDelete(req.params.id);
    if (!del) return res.status(404).json({ message: 'Group not found' });
    res.status(200).json({ message: 'Group deleted' });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};
