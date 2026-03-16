
// const socketAuth = require('../middleware/socketAuth');
// const socketService = require('../services/socketService');
// module.exports = (io) => {
//   socketService.init(io);
//   io.use(socketAuth);
//   io.on('connection', (socket) => {
//     console.log(`✅ User connected: ${socket.userId} (${socket.userRole})`);
//     socket.join(`user:${socket.userId}`);
//     if (socket.userRole === 'admin') {
//       socket.join('admin:dashboard');
//       console.log(`👤 Admin joined dashboard: ${socket.userId}`);
//     }
//     if (socket.userRole === 'restaurant_owner' && socket.restaurantId) {
//       socket.join(`restaurant:${socket.restaurantId}`);
//       console.log(`🍽️ Restaurant owner joined: ${socket.restaurantId}`);
//     }
//     if (socket.userRole === 'customer') {
//       socket.join(`customer:${socket.userId}`);
//       console.log(`🧑 Customer joined: ${socket.userId}`);
//     }
//     if (socket.userRole === 'rider') {
//       socket.join(`rider:${socket.userId}`);
//       if (socket.riderId && socket.riderId !== socket.userId) {
//         socket.join(`rider:${socket.riderId}`);
//       }
//       console.log(`🏍️ Rider joined: ${socket.userId}`);
//       socket.locationStreamingEnabled = false;
//       socket.lastLocationBroadcast = Date.now();
//     }
//     socket.on('join:order', (orderId) => {
//       socket.join(`order:${orderId}`);
//       console.log(`📦 User ${socket.userId} joined order: ${orderId}`);
//     });
//     socket.on('leave:order', (orderId) => {
//       socket.leave(`order:${orderId}`);
//       console.log(`📦 User ${socket.userId} left order: ${orderId}`);
//     });
//     socket.on('rider:status', async (status) => {
//       if (socket.userRole === 'rider') {
//         if (status === 'online' || status === 'busy') {
//           socket.locationStreamingEnabled = true;
//           socket.emit('rider:streaming_started', {
//             success: true,
//             message: 'Location streaming enabled automatically',
//             instructions: 'Please start sending location updates via rider:location event every 5-10 seconds',
//             timestamp: new Date()
//           });
//           console.log(`📍 Location streaming AUTO-ENABLED for rider ${socket.userId} (status: ${status})`);
//         } else {
//           socket.locationStreamingEnabled = false;
//           socket.emit('rider:streaming_stopped', {
//             success: true,
//             message: 'Location streaming disabled automatically',
//             timestamp: new Date()
//           });
//           console.log(`🛑 Location streaming AUTO-DISABLED for rider ${socket.userId} (status: ${status})`);
//         }
//         socketService.emitToAdmin('rider:status_update', {
//           riderId: socket.userId,
//           riderUserId: socket.userId,
//           status,
//           locationStreamingEnabled: socket.locationStreamingEnabled,
//           isOnline: status === 'online' || status === 'busy',
//           timestamp: new Date()
//         });
//         console.log(`🏍️ Rider ${socket.userId} status: ${status}`);
//       }
//     });
//     socket.on('rider:start_tracking', () => {
//       if (socket.userRole === 'rider') {
//         socket.locationStreamingEnabled = true;
//         socket.emit('rider:tracking_started', {
//           success: true,
//           message: 'Location tracking started',
//           timestamp: new Date()
//         });
//         console.log(`📍 Location tracking STARTED for rider ${socket.userId}`);
//       }
//     });
//     socket.on('rider:stop_tracking', () => {
//       if (socket.userRole === 'rider') {
//         socket.locationStreamingEnabled = false;
//         socket.emit('rider:tracking_stopped', {
//           success: true,
//           message: 'Location tracking stopped',
//           timestamp: new Date()
//         });
//         console.log(`🛑 Location tracking STOPPED for rider ${socket.userId}`);
//       }
//     });
//     socket.on('rider:location', async (locationData) => {
//       if (socket.userRole === 'rider') {
//         try {
//           const { latitude, longitude, orderId, accuracy, speed, heading } = locationData;
//           if (!latitude || !longitude || 
//               typeof latitude !== 'number' || typeof longitude !== 'number' ||
//               latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) {
//             socket.emit('error', { message: 'Invalid coordinates' });
//             return;
//           }
//           const Rider = require('../models/Rider');
//           const Order = require('../models/Order');
//           const locationUtils = require('../utils/locationUtils');
//           setImmediate(async () => {
//             try {
//               await Rider.findOneAndUpdate(
//                 { user: socket.userId },
//                 { 
//                   currentLocation: { 
//                     type: 'Point', 
//                     coordinates: [longitude, latitude] 
//                   },
//                   lastLocationUpdateAt: new Date()
//                 },
//                 { new: false } // Don't wait for response
//               );
//             } catch (dbErr) {
//               console.error(`❌ Database update failed for rider ${socket.userId}:`, dbErr.message);
//             }
//           });
//           socketService.emitToAdmin('rider:location_updated', {
//             riderId: socket.riderId || socket.userId,
//             latitude,
//             longitude,
//             accuracy: accuracy || null,
//             speed: speed || null,
//             heading: heading || null,
//             timestamp: new Date()
//           });
//           setImmediate(async () => {
//             try {
//               const activeOrders = await Order.find({
//                 rider: socket.riderId || socket.userId,
//                 status: { $in: ['assigned', 'accepted_by_rider', 'reached_restaurant', 'arrived_restaurant', 'picked_up', 'delivery_arrived'] }
//               }).select('_id customer deliveryAddress status');
//               for (const order of activeOrders) {
//                 try {
//                   const eta = order.deliveryAddress?.coordinates 
//                     ? locationUtils.calculateETA(
//                         [longitude, latitude],
//                         order.deliveryAddress.coordinates,
//                         order.status
//                       )
//                     : null;
//                   socketService.emitToCustomer(order.customer.toString(), 'rider:location_updated', {
//                     orderId: order._id,
//                     riderLocation: {
//                       lat: latitude,
//                       long: longitude,
//                       accuracy,
//                       speed,
//                       heading
//                     },
//                     eta,
//                     timestamp: new Date()
//                   });
//                   socketService.emitToOrder(order._id.toString(), 'rider:location', {
//                     riderId: socket.userId,
//                     latitude,
//                     longitude,
//                     accuracy,
//                     speed,
//                     heading,
//                     eta,
//                     timestamp: new Date()
//                   });
//                 } catch (orderErr) {
//                   console.error(`❌ Error broadcasting to order ${order._id}:`, orderErr.message);
//                 }
//               }
//             } catch (queryErr) {
//               console.error(`❌ Error fetching active orders for rider ${socket.userId}:`, queryErr.message);
//             }
//           });
//           socket.emit('rider:location_ack', {
//             success: true,
//             timestamp: new Date()
//           });
//         } catch (err) {
//           console.error(`❌ Error handling rider location:`, err);
//           socket.emit('error', { message: 'Failed to process location update' });
//         }
//       }
//     });
//     socket.on('rider:sos', async (sosData) => {
//       if (socket.userRole === 'rider') {
//         const { latitude, longitude, message, orderId } = sosData;
//         socketService.emitToAdmin('rider:sos_alert', {
//           riderId: socket.userId,
//           riderName: socket.user.name,
//           latitude,
//           longitude,
//           message,
//           orderId,
//           timestamp: new Date(),
//           urgent: true
//         });
//         console.log(`🚨 SOS ALERT from rider ${socket.userId}`);
//       }
//     });
//     socket.on('disconnect', () => {
//       console.log(`❌ User disconnected: ${socket.userId}`);
//       if (socket.userRole === 'rider') {
//         socketService.emitToAdmin('rider:disconnected', {
//           riderId: socket.userId,
//           timestamp: new Date()
//         });
//       }
//     });
//     socket.emit('connected', {
//       userId: socket.userId,
//       role: socket.userRole,
//       timestamp: new Date(),
//       message: 'Successfully connected to real-time server'
//     });
//   });
//   console.log('🔌 Socket.IO initialized and ready');
// };

const socketAuth = require('../middleware/socketAuth');
const socketService = require('../services/socketService');
module.exports = (io) => {
  socketService.init(io);
  io.use(socketAuth);
  io.on('connection', (socket) => {
    console.log(`✅ User connected: ${socket.userId} (${socket.userRole})`);
    socket.join(`user:${socket.userId}`);
    if (socket.userRole === 'admin') {
      socket.join('admin:dashboard');
      console.log(`👤 Admin joined dashboard: ${socket.userId}`);
    }
    if (socket.userRole === 'restaurant_owner' && socket.restaurantId) {
      socket.join(`restaurant:${socket.restaurantId}`);
      console.log(`🍽️ Restaurant owner joined: ${socket.restaurantId}`);
    }
    if (socket.userRole === 'customer') {
      socket.join(`customer:${socket.userId}`);
      console.log(`🧑 Customer joined: ${socket.userId}`);
    }
    if (socket.userRole === 'rider') {
      socket.join(`rider:${socket.userId}`);
      if (socket.riderId && socket.riderId !== socket.userId) {
        socket.join(`rider:${socket.riderId}`);
      }
      console.log(`🏍️ Rider joined: ${socket.userId}`);
      socket.locationStreamingEnabled = false;
      socket.lastLocationBroadcast = Date.now();
    }
    socket.on('join:order', (orderId) => {
      socket.join(`order:${orderId}`);
      console.log(`📦 User ${socket.userId} joined order: ${orderId}`);
    });
    socket.on('leave:order', (orderId) => {
      socket.leave(`order:${orderId}`);
      console.log(`📦 User ${socket.userId} left order: ${orderId}`);
    });
    socket.on('rider:status', async (status) => {
      if (socket.userRole === 'rider') {
        if (status === 'online' || status === 'busy') {
          socket.locationStreamingEnabled = true;
          socket.emit('rider:streaming_started', {
            success: true,
            message: 'Location streaming enabled automatically',
            instructions: 'Please start sending location updates via rider:location event every 5-10 seconds',
            timestamp: new Date()
          });
          console.log(`📍 Location streaming AUTO-ENABLED for rider ${socket.userId} (status: ${status})`);
        } else {
          socket.locationStreamingEnabled = false;
          socket.emit('rider:streaming_stopped', {
            success: true,
            message: 'Location streaming disabled automatically',
            timestamp: new Date()
          });
          console.log(`🛑 Location streaming AUTO-DISABLED for rider ${socket.userId} (status: ${status})`);
        }
        socketService.emitToAdmin('rider:status_update', {
          riderId: socket.userId,
          riderUserId: socket.userId,
          status,
          locationStreamingEnabled: socket.locationStreamingEnabled,
          isOnline: status === 'online' || status === 'busy',
          timestamp: new Date()
        });
        console.log(`🏍️ Rider ${socket.userId} status: ${status}`);
      }
    });
    socket.on('rider:start_tracking', () => {
      if (socket.userRole === 'rider') {
        socket.locationStreamingEnabled = true;
        socket.emit('rider:tracking_started', {
          success: true,
          message: 'Location tracking started',
          timestamp: new Date()
        });
        console.log(`📍 Location tracking STARTED for rider ${socket.userId}`);
      }
    });
    socket.on('rider:stop_tracking', () => {
      if (socket.userRole === 'rider') {
        socket.locationStreamingEnabled = false;
        socket.emit('rider:tracking_stopped', {
          success: true,
          message: 'Location tracking stopped',
          timestamp: new Date()
        });
        console.log(`🛑 Location tracking STOPPED for rider ${socket.userId}`);
      }
    });
    socket.on('rider:location', async (locationData) => {
      if (socket.userRole === 'rider') {
        try {
          const { latitude, longitude, orderId, accuracy, speed, heading } = locationData;
          if (!latitude || !longitude || 
              typeof latitude !== 'number' || typeof longitude !== 'number' ||
              latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) {
            socket.emit('error', { message: 'Invalid coordinates' });
            return;
          }
          const Rider = require('../models/Rider');
          const Order = require('../models/Order');
          const locationUtils = require('../utils/locationUtils');
          setImmediate(async () => {
            try {
              await Rider.findOneAndUpdate(
                { user: socket.userId },
                { 
                  currentLocation: { 
                    type: 'Point', 
                    coordinates: [longitude, latitude] 
                  },
                  lastLocationUpdateAt: new Date()
                },
                { new: false } // Don't wait for response
              );
            } catch (dbErr) {
              console.error(`❌ Database update failed for rider ${socket.userId}:`, dbErr.message);
            }
          });
          socketService.emitToAdmin('rider:location_updated', {
            riderId: socket.riderId || socket.userId,
            latitude,
            longitude,
            accuracy: accuracy || null,
            speed: speed || null,
            heading: heading || null,
            timestamp: new Date()
          });
          setImmediate(async () => {
            try {
              const activeOrders = await Order.find({
                rider: socket.riderId || socket.userId,
                status: { $in: ['assigned', 'accepted_by_rider', 'reached_restaurant', 'arrived_restaurant', 'picked_up', 'delivery_arrived'] }
              }).select('_id customer deliveryAddress status');
              for (const order of activeOrders) {
                try {
                  const eta = order.deliveryAddress?.coordinates 
                    ? locationUtils.calculateETA(
                        [longitude, latitude],
                        order.deliveryAddress.coordinates,
                        order.status
                      )
                    : null;
                  socketService.emitToCustomer(order.customer.toString(), 'rider:location_updated', {
                    orderId: order._id,
                    riderLocation: {
                      lat: latitude,
                      long: longitude,
                      accuracy,
                      speed,
                      heading
                    },
                    eta,
                    timestamp: new Date()
                  });
                  socketService.emitToOrder(order._id.toString(), 'rider:location', {
                    riderId: socket.userId,
                    latitude,
                    longitude,
                    accuracy,
                    speed,
                    heading,
                    eta,
                    timestamp: new Date()
                  });
                } catch (orderErr) {
                  console.error(`❌ Error broadcasting to order ${order._id}:`, orderErr.message);
                }
              }
            } catch (queryErr) {
              console.error(`❌ Error fetching active orders for rider ${socket.userId}:`, queryErr.message);
            }
          });
          socket.emit('rider:location_ack', {
            success: true,
            timestamp: new Date()
          });
        } catch (err) {
          console.error(`❌ Error handling rider location:`, err);
          socket.emit('error', { message: 'Failed to process location update' });
        }
      }
    });
    socket.on('rider:sos', async (sosData) => {
      if (socket.userRole === 'rider') {
        const { latitude, longitude, message, orderId } = sosData;
        socketService.emitToAdmin('rider:sos_alert', {
          riderId: socket.userId,
          riderName: socket.user.name,
          latitude,
          longitude,
          message,
          orderId,
          timestamp: new Date(),
          urgent: true
        });
        console.log(`🚨 SOS ALERT from rider ${socket.userId}`);
      }
    });
    socket.on('debug:ping', () => {
      socket.emit('debug:pong', {
        userId: socket.userId,
        role: socket.userRole,
        rooms: [...socket.rooms],
        riderId: socket.riderId || null,
        locationStreamingEnabled: socket.locationStreamingEnabled || false,
        timestamp: new Date(),
      });
      console.log(`🐞 debug:ping from ${socket.userId} → pong sent`);
    });
    socket.on('disconnect', () => {
      console.log(`❌ User disconnected: ${socket.userId}`);
      if (socket.userRole === 'rider') {
        const Rider = require('../models/Rider');
        Rider.findOneAndUpdate(
          { user: socket.userId },
          { isOnline: false, isAvailable: false },
          { new: false }
        ).catch((err) => console.error(`❌ Failed to set rider offline on disconnect:`, err.message));
        socketService.emitToAdmin('rider:disconnected', {
          riderId: socket.userId,
          timestamp: new Date()
        });
      }
    });
    socket.emit('connected', {
      userId: socket.userId,
      role: socket.userRole,
      timestamp: new Date(),
      message: 'Successfully connected to real-time server'
    });
  });
  console.log('🔌 Socket.IO initialized and ready');
};