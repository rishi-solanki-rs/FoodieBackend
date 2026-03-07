const RefundRequest = require('../models/RefundRequest');
const Order = require('../models/Order');
const User = require('../models/User');
const WalletTransaction = require('../models/WalletTransaction');
const { sendNotification } = require('../utils/notificationService');
const { getPaginationParams } = require('../utils/pagination');
exports.getAllRefundsAdmin = async (req, res) => {
    try {
        const { page, limit, skip } = getPaginationParams(req, 20);
        const { status } = req.query;
        const query = {};
        if (status) query.status = status;
        const total = await RefundRequest.countDocuments(query);
        const refunds = await RefundRequest.find(query)
            .populate('order')
            .populate('user', 'name email mobile')
            .skip(skip)
            .limit(limit)
            .sort({ createdAt: -1 });
        res.status(200).json({
            refunds,
            total,
            page,
            limit,
            pages: Math.ceil(total / limit)
        });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};
exports.getMyRefunds = async (req, res) => {
    try {
        const refunds = await RefundRequest.find({ user: req.user._id }).populate('order').sort({ createdAt: -1 });
        res.status(200).json(refunds);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};
exports.approveRefund = async (req, res) => {
    try {
        const refund = await RefundRequest.findById(req.params.id).populate('order').populate('user');
        if (!refund) return res.status(404).json({ message: 'Refund request not found' });
        if (refund.status !== 'pending') return res.status(400).json({ message: 'Refund is not pending' });
        const order = await Order.findById(refund.order._id);
        const user = await User.findById(refund.user._id);
        user.walletBalance = (user.walletBalance || 0) + refund.amount;
        await user.save();
        await WalletTransaction.create({ user: user._id, amount: refund.amount, type: 'credit', description: `Refund for Order #${order._id}`, orderId: order._id });
        order.refund = {
            status: 'completed',
            amount: refund.amount,
            refundedAt: new Date(),
            refundedBy: req.user._id,
            method: refund.method,
            note: refund.note || 'Refund approved by admin'
        };
        order.paymentStatus = 'refunded';
        await order.save();
        refund.status = 'processed';
        refund.processedBy = req.user._id;
        refund.processedAt = new Date();
        await refund.save();
        try { await sendNotification(user._id, 'Refund Processed', `Your refund of ${refund.amount} for order ${order._id} has been processed.`); } catch(e){}
        res.status(200).json({ message: 'Refund processed', refund });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};
exports.rejectRefund = async (req, res) => {
    try {
        const refund = await RefundRequest.findById(req.params.id).populate('order').populate('user');
        if (!refund) return res.status(404).json({ message: 'Refund request not found' });
        if (refund.status !== 'pending') return res.status(400).json({ message: 'Refund is not pending' });
        refund.status = 'rejected';
        refund.processedBy = req.user._id;
        refund.processedAt = new Date();
        refund.note = req.body.note || refund.note;
        await refund.save();
        const order = await Order.findById(refund.order._id);
        if (order) {
            order.refund = order.refund || {};
            order.refund.status = 'rejected';
            await order.save();
        }
        try { await sendNotification(refund.user._id, 'Refund Request Rejected', `Your refund request for order ${refund.order._id} was rejected. Reason: ${refund.note || 'N/A'}`); } catch(e){}
        res.status(200).json({ message: 'Refund rejected', refund });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};
