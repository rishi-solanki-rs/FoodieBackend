
const winston = require('winston');
const path = require('path');
const logFormat = winston.format.combine(
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
  winston.format.errors({ stack: true }),
  winston.format.splat(),
  winston.format.json()
);
const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: logFormat,
  defaultMeta: { service: 'food-delivery-api' },
  transports: [
    new winston.transports.Console({
      format: winston.format.combine(
        winston.format.colorize(),
        winston.format.printf(({ timestamp, level, message, ...meta }) => {
          return `${timestamp} [${level}]: ${message} ${Object.keys(meta).length ? JSON.stringify(meta) : ''}`;
        })
      )
    }),
    new winston.transports.File({ 
      filename: path.join(__dirname, '../logs/combined.log')
    }),
    new winston.transports.File({ 
      filename: path.join(__dirname, '../logs/error.log'),
      level: 'error'
    })
  ]
});
const logOrderTransition = (orderId, oldStatus, newStatus, userId, userRole, reason = null) => {
  logger.info('Order state transition', {
    event: 'ORDER_STATE_CHANGE',
    orderId,
    oldStatus,
    newStatus,
    userId,
    userRole,
    reason,
    timestamp: new Date().toISOString()
  });
};
const logPayment = (orderId, userId, paymentMethod, amount, status, error = null) => {
  const normalizedStatus = String(status || '').toLowerCase();
  const level = normalizedStatus === 'failed' ? 'error' : 'info';
  logger[level]('Payment attempt', {
    event: 'PAYMENT_ATTEMPT',
    orderId,
    userId,
    paymentMethod,
    amount,
    status,
    error: error ? error.message : null,
    timestamp: new Date().toISOString()
  });
};
const logRefund = (orderId, userId, amount, reason, status) => {
  logger.info('Refund request', {
    event: 'REFUND_REQUEST',
    orderId,
    userId,
    amount,
    reason,
    status,
    timestamp: new Date().toISOString()
  });
};
const logRiderAssignment = (orderId, riderId, restaurantId, assignmentType = 'auto') => {
  logger.info('Rider assignment', {
    event: 'RIDER_ASSIGNED',
    orderId,
    riderId,
    restaurantId,
    assignmentType, // 'auto' or 'manual'
    timestamp: new Date().toISOString()
  });
};
const logOTP = (orderId, action, success, riderId = null) => {
  const level = success ? 'info' : 'warn';
  logger[level]('OTP operation', {
    event: 'OTP_OPERATION',
    orderId,
    action, // 'generated' or 'verified'
    success,
    riderId,
    timestamp: new Date().toISOString()
  });
};
const logRestaurantAction = (orderId, restaurantId, action, reason = null) => {
  logger.info('Restaurant action', {
    event: 'RESTAURANT_ACTION',
    orderId,
    restaurantId,
    action, // 'accepted' or 'rejected'
    reason,
    timestamp: new Date().toISOString()
  });
};
const logAuth = (userId, action, success, ipAddress = null, reason = null) => {
  const level = success ? 'info' : 'warn';
  logger[level]('Authentication event', {
    event: 'AUTH_EVENT',
    userId,
    action, // 'login', 'logout', 'token_refresh', 'password_reset'
    success,
    ipAddress,
    reason,
    timestamp: new Date().toISOString()
  });
};
const logWalletTransaction = (userId, type, amount, orderId = null, balance = null) => {
  logger.info('Wallet transaction', {
    event: 'WALLET_TRANSACTION',
    userId,
    type, // 'debit', 'credit', 'refund'
    amount,
    orderId,
    balance,
    timestamp: new Date().toISOString()
  });
};
const logCouponUsage = (userId, couponCode, orderId, discountAmount, success) => {
  const level = success ? 'info' : 'warn';
  logger[level]('Coupon usage', {
    event: 'COUPON_USAGE',
    userId,
    couponCode,
    orderId,
    discountAmount,
    success,
    timestamp: new Date().toISOString()
  });
};
const logSecurity = (userId, event, severity, details) => {
  logger.warn('Security event', {
    event: 'SECURITY_EVENT',
    userId,
    eventType: event, // 'rate_limit_exceeded', 'invalid_access', 'suspicious_activity'
    severity, // 'low', 'medium', 'high'
    details,
    timestamp: new Date().toISOString()
  });
};
const logRiderAction = (orderId, riderId, action, reason = null) => {
  logger.info('Rider action', {
    event: 'RIDER_ACTION',
    orderId,
    riderId,
    action, // 'accepted' or 'rejected'
    reason,
    timestamp: new Date().toISOString()
  });
};

module.exports = {
  logger,
  logOrderTransition,
  logPayment,
  logRefund,
  logRiderAssignment,
  logOTP,
  logRestaurantAction,
  logRiderAction,
  logAuth,
  logWalletTransaction,
  logCouponUsage,
  logSecurity
};