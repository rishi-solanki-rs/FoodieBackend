
const Restaurant = require('../models/Restaurant');
const Rider = require('../models/Rider');
const Cart = require('../models/Cart');
const { logger } = require('../utils/logger');
const checkRestaurantAvailability = async (restaurantId) => {
  const restaurant = await Restaurant.findById(restaurantId);
  if (!restaurant) {
    return { available: false, reason: 'Restaurant not found' };
  }
  if (!restaurant.isActive) {
    return { available: false, reason: 'Restaurant is inactive' };
  }
  if (!restaurant.restaurantApproved) {
    return { available: false, reason: 'Restaurant is not approved' };
  }
  if (restaurant.isTemporarilyClosed) {
    return { available: false, reason: 'Restaurant is temporarily closed' };
  }
  if (restaurant.timing) {
    const now = new Date();
    const timeZone = process.env.RESTAURANT_TIMEZONE || 'Asia/Kolkata';
    const dayFormatter = new Intl.DateTimeFormat('en-US', {
      weekday: 'long',
      timeZone,
    });
    const timeFormatter = new Intl.DateTimeFormat('en-US', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
      timeZone,
    });
    const currentDay = dayFormatter.format(now).toLowerCase();
    const timeParts = timeFormatter.formatToParts(now);
    const hourPart = timeParts.find((p) => p.type === 'hour');
    const minutePart = timeParts.find((p) => p.type === 'minute');
    const currentTime = `${hourPart?.value || '00'}:${minutePart?.value || '00'}`; // HH:MM
    const todayTiming = restaurant.timing[currentDay];
    if (todayTiming) {
      if (todayTiming.isClosed) {
        return { 
          available: false, 
          reason: `Restaurant is closed on ${currentDay}s` 
        };
      }
      if (todayTiming.open && todayTiming.close) {
        if (currentTime < todayTiming.open || currentTime > todayTiming.close) {
          return {
            available: false,
            reason: `Restaurant is closed. Hours: ${todayTiming.open} - ${todayTiming.close}`
          };
        }
      }
    }
  }
  return { available: true };
};
const checkRiderAvailability = async (restaurantLocation, minimumRiders = 1) => {
  if (!restaurantLocation || !restaurantLocation.coordinates) {
    return { available: false, reason: 'Restaurant location missing for rider matching' };
  }
  try {
    const nearbyRiders = await Rider.countDocuments({
      isOnline: true,
      isAvailable: true,
      verificationStatus: 'approved',
      currentLocation: {
        $geoWithin: {
          $centerSphere: [
            restaurantLocation.coordinates,
            10 / 6371 // 10km radius in radians (Earth radius ~6371km)
          ]
        }
      }
    });
    if (nearbyRiders < minimumRiders) {
      return {
        available: false,
        reason: `No riders available nearby. Currently ${nearbyRiders} riders online.`
      };
    }
    return { available: true, nearbyRiders };
  } catch (error) {
    logger.error('Rider availability check failed', { error: error.message });
    return { available: false, reason: 'Rider availability check failed' };
  }
};
const checkServiceAvailability = async (req, res, next) => {
  try {
    let restaurantId = req.body.restaurantId || req.body.restaurant;
    if (!restaurantId && req.user?._id) {
      const cart = await Cart.findOne({ user: req.user._id }).select('restaurant');
      if (cart?.restaurant) {
        restaurantId = cart.restaurant.toString();
      }
    }
    if (!restaurantId) {
      return res.status(400).json({ error: 'Restaurant ID is required' });
    }
    const restaurantCheck = await checkRestaurantAvailability(restaurantId);
    if (!restaurantCheck.available) {
      logger.warn('Service unavailable - Restaurant', {
        restaurantId,
        reason: restaurantCheck.reason,
        userId: req.user?._id
      });
      return res.status(503).json({
        error: 'Service unavailable',
        reason: restaurantCheck.reason,
        type: 'restaurant_unavailable'
      });
    }
    const restaurant = await Restaurant.findById(restaurantId).select('location');
    const riderCheck = await checkRiderAvailability(restaurant?.location);
    if (!riderCheck.available) {
      logger.warn('Service unavailable in placcing order - Riders', {
        restaurantId,
        reason: riderCheck.reason,
        userId: req.user?._id
      });
    }
    req.serviceAvailability = {
      restaurant: restaurantCheck,
      riders: riderCheck
    };
    next();
  } catch (error) {
    logger.error('Service availability check failed', {
      error: error.message,
      userId: req.user?._id
    });
    next();
  }
};
module.exports = {
  checkServiceAvailability,
  checkRestaurantAvailability,
  checkRiderAvailability
};
