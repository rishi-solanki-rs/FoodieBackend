const mongoose = require('mongoose');
const Rider = require('../models/Rider');
const Order = require('../models/Order');
const RideRequest = require('../models/RideRequest');
const Restaurant = require('../models/Restaurant');
const socketService = require('./socketService');
const { sendNotification } = require('../utils/notificationService');
const { calculateDistance, estimateTravelMinutes } = require('../utils/locationUtils');
const BATCH_TIMEOUT_MS = 45000;   // 45 sec — after this, re-trigger if no one accepts
exports.findAndNotifyRider = async (orderId) => {
    try {
        const order = await Order.findById(orderId);
        if (!order) return console.error('Order not found for dispatch:', orderId);
        if (order.rider || ['cancelled', 'delivered', 'picked_up'].includes(order.status)) return;
        if (!['accepted', 'preparing', 'ready'].includes(order.status)) return;

        const restaurant = await Restaurant.findById(order.restaurant);
        if (!restaurant) return console.error('Restaurant not found for dispatch');

        // Get riders already notified (don't spam them again)
        const previousRequests = await RideRequest.find({ order: orderId }).select('rider');
        const alreadyNotifiedRiderIds = previousRequests.map(r => r.rider);

        // Notify ALL online, available, approved riders — no distance filter
        const allRiders = await Rider.find({
            _id: { $nin: alreadyNotifiedRiderIds },
            isOnline: true,
            isAvailable: true,
            verificationStatus: 'approved',
        }).populate('user', 'name mobile');

        if (allRiders.length === 0) {
            console.log(`[Dispatch] No available riders found for Order ${orderId}`);
            socketService.emitToRestaurant(order.restaurant.toString(), 'order:no_rider_found', {
                orderId,
                message: 'No riders available at this moment'
            });
            // Also push-notify the restaurant owner so they know even if not connected to socket
            if (restaurant.owner) {
                sendNotification(
                    restaurant.owner,
                    'No Riders Available',
                    `No delivery riders could be found for Order #${orderId.toString().slice(-6)}. Please try again shortly.`,
                    { orderId: orderId.toString(), type: 'no_rider_found' }
                ).catch(() => {});
            }
            return;
        }

        console.log(`[Dispatch] Notifying ALL ${allRiders.length} available riders for Order ${orderId}`);

        const restaurantCoords = restaurant.location?.coordinates || [0, 0];
        const customerCoords = order.deliveryAddress?.coordinates || [0, 0];
        const deliveryDistance = calculateDistance(restaurantCoords, customerCoords);
        const deliveryMinutes = estimateTravelMinutes(deliveryDistance);
        const riderEarning = typeof order.riderEarning === 'number'
            ? order.riderEarning
            : (order.riderCommission || 0) + (order.tip || 0);

        // Create RideRequests for all riders
        const rideRequestResults = await Promise.allSettled(
            allRiders.map(rider =>
                RideRequest.create({
                    order: order._id,
                    rider: rider._id,
                    status: 'pending'
                })
            )
        );

        const successfulRequests = [];
        rideRequestResults.forEach((result, i) => {
            if (result.status === 'fulfilled') {
                successfulRequests.push({ rider: allRiders[i], request: result.value });
            }
        });

        if (successfulRequests.length === 0) {
            console.error(`[Dispatch] Failed to create any RideRequest for Order ${orderId}`);
            return;
        }

        // Notify all riders at once via socket + push notification
        for (const { rider, request } of successfulRequests) {
            const riderCoords = rider.currentLocation?.coordinates || [0, 0];
            const pickupDistance = calculateDistance(riderCoords, restaurantCoords);
            const pickupMinutes = estimateTravelMinutes(pickupDistance);

            const requestData = {
                requestId: request._id,
                orderId: order._id,
                restaurantName: restaurant.name,
                restaurantAddress: restaurant.address,
                earnings: riderEarning,
                tip: order.tip || 0,
                distances: {
                    pickupDistance: Math.round(pickupDistance * 100) / 100,
                    deliveryDistance: Math.round(deliveryDistance * 100) / 100,
                    totalDistance: Math.round((pickupDistance + deliveryDistance) * 100) / 100
                },
                estimatedTime: {
                    pickupMinutes,
                    deliveryMinutes,
                    totalMinutes: pickupMinutes + deliveryMinutes
                },
                totalRidersNotified: successfulRequests.length,
                expiresIn: BATCH_TIMEOUT_MS / 1000
            };

            socketService.emitToRider(rider.user.toString(), 'rider:new_order_request', requestData);
            sendNotification(
                rider.user._id || rider.user,
                '🚀 New Delivery Request!',
                `Earn ₹${riderEarning} — ${restaurant.name} → ${order.deliveryAddress?.area || 'Customer'}`,
                { orderId: order._id.toString(), requestId: request._id.toString(), type: 'dispatch_request' }
            ).catch(() => { }); // non-blocking
        }

        // If no one accepts within timeout, re-trigger (in case new riders came online)
        setTimeout(async () => {
            await checkBatchTimeout(
                order._id,
                successfulRequests.map(sr => sr.request._id)
            );
        }, BATCH_TIMEOUT_MS);

    } catch (error) {
        console.error('[Dispatch] Error:', error);
    }
};

async function checkBatchTimeout(orderId, requestIds) {
    try {
        await RideRequest.updateMany(
            { _id: { $in: requestIds }, status: 'pending' },
            { $set: { status: 'timeout' } }
        );
        const order = await Order.findById(orderId).select('rider status');
        if (!order) return;
        if (order.rider || ['cancelled', 'delivered'].includes(order.status)) {
            console.log(`[Dispatch] Batch timed out but order ${orderId} is already handled`);
            return;
        }
        console.log(`[Dispatch] Batch timed out for Order ${orderId} — trying next batch`);
        exports.findAndNotifyRider(orderId); // recurse with next batch
    } catch (err) {
        console.error('[Dispatch] Batch timeout error:', err);
    }
}
exports.handleRiderResponse = async (riderUserId, requestId, action) => {
    const session = await mongoose.startSession();
    session.startTransaction();
    try {
        const rideRequest = await RideRequest.findById(requestId).populate('order');
        if (!rideRequest) throw new Error('Request not found');
        const rider = await Rider.findOne({ user: riderUserId }).populate('user', 'name mobile');
        if (!rider) throw new Error('Rider profile not found');
        if (rideRequest.rider.toString() !== rider._id.toString()) {
            throw new Error('This request is not assigned to you');
        }
        if (rideRequest.status !== 'pending') {
            throw new Error(
                rideRequest.status === 'timeout'
                    ? 'This request has expired'
                    : 'This request has already been processed'
            );
        }
        if (action === 'accepted') {
            const activeOrder = await Order.findOne({
                rider: rider._id,
                status: { $in: ['assigned', 'accepted_by_rider', 'reached_restaurant', 'arrived_restaurant', 'picked_up', 'delivery_arrived'] }
            }).select('_id status');
            if (activeOrder) {
                rideRequest.status = 'rejected';
                await rideRequest.save({ session });
                await session.commitTransaction();
                session.endSession();
                const err = new Error('RIDER_ALREADY_ASSIGNED');
                err.code = 'RIDER_ALREADY_ASSIGNED';
                err.statusCode = 409;
                throw err;
            }
            const targetOrder = await Order.findOne({
                _id: rideRequest.order._id,
                rider: null
            }).session(session);
            if (!targetOrder) {
                rideRequest.status = 'rejected';
                await rideRequest.save({ session });
                await session.commitTransaction();
                session.endSession();
                throw new Error('ORDER_ALREADY_TAKEN');
            }
            const oldStatus = targetOrder.status;
            targetOrder.rider = rider._id;
            targetOrder.status = 'assigned';
            targetOrder.timeline.push({
                status: 'assigned',
                label: 'Rider Assigned',
                description: `Rider ${rider.user.name} has been assigned`,
                by: 'system',
                timestamp: new Date()
            });
            await targetOrder.save({ session });
            rider.isAvailable = false;
            await rider.save({ session });
            rideRequest.status = 'accepted';
            await rideRequest.save({ session });
            await RideRequest.updateMany(
                {
                    rider: rider._id,
                    status: 'pending',
                    order: { $ne: targetOrder._id }
                },
                { $set: { status: 'rejected' } },
                { session }
            );
            await RideRequest.updateMany(
                { order: targetOrder._id, _id: { $ne: rideRequest._id }, status: 'pending' },
                { $set: { status: 'rejected' } },
                { session }
            );
            await session.commitTransaction();
            session.endSession();
            const populatedOrder = await Order.findById(targetOrder._id)
                .populate('customer', 'name')
                .populate('restaurant', 'name');
            const updateData = {
                orderId: targetOrder._id,
                status: 'assigned',
                oldStatus,
                timestamp: new Date(),
                rider: {
                    name: rider.user.name,
                    phone: rider.user.mobile,
                    vehicle: rider.vehicle
                },
                message: `Rider ${rider.user.name} is on the way`
            };
            const riderAssignedPayload = {
                orderId: targetOrder._id,
                status: 'assigned',
                riderName: rider.user.name || 'Rider',
                riderPhone: rider.user.mobile,
                vehicleNumber: rider.vehicle?.number,
                rider: {
                    name: rider.user.name || 'Rider',
                    phone: rider.user.mobile,
                    vehicle: rider.vehicle,
                },
                timestamp: new Date(),
            };

            // Emit to order room (for any client that joined the specific order room)
            socketService.emitToOrder(targetOrder._id.toString(), 'order:rider_assigned', riderAssignedPayload);

            // Emit to restaurant room — so DeliveryHome.unsubRiderAssigned fires correctly
            if (targetOrder.restaurant) {
                socketService.emitToRestaurant(targetOrder.restaurant.toString(), 'order:rider_assigned', riderAssignedPayload);
            }

            if (targetOrder.customer) {
                socketService.emitToCustomer(targetOrder.customer.toString(), 'order:status', updateData);
            }
            if (targetOrder.restaurant) {
                socketService.emitToRestaurant(targetOrder.restaurant.toString(), 'order:status', updateData);
            }
            socketService.emitToAdmin('order:rider_assigned', {
                orderId: targetOrder._id.toString(),
                riderId: rider._id.toString(),
                riderName: rider.user.name || 'Rider',
                customerName: populatedOrder.customer?.name,
                restaurantName: populatedOrder.restaurant?.name,
                orderStatus: 'assigned',
                timestamp: new Date(),
                totalAmount: targetOrder.totalAmount,
                amount: targetOrder.totalAmount,
                riderLocation: rider.currentLocation?.coordinates ? {
                    latitude: rider.currentLocation.coordinates[1],
                    longitude: rider.currentLocation.coordinates[0]
                } : null
            });
            socketService.emitToAdmin('rider:order_accepted', {
                riderId: rider._id.toString(),
                riderUserId: riderUserId.toString(),
                riderName: rider.user.name || 'Rider',
                orderId: targetOrder._id.toString(),
                customerName: populatedOrder.customer?.name,
                restaurantName: populatedOrder.restaurant?.name,
                orderStatus: 'assigned',
                timestamp: new Date(),
                action: 'accepted_order',
                location: rider.currentLocation?.coordinates ? {
                    latitude: rider.currentLocation.coordinates[1],
                    longitude: rider.currentLocation.coordinates[0],
                    type: 'Point'
                } : null,
                lastLocationUpdate: rider.lastLocationUpdateAt || new Date()
            });
            const riderCoords = rider.currentLocation?.coordinates;
            if (riderCoords && riderCoords.length === 2) {
                const [currentLong, currentLat] = riderCoords;
                const eta = targetOrder.deliveryAddress?.coordinates
                    ? estimateTravelMinutes(
                        calculateDistance([currentLong, currentLat], targetOrder.deliveryAddress.coordinates)
                    )
                    : null;
                if (targetOrder.customer) {
                    socketService.emitToCustomer(targetOrder.customer.toString(), 'rider:location_updated', {
                        orderId: targetOrder._id,
                        riderLocation: {
                            lat: currentLat,
                            long: currentLong
                        },
                        eta,
                        timestamp: new Date()
                    });
                }
                socketService.emitToOrder(targetOrder._id.toString(), 'rider:location', {
                    riderId: rider.user?._id?.toString() || riderUserId.toString(),
                    latitude: currentLat,
                    longitude: currentLong,
                    eta,
                    timestamp: new Date()
                });
                socketService.emitToAdmin('rider:location_updated', {
                    riderId: rider._id.toString(),
                    riderName: rider.user?.name || 'Rider',
                    latitude: currentLat,
                    longitude: currentLong,
                    activeOrders: 1,
                    timestamp: new Date()
                });
            }
            const otherPendingRiders = await RideRequest.find({
                order: targetOrder._id,
                _id: { $ne: rideRequest._id },
                status: 'rejected',
                updatedAt: { $gte: new Date(Date.now() - 10000) } // only riders rejected in last 10s (current batch)
            }).select('rider');
            for (const req of otherPendingRiders) {
                const otherRider = await Rider.findById(req.rider).select('user');
                if (otherRider) {
                    socketService.emitToRider(otherRider.user.toString(), 'rider:order_taken', {
                        orderId: targetOrder._id,
                        message: 'This order was accepted by another rider'
                    });
                }
            }
            // Confirm acceptance back to the accepting rider via socket
            socketService.emitToRider(riderUserId.toString(), 'order:accepted', {
                orderId: targetOrder._id,
                status: 'assigned',
                restaurantName: populatedOrder.restaurant?.name || '',
                customerName: populatedOrder.customer?.name || '',
                totalAmount: targetOrder.totalAmount,
                message: 'Order accepted — proceed to restaurant',
                timestamp: new Date()
            });
            return { success: true, message: 'Order accepted successfully' };
        } else {
            rideRequest.status = 'rejected';
            await rideRequest.save({ session });
            await session.commitTransaction();
            session.endSession();
            const pendingInBatch = await RideRequest.countDocuments({
                order: rideRequest.order._id,
                status: 'pending'
            });
            if (pendingInBatch === 0) {
                const order = await Order.findById(rideRequest.order._id).select('rider status');
                if (order && !order.rider && !['cancelled', 'delivered'].includes(order.status)) {
                    console.log(`[Dispatch] All riders in batch rejected Order ${rideRequest.order._id} — dispatching next batch`);
                    exports.findAndNotifyRider(rideRequest.order._id);
                }
            }
            return { success: true, message: 'Order rejected' };
        }
    } catch (error) {
        if (session.inTransaction()) {
            await session.abortTransaction();
        }
        session.endSession();
        if (error.message === 'ORDER_ALREADY_TAKEN') {
            const err = new Error('Order already accepted by another rider');
            err.code = 'ORDER_ALREADY_TAKEN';
            err.statusCode = 409;
            throw err;
        }
        throw error;
    }
};
