const Withdrawal = require("../models/WithdrawalRequest");
const User = require("../models/User");
const { getPaginationParams } = require('../utils/pagination');
exports.getAllWithdrawals = async (req, res) => {
  try {
    const { page, limit, skip } = getPaginationParams(req, 50);
    const statusFilter = req.query.status;
    const query = {};
    if (statusFilter) query.status = statusFilter;
    const total = await Withdrawal.countDocuments(query);
    const requests = await Withdrawal.find(query)
      .populate("user", "name mobile email")
      .skip(skip)
      .limit(limit)
      .sort({ createdAt: -1 });
    res.status(200).json({
      withdrawals: requests,
      total,
      page,
      limit,
      pages: Math.ceil(total / limit)
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};
exports.approveWithdrawal = async (req, res) => {
  try {
    const { id } = req.params;
    const { adminNote } = req.body;
    const reqObj = await Withdrawal.findById(id);
    if (!reqObj)
      return res.status(404).json({ message: "Withdrawal request not found" });
    if (reqObj.status !== "pending")
      return res.status(400).json({ message: "Request already processed" });
    const user = await User.findById(reqObj.user);
    if (!user) return res.status(404).json({ message: "User not found" });
    if (user.walletBalance < reqObj.amount)
      return res.status(400).json({ message: "Insufficient balance" });
    user.walletBalance -= reqObj.amount;
    await user.save();
    reqObj.status = "approved";
    reqObj.adminNote = adminNote || "";
    reqObj.processedAt = new Date();
    await reqObj.save();
    res.status(200).json({ message: "Withdrawal approved", request: reqObj });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};
exports.rejectWithdrawal = async (req, res) => {
  try {
    const { id } = req.params;
    const { adminNote } = req.body;
    const reqObj = await Withdrawal.findById(id);
    if (!reqObj)
      return res.status(404).json({ message: "Withdrawal request not found" });
    if (reqObj.status !== "pending")
      return res.status(400).json({ message: "Request already processed" });
    reqObj.status = "rejected";
    reqObj.adminNote = adminNote || "";
    reqObj.processedAt = new Date();
    await reqObj.save();
    res.status(200).json({ message: "Withdrawal rejected", request: reqObj });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};
