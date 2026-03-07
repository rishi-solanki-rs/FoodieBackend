
/**
 * Payment helper utilities - India-only, online payment (Razorpay) + wallet.
 */

function isOnline(order) {
  const paymentMethod = typeof order === 'string'
    ? order
    : order?.paymentMethod;
  return ['wallet', 'online'].includes(paymentMethod?.toLowerCase());
}

function isPaymentComplete(order) {
  return order?.paymentStatus === 'paid';
}

function shouldRestaurantSeeOrder(order) {
  if (order.paymentStatus === 'paid') {
    return { visible: true, reason: 'Payment successful' };
  }
  return { visible: false, reason: 'Awaiting payment confirmation' };
}

function requiresPaymentVerification(order) {
  return order?.paymentMethod === 'online' && order?.paymentStatus !== 'paid';
}

function getPaymentMethodName(paymentMethod) {
  const methodNames = {
    'wallet': 'Wallet',
    'online': 'Online Payment (Razorpay)',
  };
  return methodNames[paymentMethod?.toLowerCase()] || 'Unknown';
}

function validatePaymentForProgression(order) {
  if (order?.paymentStatus === 'paid') {
    return { valid: true, error: null };
  }
  if (order?.paymentStatus === 'pending') {
    return { valid: false, error: 'Payment is still pending. Cannot proceed with order.' };
  }
  if (order?.paymentStatus === 'failed') {
    return { valid: false, error: 'Payment failed. Order cannot be processed.' };
  }
  return { valid: false, error: 'Invalid payment status' };
}

module.exports = {
  isOnline,
  isPaymentComplete,
  shouldRestaurantSeeOrder,
  requiresPaymentVerification,
  getPaymentMethodName,
  validatePaymentForProgression
};
