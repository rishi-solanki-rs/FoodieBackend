const Incentive = require("../models/Incentive");
const { getPaginationParams, buildSearchQuery } = require('../utils/pagination');
exports.createIncentive = async (req, res) => {
  try {
    const body = req.body;
    body.createdBy = req.user._id;
    const inc = await Incentive.create(body);
    res.status(201).json({ message: "Incentive created", data: inc });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};
exports.getAllIncentivesAdmin = async (req, res) => {
  try {
    const { page, limit, skip } = getPaginationParams(req, 50);
    const search = req.query.search || '';
    const query = buildSearchQuery(search, ['name', 'description']);
    const total = await Incentive.countDocuments(query);
    const incentives = await Incentive.find(query)
      .skip(skip)
      .limit(limit)
      .sort({ createdAt: -1 });
    res.status(200).json({
      incentives,
      total,
      page,
      limit,
      pages: Math.ceil(total / limit)
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};
exports.updateIncentive = async (req, res) => {
  try {
    const inc = await Incentive.findByIdAndUpdate(req.params.id, req.body, {
      new: true,
      runValidators: true,
    });
    if (!inc) return res.status(404).json({ message: "Incentive not found" });
    res.status(200).json({ message: "Incentive updated", data: inc });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};
exports.deleteIncentive = async (req, res) => {
  try {
    await Incentive.findByIdAndDelete(req.params.id);
    res.status(200).json({ message: "Incentive deleted" });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};
exports.assignIncentive = async (req, res) => {
  try {
    const { targetIds } = req.body; // array of ids
    const inc = await Incentive.findById(req.params.id);
    if (!inc) return res.status(404).json({ message: "Incentive not found" });
    inc.assignedTo = [
      ...new Set([...(inc.assignedTo || []), ...(targetIds || [])]),
    ];
    await inc.save();
    res.status(200).json({ message: "Incentive assigned", data: inc });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};
exports.getMyIncentives = async (req, res) => {
  try {
    const now = new Date();
    const incentives = await Incentive.find({
      status: "active",
      $or: [{ assignedTo: req.user._id }, { target: "all" }],
      $or: [{ availableFrom: { $lte: now } }, { availableFrom: null }],
      $or: [{ expiryDate: { $gte: now } }, { expiryDate: null }],
    });
    res.status(200).json(incentives);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};
