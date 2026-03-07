
let io;
module.exports = {
  init: (socketIO) => {
    io = socketIO;
    console.log('Socket.IO service initialized');
    return io;
  },
  getIO: () => {
    if (!io) {
      throw new Error('Socket.IO not initialized! Call init() first.');
    }
    return io;
  },
  emitToUser: (userId, event, data) => {
    if (!io) return;
    io.to(`user:${userId}`).emit(event, data);
  },
  emitToCustomer: (customerId, event, data) => {
    if (!io) return;
    io.to(`customer:${customerId}`).emit(event, data);
  },
  emitToAdmin: (event, data) => {
    if (!io) {
      console.error('❌ Socket.IO not initialized - cannot emit to admin');
      return;
    }
    console.log(`📡 Emitting to admin:dashboard room - Event: ${event}`, data);
    const adminRoom = io.sockets.adapter.rooms.get('admin:dashboard');
    console.log(`👥 Admin room has ${adminRoom ? adminRoom.size : 0} connected clients`);
    io.to('admin:dashboard').emit(event, data);
  },
  emitToRestaurant: (restaurantId, event, data) => {
    if (!io) return;
    io.to(`restaurant:${restaurantId}`).emit(event, data);
  },
  emitToRider: (riderId, event, data) => {
    if (!io) return;
    io.to(`rider:${riderId}`).emit(event, data);
  },
  emitToRiderByUserId: (userId, event, data) => {
    if (!io) return;
    io.to(`rider:${userId}`).emit(event, data);
  },
  emitToZone: (zoneId, event, data) => {
    if (!io) return;
    io.to(`zone:${zoneId}`).emit(event, data);
  },
  emitToOrder: (orderId, event, data) => {
    if (!io) return;
    io.to(`order:${orderId}`).emit(event, data);
  },
  emitToAll: (event, data) => {
    if (!io) return;
    io.emit(event, data);
  },
  getConnectionCount: () => {
    if (!io) return 0;
    return io.engine.clientsCount;
  }
};
