
exports.formatNotification = (type, title, message, data = {}) => {
  return {
    type: type, // 'order_update', 'rider_assigned', 'new_order_request', etc.
    title: title,
    message: message,
    data: {
      ...data,
      timestamp: new Date(),
      read: false
    }
  };
};
exports.formatOrderNotification = (event, order) => {
  const notificationMap = {
    'order:placed': {
      title: 'Order Placed',
      message: `Your order #${order._id} has been placed`,
      data: { orderId: order._id, amount: order.totalAmount, status: order.status }
    },
    'order:confirmed': {
      title: 'Order Confirmed',
      message: `Restaurant confirmed your order #${order._id}`,
      data: { orderId: order._id, status: order.status }
    },
    'order:ready': {
      title: 'Order Ready',
      message: `Your order #${order._id} is ready for pickup`,
      data: { orderId: order._id, status: order.status }
    },
    'order:rider_assigned': {
      title: 'Rider Assigned',
      message: `A delivery rider has been assigned to your order`,
      data: { 
        orderId: order._id, 
        riderName: order.rider?.name || 'Rider',
        estimatedTime: '15-20 mins'
      }
    },
    'order:picked_up': {
      title: 'Order Picked Up',
      message: `Your food has been picked up by the rider`,
      data: { orderId: order._id, status: order.status }
    },
    'order:on_the_way': {
      title: 'On The Way',
      message: `Your order is on the way to you`,
      data: { orderId: order._id, status: order.status }
    },
    'order:delivered': {
      title: 'Order Delivered',
      message: `Your order has been delivered successfully`,
      data: { orderId: order._id, status: order.status }
    },
    'order:cancelled': {
      title: 'Order Cancelled',
      message: `Your order #${order._id} has been cancelled`,
      data: { orderId: order._id, status: order.status, reason: order.cancellationReason || '' }
    }
  };
  const notif = notificationMap[event] || {
    title: 'Order Update',
    message: `Order #${order._id} has been updated`,
    data: { orderId: order._id, status: order.status }
  };
  return exports.formatNotification('order_update', notif.title, notif.message, notif.data);
};
exports.formatRiderNotification = (event, data = {}) => {
  const notificationMap = {
    'rider:new_order_request': {
      title: 'New Delivery Offer',
      message: `Earn ₹${data.earnings || 0} for a delivery from ${data.restaurantName || 'Restaurant'}`,
      data: { 
        ...data,
        type: 'order_request'
      }
    },
    'rider:order_accepted': {
      title: 'Order Assigned',
      message: `You have accepted delivery order #${data.orderId}. Head to restaurant now.`,
      data: { 
        ...data,
        type: 'order_assigned'
      }
    },
    'rider:ready_for_pickup': {
      title: 'Ready for Pickup',
      message: `Order is ready at the restaurant. Pick it up now.`,
      data: { 
        ...data,
        type: 'ready_for_pickup'
      }
    },
    'rider:order_completed': {
      title: 'Delivery Complete',
      message: `Great! You completed the order. Earning: ₹${data.earnings || 0}`,
      data: { 
        ...data,
        type: 'order_completed'
      }
    }
  };
  const notif = notificationMap[event] || {
    title: 'Delivery Update',
    message: 'You have a new update',
    data: data
  };
  return exports.formatNotification('rider_notification', notif.title, notif.message, notif.data);
};
exports.formatRestaurantNotification = (event, data = {}) => {
  const notificationMap = {
    'restaurant:new_order': {
      title: 'New Order',
      message: `New order #${data.orderId} received for ₹${data.amount}`,
      data: { 
        ...data,
        type: 'new_order',
        priority: 'high'
      }
    },
    'restaurant:order_ready': {
      title: 'Mark Order Ready',
      message: `Order #${data.orderId} is ready for delivery`,
      data: { 
        ...data,
        type: 'order_ready'
      }
    },
    'restaurant:order_cancelled': {
      title: 'Order Cancelled',
      message: `Order #${data.orderId} has been cancelled`,
      data: { 
        ...data,
        type: 'order_cancelled',
        reason: data.reason || ''
      }
    }
  };
  const notif = notificationMap[event] || {
    title: 'Restaurant Update',
    message: 'You have a new update',
    data: data
  };
  return exports.formatNotification('restaurant_notification', notif.title, notif.message, notif.data);
};
exports.formatAdminNotification = (event, data = {}) => {
  const notificationMap = {
    'admin:new_restaurant': {
      title: 'New Restaurant Application',
      message: `${data.restaurantName} has applied to be a partner`,
      data: { 
        ...data,
        type: 'new_restaurant',
        priority: 'medium'
      }
    },
    'admin:rider_sos': {
      title: 'Rider SOS Alert',
      message: `Rider ${data.riderName} has triggered an SOS alert`,
      data: { 
        ...data,
        type: 'sos_alert',
        priority: 'critical'
      }
    },
    'admin:payment_failed': {
      title: 'Payment Failed',
      message: `Payment failed for order #${data.orderId}`,
      data: { 
        ...data,
        type: 'payment_failed',
        priority: 'high'
      }
    }
  };
  const notif = notificationMap[event] || {
    title: 'Admin Alert',
    message: 'Requires your attention',
    data: data
  };
  return exports.formatNotification('admin_notification', notif.title, notif.message, notif.data);
};
exports.formatErrorNotification = (message, errorType = 'error') => {
  return exports.formatNotification('error', 'Error', message, {
    type: 'error',
    errorType: errorType,
    severity: 'high'
  });
};
exports.formatSuccessNotification = (message, data = {}) => {
  return exports.formatNotification('success', 'Success', message, {
    type: 'success',
    ...data
  });
};
