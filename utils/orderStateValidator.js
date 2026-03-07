
const logger = require('./logger');
const validTransitions = {
  "pending": ["placed", "failed", "cancelled"],
  "placed": ["accepted", "cancelled"],
  "accepted": ["preparing", "cancelled"],
  "preparing": ["ready", "cancelled"],
  "ready": ["assigned"],
  "assigned": ["reached_restaurant", "picked_up", "cancelled"],
  "reached_restaurant": ["picked_up"],
  "picked_up": ["delivery_arrived"],
  "delivery_arrived": ["delivered"],
  "delivered": [],
  "failed": [],
  "cancelled": [],
};
const allStatuses = Object.keys(validTransitions);
const ORDER_STATES = {
  PLACED: 'placed',
  ACCEPTED: 'accepted',
  PREPARING: 'preparing',
  READY: 'ready',
  ASSIGNED: 'assigned',
  REACHED_RESTAURANT: 'reached_restaurant',
  PICKED_UP: 'picked_up',
  DELIVERY_ARRIVED: 'delivery_arrived',
  DELIVERED: 'delivered',
  CANCELLED: 'cancelled'
};
const DELIVERY_STATES = {
  ASSIGNED: 'assigned',
  PICKED_UP: 'picked_up',
  DELIVERY_ARRIVED: 'delivery_arrived',
  DELIVERED: 'delivered',
  CANCELLED: 'cancelled'
};
const VALID_ORDER_TRANSITIONS = {
  [ORDER_STATES.PLACED]: [
    ORDER_STATES.ACCEPTED,
    ORDER_STATES.CANCELLED
  ],
  [ORDER_STATES.ACCEPTED]: [
    ORDER_STATES.PREPARING,
    ORDER_STATES.CANCELLED
  ],
  [ORDER_STATES.PREPARING]: [
    ORDER_STATES.READY,
    ORDER_STATES.CANCELLED
  ],
  [ORDER_STATES.READY]: [
    ORDER_STATES.ASSIGNED,
    ORDER_STATES.CANCELLED
  ],
  [ORDER_STATES.ASSIGNED]: [
    ORDER_STATES.PICKED_UP,
    ORDER_STATES.CANCELLED // Rare, e.g. accident
  ],
  [ORDER_STATES.DELIVERED]: [
    ORDER_STATES.ISSUE_REPORTED
  ],
  [ORDER_STATES.CANCELLED]: [],
  [ORDER_STATES.FAILED]: [
    ORDER_STATES.PLACED
  ],
  [ORDER_STATES.ISSUE_REPORTED]: []
};
const VALID_DELIVERY_TRANSITIONS = {
  [DELIVERY_STATES.PENDING]: [
    DELIVERY_STATES.SEARCHING,
    DELIVERY_STATES.CANCELLED
  ],
  [DELIVERY_STATES.SEARCHING]: [
    DELIVERY_STATES.ASSIGNED,
    DELIVERY_STATES.PENDING, // Rider rejected/timeout, back to pending/searching
    DELIVERY_STATES.CANCELLED
  ],
  [DELIVERY_STATES.ASSIGNED]: [
    DELIVERY_STATES.ARRIVED_PICKUP,
    DELIVERY_STATES.SEARCHING, // Rider unassigned/cancelled
    DELIVERY_STATES.CANCELLED
  ],
  [DELIVERY_STATES.ARRIVED_PICKUP]: [
    DELIVERY_STATES.PICKED_UP,
    DELIVERY_STATES.CANCELLED
  ],
  [DELIVERY_STATES.PICKED_UP]: [
    DELIVERY_STATES.ARRIVED_DROP,
    DELIVERY_STATES.CANCELLED
  ],
  [DELIVERY_STATES.ARRIVED_DROP]: [
    DELIVERY_STATES.DELIVERED,
    DELIVERY_STATES.CANCELLED
  ],
  [DELIVERY_STATES.DELIVERED]: [],
  [DELIVERY_STATES.CANCELLED]: []
};
const validateOrderState = (currentState, newState, isAdmin = false) => {
  if (isAdmin) {
    if (currentState === ORDER_STATES.CANCELLED && newState !== ORDER_STATES.CANCELLED) {
      return { valid: false, error: 'Cannot change status of cancelled order' };
    }
    return { valid: true, error: null };
  }
  if (currentState === newState) return { valid: true, error: null };
  const allowed = validTransitions[currentState] || [];
  if (!allowed.includes(newState)) {
    return {
      valid: false,
      error: `Invalid Order Status transition from '${currentState}' to '${newState}'. Allowed: ${allowed.join(', ') || 'none'}`
    };
  }
  return { valid: true, error: null };
};
const validateDeliveryState = (currentState, newState) => {
  if (currentState === newState) return { valid: true, error: null };
  const allowed = VALID_DELIVERY_TRANSITIONS[currentState] || [];
  if (!allowed.includes(newState)) {
    return {
      valid: false,
      error: `Invalid Delivery Status transition from '${currentState}' to '${newState}'. Allowed: ${allowed.join(', ') || 'none'}`
    };
  }
  return { valid: true, error: null };
};
const validateRestaurantAcceptance = (order) => {
  if (order.status !== ORDER_STATES.PLACED) {
    return { valid: false, error: `Order must be in 'placed' status to accept. Current status: '${order.status}'. ${order.status === 'pending' ? 'Waiting for customer payment.' : ''}` };
  }
  if (order.paymentMethod === 'online' && order.paymentStatus !== 'paid') {
    return { valid: false, error: 'Cannot accept order with unpaid online payment' };
  }
  return { valid: true, error: null };
};
const validateRestaurantMarkReady = (order) => {
  if (order.status !== ORDER_STATES.PREPARING) {
    return { valid: false, error: `Order must be 'preparing' to mark ready.` };
  }
  return { valid: true, error: null };
};
const validateRiderPickup = (order, riderId) => {
  if (!order.rider || order.rider.toString() !== riderId.toString()) {
    return { valid: false, error: 'Order not assigned to you' };
  }
  const pickupAllowedStatuses = ['assigned', 'reached_restaurant', 'ready'];
  if (!pickupAllowedStatuses.includes(order.status)) {
    return { valid: false, error: `Order must be in assigned or reached_restaurant status to pick up. Current: ${order.status}` };
  }
  return { valid: true, error: null };
};
const validateRiderDelivery = (order, riderId) => {
  if (!order.rider || order.rider.toString() !== riderId.toString()) {
    return { valid: false, error: 'Order not assigned to you' };
  }
  if (order.status !== "delivery_arrived") {
    return { valid: false, error: `You must arrive at customer location first.` };
  }
  return { valid: true, error: null };
};
const canBeCancelled = (currentState) => {
  return [ORDER_STATES.PLACED, ORDER_STATES.ACCEPTED, ORDER_STATES.PREPARING].includes(currentState);
};
module.exports = {
  ORDER_STATES,
  DELIVERY_STATES,
  validTransitions,
  validateOrderState,
  validateDeliveryState,
  validateRestaurantAcceptance,
  validateRestaurantMarkReady,
  validateRiderPickup,
  validateRiderDelivery,
  canBeCancelled
};
