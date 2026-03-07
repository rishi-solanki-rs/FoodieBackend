const GroupTag = require('../models/GroupTag');
const Group = require('../models/Group');
const { getFileUrl } = require('../utils/upload');
const { getPaginationParams } = require('../utils/pagination');
exports.addGroupTag = async (req, res) => {
  try {
    const { name, description, group: groupId, isActive } = req.body;
    const image = req.file ? getFileUrl(req.file) : req.body.image;
    const group = await Group.findById(groupId);
    if (!group) return res.status(404).json({ message: 'Group not found' });
    const tag = await GroupTag.create({ name, description, image, group: groupId, isActive });
    res.status(201).json({ message: 'Group tag created', tag });
  } catch (error) {
    if (error.code === 11000) return res.status(400).json({ message: 'Tag with this name already exists in group' });
    res.status(500).json({ message: error.message });
  }
};
exports.getAllGroupTags = async (req, res) => {
  try {
    const { page, limit, skip } = getPaginationParams(req, 20);
    const search = req.query.search || '';
    const group = req.query.group;
    const query = {};
    if (search) query.name = { $regex: search, $options: 'i' };
    if (group) query.group = group;
    const total = await GroupTag.countDocuments(query);
    const tags = await GroupTag.find(query)
      .populate('group', 'name')
      .skip(skip)
      .limit(limit)
      .sort({ createdAt: -1 });
    res.status(200).json({
      tags,
      total,
      page,
      limit,
      pages: Math.ceil(total / limit)
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};
exports.getGroupTagById = async (req, res) => {
  try {
    const tag = await GroupTag.findById(req.params.id).populate('group', 'name');
    if (!tag) return res.status(404).json({ message: 'Tag not found' });
    res.status(200).json(tag);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};
exports.updateGroupTag = async (req, res) => {
  try {
    const { name, description, group: groupId, isActive } = req.body;
    const updateData = { name, description, isActive };
    if (req.file) {
      updateData.image = getFileUrl(req.file);
    } else if (req.body.image !== undefined) {
      updateData.image = req.body.image;
    }
    if (groupId) {
      const group = await Group.findById(groupId);
      if (!group) return res.status(404).json({ message: 'Group not found' });
      updateData.group = groupId;
    }
    const tag = await GroupTag.findByIdAndUpdate(req.params.id, updateData, { new: true, runValidators: true });
    if (!tag) return res.status(404).json({ message: 'Tag not found' });
    res.status(200).json({ message: 'Tag updated', tag });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};
exports.deleteGroupTag = async (req, res) => {
  try {
    const del = await GroupTag.findByIdAndDelete(req.params.id);
    if (!del) return res.status(404).json({ message: 'Tag not found' });
    res.status(200).json({ message: 'Tag deleted' });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};
