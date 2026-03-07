const cron = require('node-cron');
const Order = require('../models/Order');
const User = require('../models/User');
const socketService = require('./socketService');
const initCronJobs = () => {
    console.log(' Initializing Cron Jobs...');
    cron.schedule('*/5 * * * *', async () => {
        try {
            console.log('Running Cleanup Jobs...');
            const now = new Date();
            const twentyMinsAgo = new Date(Date.now() - 20 * 60 * 1000);
            const sixHoursAgo = new Date(Date.now() - 6 * 60 * 60 * 1000);
            try {
                console.log('[Cleanup Job 1] Checking for unverified users with expired OTPs...');
                const expiredUsers = await User.find({
                    isVerified: false,
                    otpExpires: { $lt: now }
                });
                if (expiredUsers.length > 0) {
                    const deletedCount = await User.deleteMany({
                        isVerified: false,
                        otpExpires: { $lt: now }
                    });
                    console.log(`✅ Deleted ${deletedCount.deletedCount} unverified users with expired OTPs`);
                } else {
                    console.log('No expired unverified users found.');
                }
            } catch (error) {
                console.error('[Cleanup Job 1] Error:', error.message);
            }
            try {
                console.log('[Cleanup Job 2] Checking for stale orders...');
                const staleOrders = await Order.find({
                    status: 'placed',
                    paymentMethod: { $in: ['cod', 'wallet'] },
                    createdAt: { $lt: twentyMinsAgo }
                });
                if (staleOrders.length === 0) {
                    console.log('No stale COD/wallet orders found.');
                } else {
                    console.log(`Found ${staleOrders.length} stale COD/wallet orders.`);
                    for (const order of staleOrders) {
                        order.status = 'cancelled';
                        order.cancellationReason = 'System Auto-Cancel: Restaurant did not accept in time';
                        order.cancellationInitiatedBy = 'system';
                        order.cancelledAt = new Date();
                        order.timeline.push({ status: 'cancelled', timestamp: new Date(), label: 'Order Cancelled', by: 'system', description: 'Restaurant did not accept in time.' });
                        await order.save();
                        if (socketService.getIO()) {
                            socketService.emitToUser(order.customer.toString(), 'order:status', {
                                orderId: order._id,
                                status: 'cancelled',
                                timestamp: new Date(),
                                message: 'Your order was cancelled as the restaurant did not respond in time.'
                            });
                        }
                    }
                    console.log(`✅ Cleaned up ${staleOrders.length} stale orders.`);
                }
            } catch (error) {
                console.error('[Cleanup Job 2] Error:', error.message);
            }
            try {
                console.log('[Cleanup Job 4] Checking for expired online payment orders...');
                const thirtyMinsAgo = new Date(Date.now() - 30 * 60 * 1000);
                const expiredOnlineOrders = await Order.find({
                    paymentMethod: 'online',
                    paymentStatus: { $in: ['pending', 'processing'] },
                    status: { $in: ['pending', 'placed'] },
                    createdAt: { $lt: thirtyMinsAgo }
                });
                if (expiredOnlineOrders.length === 0) {
                    console.log('No expired online payment orders found.');
                } else {
                    console.log(`Found ${expiredOnlineOrders.length} expired online payment orders.`);
                    for (const order of expiredOnlineOrders) {
                        order.status = 'failed';
                        order.paymentStatus = 'failed';
                        order.cancellationReason = 'System Auto-Cancel: Online payment not completed in time';
                        order.cancellationInitiatedBy = 'system';
                        order.cancelledAt = new Date();
                        order.timeline.push({ status: 'failed', timestamp: new Date(), label: 'Payment Expired', by: 'system', description: 'Payment session expired. Please place a new order.' });
                        await order.save();
                        if (socketService.getIO()) {
                            socketService.emitToUser(order.customer.toString(), 'order:status', {
                                orderId: order._id,
                                status: 'failed',
                                timestamp: new Date(),
                                message: 'Your payment session expired. Please place a new order.'
                            });
                        }
                    }
                    console.log(`✅ Expired ${expiredOnlineOrders.length} unpaid online orders.`);
                }
            } catch (error) {
                console.error('[Cleanup Job 4] Error:', error.message);
            }
            try {
                console.log('[Cleanup Job 3] Checking for stale unassigned orders (6 hours)...');
                const staleUnassignedOrders = await Order.find({
                    status: { $in: ['accepted', 'preparing', 'ready'] },
                    rider: null,
                    createdAt: { $lt: sixHoursAgo }
                });
                if (staleUnassignedOrders.length === 0) {
                    console.log('No stale unassigned orders found.');
                } else {
                    console.log(`Found ${staleUnassignedOrders.length} stale unassigned orders.`);
                    for (const order of staleUnassignedOrders) {
                        order.status = 'cancelled';
                        order.cancellationReason = 'System Auto-Cancel: No rider assigned after 6 hours';
                        order.timeline.push({ status: 'cancelled', timestamp: new Date() });
                        await order.save();
                        if (socketService.getIO()) {
                            socketService.emitToUser(order.customer.toString(), 'order:status', {
                                orderId: order._id,
                                status: 'cancelled',
                                timestamp: new Date(),
                                message: 'Order cancelled due to no rider assignment.'
                            });
                            socketService.emitToRestaurant(order.restaurant.toString(), 'order:status', {
                                orderId: order._id,
                                status: 'cancelled',
                                timestamp: new Date(),
                                message: 'Order cancelled due to no rider assignment.'
                            });
                        }
                    }
                    console.log(`✅ Cancelled ${staleUnassignedOrders.length} stale unassigned orders.`);
                }
            } catch (error) {
                console.error('[Cleanup Job 3] Error:', error.message);
            }
        } catch (error) {
            console.error('Error in Cron Job:', error);
        }
    });
};
module.exports = initCronJobs;
