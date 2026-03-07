const jwt = require('jsonwebtoken');
const User = require('../models/User');
const protect = async (req, res, next) => {
  try {
    let token = req.cookies.token;
    if (!token && req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
      token = req.headers.authorization.split(' ')[1];
    }
    if (!token) {
      return res.status(401).json({ message: "Not authorized, please login" });
    }
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = await User.findById(decoded._id || decoded.id).select('-password');
    if (!req.user) {
        return res.status(401).json({ message: "User not found" });
    }
    next();
  } catch (error) {
    console.error(error);
    res.status(401).json({ message: "Not authorized, token failed" });
  }
};
const admin = (req, res, next) => {
  if (req.user && req.user.role === 'admin') {
    next();
  } else {
    res.status(403).json({ message: 'Access Denied: Admins only' });
  }
};
const restaurantOwner = (req, res, next) => {
  if (req.user && (req.user.role === 'restaurant_owner' || req.user.role === 'admin')) {
    next();
  } else {
    res.status(403).json({ message: 'Access Denied: Restaurant Owners only' });
  }
};
const rider = (req, res, next) => {
  if (req.user && (req.user.role === 'rider' || req.user.role === 'admin')) {
    next();
  } else {
    res.status(403).json({ message: 'Access Denied: Riders only' });
  }
};
const customer = (req, res, next) => {
    if (req.user && req.user.role === 'customer') {
      next();
    } else {
      res.status(403).json({ message: 'Access Denied: Customers only' });
    }
  };
const requireRole = (...allowedRoles) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ 
        success: false,
        message: 'Authentication required' 
      });
    }
    if (!allowedRoles.includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        message: `Access Denied: Required role(s): ${allowedRoles.join(' or ')}`,
        userRole: req.user.role
      });
    }
    next();
  };
};
const ensureOwnRestaurant = async (req, res, next) => {
  if (req.user.role === 'admin') {
    return next(); // Admins can access any restaurant
  }
  if (req.user.role !== 'restaurant_owner') {
    return res.status(403).json({
      success: false,
      message: 'Only restaurant owners can access this resource'
    });
  }
  const restaurantId = req.params.restaurantId || req.body.restaurantId || req.params.id;
  if (!restaurantId) {
    return res.status(400).json({
      success: false,
      message: 'Restaurant ID is required'
    });
  }
  if (req.user.restaurant && req.user.restaurant.toString() !== restaurantId.toString()) {
    return res.status(403).json({
      success: false,
      message: 'Access Denied: You can only access your own restaurant data'
    });
  }
  next();
};
const ensureOwnDelivery = async (req, res, next) => {
  if (req.user.role === 'admin') {
    return next(); // Admins can access any order
  }
  if (req.user.role !== 'rider') {
    return res.status(403).json({
      success: false,
      message: 'Only riders can access this resource'
    });
  }
  const orderId = req.params.orderId || req.body.orderId || req.params.id;
  if (!orderId) {
    return res.status(400).json({
      success: false,
      message: 'Order ID is required'
    });
  }
  req.isRider = true;
  next();
};
const ensureOwnOrder = async (req, res, next) => {
  if (req.user.role === 'admin') {
    return next(); // Admins can access any order
  }
  if (req.user.role !== 'customer') {
    return res.status(403).json({
      success: false,
      message: 'Only customers can access this resource'
    });
  }
  req.isCustomer = true;
  next();
};
module.exports = { 
  protect, 
  admin, 
  restaurantOwner, 
  rider, 
  customer,
  requireRole,
  ensureOwnRestaurant,
  ensureOwnDelivery,
  ensureOwnOrder
};
