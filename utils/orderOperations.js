
const crypto = require('crypto');
const Order = require('../models/Order');
const AuditLog = require('../models/AuditLog');
const SettlementLedger = require('../models/SettlementLedger');
const { validateTransition, logStatusTransition } = require('../utils/orderStateGuard');
const { isOnline, validatePaymentForProgression } = require('../utils/paymentHelpers');
const { processRefund, debitWallet } = require('../services/refundService');
async function createOrderSafe(orderData, clientRequestId) {
  const idempotencyKey = clientRequestId || `${orderData.customer}_${Date.now()}`;
  const existingOrder = await Order.findOne({
    idempotencyKey: idempotencyKey,
    status: { $nin: ['failed', 'cancelled'] }
  });
  if (existingOrder) {
    return {
      success: true,
      order: existingOrder,
      duplicate: true,
      message: 'Order already exists'
    };
  }
  const deliveryOtp = generateOTP();
  const hashedOtp = hashOTP(deliveryOtp);
  const order = await Order.create({
    ...orderData,
    idempotencyKey: idempotencyKey,
    deliveryOtp: hashedOtp,
    status: 'placed'
  });
  await AuditLog.log({
    entity: 'Order',
    entityId: order._id,
    action: 'created',
    userId: orderData.customer,
    userRole: 'customer',
    metadata: {
      restaurantId: orderData.restaurant,
      totalAmount: orderData.totalAmount,
      paymentMethod: orderData.paymentMethod,
      deliveryOtpPlaintext: deliveryOtp // Send OTP to customer via SMS/notification
    }
  });
  return {
    success: true,
    order: order,
    duplicate: false,
    deliveryOtp: deliveryOtp,
    message: 'Order created successfully'
  };
}
async function updateOrderStatus({
  orderId,
  currentStatus,
  newStatus,
  userId,
  userRole,
  reason = null,
  metadata = {}
}) {
  const validation = validateTransition(currentStatus, newStatus);
  if (!validation.valid) {
    return {
      success: false,
      error: validation.error
    };
  }
  const order = await Order.findById(orderId);
  if (!order) {
    return {
      success: false,
      error: 'Order not found'
    };
  }
  if (isOnline(order) && newStatus !== 'cancelled' && newStatus !== 'failed') {
    const paymentCheck = validatePaymentForProgression(order);
    if (!paymentCheck.valid) {
      return {
        success: false,
        error: paymentCheck.error
      };
    }
  }
  order.status = newStatus;
  order.timeline.push({
    status: newStatus,
    timestamp: new Date()
  });
  if (newStatus === 'picked_up') {
    order.pickedUpAt = new Date();
  } else if (newStatus === 'delivered') {
    order.deliveredAt = new Date();
  }
  await order.save();
  await logStatusTransition({
    orderId: orderId,
    oldStatus: currentStatus,
    newStatus: newStatus,
    userId: userId,
    userRole: userRole,
    reason: reason
  });
  await handlePostStatusActions(order, newStatus, userId, userRole, metadata);
  return {
    success: true,
    order: order,
    message: `Order status updated to ${newStatus}`
  };
}
async function handlePostStatusActions(order, newStatus, userId, userRole, metadata) {
  if (newStatus === 'delivered') {
    try {
      const Restaurant = require('../models/Restaurant');
      const restaurant = await Restaurant.findById(order.restaurant);
      if (restaurant) {
        await SettlementLedger.createFromOrder(order, restaurant);
      }
    } catch (error) {
      console.error('Failed to create settlement:', error);
    }
  }
  if (newStatus === 'cancelled') {
    try {
      await processRefund({
        order: order,
        reason: metadata.cancellationReason || 'Order cancelled',
        initiatedBy: userId,
        initiatorRole: userRole
      });
    } catch (error) {
      console.error('Failed to process refund:', error);
    }
  }
}
function verifyDeliveryOTP(order, providedOtp) {
  if (!order.deliveryOtp || !providedOtp) {
    return false;
  }
  const hashedProvided = hashOTP(providedOtp);
  return order.deliveryOtp === hashedProvided;
}
function generateOTP() {
  return Math.floor(100000 + Math.random() * 900000).toString();
}
function hashOTP(otp) {
  return crypto.createHash('sha256').update(otp).digest('hex');
}
async function restaurantAcceptOrder({
  orderId,
  restaurantId,
  userId,
  estimatedPrepTime
}) {
  const order = await Order.findById(orderId);
  if (!order) {
    return {
      success: false,
      error: 'Order not found'
    };
  }
  if (order.restaurant.toString() !== restaurantId.toString()) {
    return {
      success: false,
      error: 'This order does not belong to your restaurant'
    };
  }
  if (isOnline(order) && order.paymentStatus !== 'paid') {
    return {
      success: false,
      error: 'Cannot accept order - payment not confirmed'
    };
  }
  const result = await updateOrderStatus({
    orderId: orderId,
    currentStatus: order.status,
    newStatus: 'accepted',
    userId: userId,
    userRole: 'restaurant_owner',
    reason: 'Restaurant accepted order',
    metadata: { estimatedPrepTime }
  });
  if (result.success && estimatedPrepTime) {
    order.estimatedDeliveryTime = new Date(Date.now() + estimatedPrepTime * 60000);
    await order.save();
  }
  return result;
}
async function restaurantRejectOrder({
  orderId,
  restaurantId,
  userId,
  reason
}) {
  const order = await Order.findById(orderId);
  if (!order) {
    return {
      success: false,
      error: 'Order not found'
    };
  }
  if (order.restaurant.toString() !== restaurantId.toString()) {
    return {
      success: false,
      error: 'This order does not belong to your restaurant'
    };
  }
  return await updateOrderStatus({
    orderId: orderId,
    currentStatus: order.status,
    newStatus: 'cancelled',
    userId: userId,
    userRole: 'restaurant_owner',
    reason: `Restaurant rejected: ${reason}`,
    metadata: {
      cancellationReason: reason,
      rejectedBy: 'restaurant'
    }
  });
}
async function markOrderReady({
  orderId,
  restaurantId,
  userId
}) {
  const order = await Order.findById(orderId);
  if (!order) {
    return {
      success: false,
      error: 'Order not found'
    };
  }
  if (order.restaurant.toString() !== restaurantId.toString()) {
    return {
      success: false,
      error: 'This order does not belong to your restaurant'
    };
  }
  return await updateOrderStatus({
    orderId: orderId,
    currentStatus: order.status,
    newStatus: 'ready',
    userId: userId,
    userRole: 'restaurant_owner',
    reason: 'Food is ready for pickup'
  });
}
async function riderPickupOrder({
  orderId,
  riderId,
  userId
}) {
  const order = await Order.findById(orderId);
  if (!order) {
    return {
      success: false,
      error: 'Order not found'
    };
  }
  if (!order.rider || order.rider.toString() !== riderId.toString()) {
    return {
      success: false,
      error: 'This order is not assigned to you'
    };
  }
  if (order.status !== 'ready' && order.status !== 'assigned' && order.status !== 'accepted_by_rider' && order.status !== 'arrived_restaurant') {
    return {
      success: false,
      error: 'Order is not ready for pickup yet. Current status: ' + order.status
    };
  }
  return await updateOrderStatus({
    orderId: orderId,
    currentStatus: order.status,
    newStatus: 'picked_up',
    userId: userId,
    userRole: 'rider',
    reason: 'Rider picked up the order'
  });
}
async function riderDeliverOrder({
  orderId,
  riderId,
  userId,
  deliveryOtp,
  adminOverride = false
}) {
  const order = await Order.findById(orderId);
  if (!order) {
    return {
      success: false,
      error: 'Order not found'
    };
  }
  if (!order.rider || order.rider.toString() !== riderId.toString()) {
    return {
      success: false,
      error: 'This order is not assigned to you'
    };
  }
  if (!adminOverride) {
    if (!deliveryOtp) {
      return {
        success: false,
        error: 'Delivery OTP is required'
      };
    }
    const otpValid = verifyDeliveryOTP(order, deliveryOtp);
    if (!otpValid) {
      return {
        success: false,
        error: 'Invalid delivery OTP'
      };
    }
  } else {
    await AuditLog.log({
      entity: 'Order',
      entityId: order._id,
      action: 'admin_override',
      userId: userId,
      userRole: 'admin',
      reason: 'Admin override for OTP validation',
      metadata: {
        action: 'delivery_without_otp'
      }
    });
  }
  return await updateOrderStatus({
    orderId: orderId,
    currentStatus: order.status,
    newStatus: 'delivered',
    userId: userId,
    userRole: 'rider',
    reason: adminOverride ? 'Delivered (Admin Override)' : 'Delivered with OTP verification'
  });
}
async function riderCancelDelivery({
  orderId,
  riderId,
  userId,
  reason
}) {
  const order = await Order.findById(orderId);
  if (!order) {
    return {
      success: false,
      error: 'Order not found'
    };
  }
  if (!order.rider || order.rider.toString() !== riderId.toString()) {
    return {
      success: false,
      error: 'This order is not assigned to you'
    };
  }
  if (order.status !== 'picked_up') {
    order.rider = null;
    order.status = 'ready'; // Back to ready for reassignment
    order.timeline.push({
      status: 'ready',
      timestamp: new Date()
    });
    await order.save();
    await AuditLog.log({
      entity: 'Order',
      entityId: order._id,
      action: 'rider_unassigned',
      userId: userId,
      userRole: 'rider',
      reason: `Rider cancelled: ${reason}`,
      metadata: {
        previousRider: riderId,
        needsReassignment: true
      }
    });
    return {
      success: true,
      message: 'Delivery cancelled. Order returned to queue for reassignment.',
      needsReassignment: true
    };
  }
  return {
    success: false,
    error: 'Cannot cancel after pickup. Please complete the delivery or contact support.'
  };
}
module.exports = {
  createOrderSafe,
  updateOrderStatus,
  verifyDeliveryOTP,
  generateOTP,
  hashOTP,
  restaurantAcceptOrder,
  restaurantRejectOrder,
  markOrderReady,
  riderPickupOrder,
  riderDeliverOrder,
  riderCancelDelivery
};
