
const Order = require('../models/Order');
const WalletTransaction = require('../models/WalletTransaction');
const User = require('../models/User');
const AuditLog = require('../models/AuditLog');
const { isOnline } = require('../utils/paymentHelpers');
async function processRefund({
  orderId,
  order = null,
  reason,
  initiatedBy,
  initiatorRole
}) {
  try {
    if (!order) {
      order = await Order.findById(orderId);
    }
    if (!order) {
      return {
        success: false,
        error: 'Order not found'
      };
    }
    if (order.refund && order.refund.status === 'completed') {
      return {
        success: false,
        error: 'Order already refunded'
      };
    }
    const refundAmount = order.totalAmount;
    let refundMethod = 'pending'; // Default: needs admin to process via gateway
    let walletCredited = false;
    const user = await User.findById(order.customer);
    if (!user) {
      return {
        success: false,
        error: 'Customer not found'
      };
    }
    const walletDeduction = await WalletTransaction.findOne({
      user: order.customer,
      orderId: order._id,
      type: 'debit'
    });
    if (walletDeduction) {
      const walletAmount = Math.abs(walletDeduction.amount);
      await creditWallet({
        userId: order.customer,
        amount: walletAmount,
        description: `Refund for cancelled order #${order._id}`,
        orderId: order._id,
        adminId: initiatedBy
      });
      walletCredited = true;
      refundMethod = 'wallet';
    }
    order.refund = {
      status: 'in_progress',
      amount: refundAmount,
      method: refundMethod,
      note: reason
    };
    if (walletCredited && walletDeduction.amount >= refundAmount) {
      order.refund.status = 'completed';
      order.refund.refundedAt = new Date();
      order.refund.refundedBy = initiatedBy;
    }
    order.paymentStatus = 'refunded';
    await order.save();
    await AuditLog.log({
      entity: 'Order',
      entityId: order._id,
      action: 'refund',
      userId: initiatedBy,
      userRole: initiatorRole,
      changes: {
        field: 'refund',
        oldValue: null,
        newValue: order.refund
      },
      reason: reason,
      metadata: {
        refundAmount: refundAmount,
        walletCredited: walletCredited,
        method: refundMethod
      }
    });
    return {
      success: true,
      message: walletCredited ? 'Refund completed - wallet credited' : 'Refund initiated - admin will process',
      refundAmount: refundAmount,
      method: refundMethod,
      walletCredited: walletCredited,
      order: order
    };
  } catch (error) {
    console.error('Refund processing error:', error);
    return {
      success: false,
      error: error.message
    };
  }
}
async function creditWallet({
  userId,
  amount,
  description,
  orderId = null,
  adminId = null
}) {
  const transaction = await WalletTransaction.create({
    user: userId,
    amount: Math.abs(amount),
    type: 'credit',
    description: description,
    orderId: orderId,
    adminAction: adminId ? true : false,
    adminId: adminId
  });
  await User.findByIdAndUpdate(userId, {
    $inc: { walletBalance: Math.abs(amount) }
  });
  await AuditLog.log({
    entity: 'Wallet',
    entityId: transaction._id,
    action: 'wallet_credit',
    userId: adminId || userId,
    userRole: adminId ? 'admin' : 'customer',
    changes: {
      field: 'balance',
      oldValue: null,
      newValue: amount
    },
    reason: description,
    metadata: {
      orderId: orderId,
      transactionId: transaction._id
    }
  });
  return transaction;
}
async function debitWallet({
  userId,
  amount,
  description,
  orderId = null,
  adminId = null
}) {
  const user = await User.findById(userId);
  if (!user) {
    throw new Error('User not found');
  }
  if ((user.walletBalance || 0) < amount) {
    throw new Error('Insufficient wallet balance');
  }
  const transaction = await WalletTransaction.create({
    user: userId,
    amount: Math.abs(amount),
    type: 'debit',
    description: description,
    orderId: orderId,
    adminAction: adminId ? true : false,
    adminId: adminId
  });
  await User.findByIdAndUpdate(userId, {
    $inc: { walletBalance: -Math.abs(amount) }
  });
  await AuditLog.log({
    entity: 'Wallet',
    entityId: transaction._id,
    action: 'wallet_debit',
    userId: adminId || userId,
    userRole: adminId ? 'admin' : 'customer',
    changes: {
      field: 'balance',
      oldValue: null,
      newValue: -amount
    },
    reason: description,
    metadata: {
      orderId: orderId,
      transactionId: transaction._id
    }
  });
  return transaction;
}
async function completeRefund({
  orderId,
  gatewayTransactionId,
  completedBy,
  notes
}) {
  const order = await Order.findById(orderId);
  if (!order) {
    throw new Error('Order not found');
  }
  if (order.refund.status !== 'in_progress') {
    throw new Error('Refund is not in progress');
  }
  order.refund.status = 'completed';
  order.refund.refundedAt = new Date();
  order.refund.refundedBy = completedBy;
  order.refund.gatewayTransactionId = gatewayTransactionId;
  if (notes) {
    order.refund.note = (order.refund.note || '') + ' | ' + notes;
  }
  await order.save();
  await AuditLog.log({
    entity: 'Order',
    entityId: order._id,
    action: 'refund',
    userId: completedBy,
    userRole: 'admin',
    changes: {
      field: 'refund.status',
      oldValue: 'in_progress',
      newValue: 'completed'
    },
    reason: 'Refund completed via payment gateway',
    metadata: {
      gatewayTransactionId: gatewayTransactionId,
      notes: notes
    }
  });
  return order;
}
async function getPendingRefunds() {
  const orders = await Order.find({
    'refund.status': 'in_progress',
    'refund.method': { $ne: 'wallet' } // Only gateway refunds need admin action
  })
    .populate('customer', 'name email phone')
    .populate('restaurant', 'name')
    .sort({ 'refund.createdAt': -1 })
    .lean();
  return orders;
}
module.exports = {
  processRefund,
  creditWallet,
  debitWallet,
  completeRefund,
  getPendingRefunds
};
