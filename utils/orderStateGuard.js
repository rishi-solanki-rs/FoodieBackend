
const AuditLog = require('../models/AuditLog');
const VALID_TRANSITIONS = {
  'placed': ['accepted', 'cancelled', 'failed'],
  'accepted': ['preparation', 'cancelled'],
  'preparation': ['ready', 'cancelled'],
  'ready': ['assigned', 'accepted_by_rider', 'cancelled'],
  'assigned': ['arrived_restaurant', 'picked_up', 'cancelled'],
  'accepted_by_rider': ['arrived_restaurant', 'picked_up', 'cancelled'],
  'arrived_restaurant': ['picked_up', 'cancelled'],
  'picked_up': ['arrived_customer', 'delivered'], // Cannot cancel after pickup
  'arrived_customer': ['delivered'],
  'delivered': [], // Terminal state
  'cancelled': [], // Terminal state
  'failed': [], // Terminal state
  'issue_reported': ['cancelled', 'delivered'] // Can resolve or cancel
};
const TERMINAL_STATUSES = ['delivered', 'cancelled', 'failed'];
function validateTransition(currentStatus, nextStatus) {
  const current = currentStatus?.toLowerCase();
  const next = nextStatus?.toLowerCase();
  if (!current || !next) {
    return {
      valid: false,
      error: 'Current and next status are required'
    };
  }
  if (TERMINAL_STATUSES.includes(current)) {
    return {
      valid: false,
      error: `Cannot change status from terminal state: ${current}`
    };
  }
  if (!VALID_TRANSITIONS[current]) {
    return {
      valid: false,
      error: `Unknown current status: ${current}`
    };
  }
  if (!VALID_TRANSITIONS[current].includes(next)) {
    return {
      valid: false,
      error: `Invalid transition from '${current}' to '${next}'. Allowed: ${VALID_TRANSITIONS[current].join(', ') || 'none'}`
    };
  }
  return {
    valid: true,
    error: null
  };
}
function canBeCancelled(currentStatus) {
  const current = currentStatus?.toLowerCase();
  if (TERMINAL_STATUSES.includes(current)) {
    return {
      canCancel: false,
      reason: `Order is already in terminal state: ${current}`
    };
  }
  const allowedTransitions = VALID_TRANSITIONS[current] || [];
  const canCancel = allowedTransitions.includes('cancelled');
  if (!canCancel) {
    return {
      canCancel: false,
      reason: `Cannot cancel order from status: ${current}. Order is too far in the delivery process.`
    };
  }
  return {
    canCancel: true,
    reason: null
  };
}
async function logStatusTransition({ orderId, oldStatus, newStatus, userId, userRole, reason }) {
  try {
    await AuditLog.create({
      entity: 'Order',
      entityId: orderId,
      action: 'status_change',
      userId: userId,
      userRole: userRole,
      changes: {
        field: 'status',
        oldValue: oldStatus,
        newValue: newStatus
      },
      reason: reason,
      metadata: {
        timestamp: new Date(),
        source: 'orderStateGuard'
      }
    });
  } catch (error) {
    console.error('Failed to log status transition:', error);
  }
}
async function validateAndLogTransition({ 
  orderId, 
  currentStatus, 
  nextStatus, 
  userId, 
  userRole, 
  reason 
}) {
  const validation = validateTransition(currentStatus, nextStatus);
  if (!validation.valid) {
    return validation;
  }
  await logStatusTransition({
    orderId,
    oldStatus: currentStatus,
    newStatus: nextStatus,
    userId,
    userRole,
    reason
  });
  return validation;
}
function getAllowedNextStatuses(currentStatus) {
  const current = currentStatus?.toLowerCase();
  return VALID_TRANSITIONS[current] || [];
}
module.exports = {
  validateTransition,
  canBeCancelled,
  logStatusTransition,
  validateAndLogTransition,
  getAllowedNextStatuses,
  VALID_TRANSITIONS,
  TERMINAL_STATUSES
};
