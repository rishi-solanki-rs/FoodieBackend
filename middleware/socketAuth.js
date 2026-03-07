
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const Restaurant = require('../models/Restaurant');
const Rider = require('../models/Rider');
const socketAuth = async (socket, next) => {
  try {
    const token = socket.handshake.auth.token || socket.handshake.query.token;
    if (!token) {
      return next(new Error('Authentication error: No token provided'));
    }
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const userId = decoded._id || decoded.id || decoded.userId;
    const user = await User.findById(userId).select('-password');
    if (!user) {
      return next(new Error('Authentication error: User not found'));
    }
    socket.user = user;
    socket.userId = user._id.toString();
    socket.userRole = user.role;
    if (user.role === 'restaurant_owner') {
      const restaurant = await Restaurant.findOne({ owner: user._id }).select('_id');
      socket.restaurantId = restaurant?._id?.toString() || null;
    }
    if (user.role === 'rider') {
      const rider = await Rider.findOne({ user: user._id }).select('_id');
      socket.riderId = rider?._id?.toString() || null;
    }
    next();
  } catch (error) {
    console.error('Socket authentication error:', error.message);
    next(new Error('Authentication error: Invalid token'));
  }
};
module.exports = socketAuth;
