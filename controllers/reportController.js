const Restaurant = require('../models/Restaurant');
const Rider = require('../models/Rider');
const Order = require('../models/Order');
const User = require('../models/User');
const WalletTransaction = require('../models/WalletTransaction');
const { getPaginationParams } = require('../utils/pagination');
const getAverageRating = (rating) => {
    if (typeof rating === 'number') return rating;
    if (rating && typeof rating === 'object' && typeof rating.average === 'number') {
        return rating.average;
    }
    return 0;
};
const buildRatingRange = (minRating, maxRating) => {
    if (!minRating && !maxRating) return null;
    const range = {};
    if (minRating) range.$gte = parseFloat(minRating);
    if (maxRating) range.$lte = parseFloat(maxRating);
    return range;
};
const getRiderEarning = (order) => {
    if (order && typeof order.riderEarning === 'number') return order.riderEarning;
    return (order?.riderCommission || 0) + (order?.tip || 0);
};
exports.getRestaurantReport = async (req, res) => {
    try {
        const { page, limit, skip } = getPaginationParams(req, 20);
        const { city, area, minRating, maxRating, sortBy = 'totalOrders', order = 'desc' } = req.query;
        const query = { isActive: true };
        if (city) query.city = city;
        if (area) query.area = area;
        const ratingRange = buildRatingRange(minRating, maxRating);
        if (ratingRange) {
            query.$or = [
                { 'rating.average': ratingRange },
                { rating: ratingRange }
            ];
        }
        const restaurants = await Restaurant.find(query)
            .select('name email contactNumber rating address city area totalOrders totalEarnings totalDeliveries successfulOrders')
            .skip(skip)
            .limit(limit);
        const reportsData = await Promise.all(
            restaurants.map(async (restaurant) => {
                const orders = await Order.find({ restaurant: restaurant._id });
                const totalOrders = orders.length;
                const deliveredOrders = orders.filter(o => o.status === 'delivered').length;
                const totalEarnings = orders.reduce((sum, order) => sum + (order.restaurantCommission || 0), 0);
                const pendingPayouts = orders
                    .filter(o => o.status !== 'delivered' && o.status !== 'cancelled')
                    .reduce((sum, o) => sum + (o.restaurantCommission || 0), 0);
                const payoutsCompleted = totalEarnings - pendingPayouts;
                return {
                    _id: restaurant._id,
                    name: restaurant.name,
                    email: restaurant.email,
                    phone: restaurant.contactNumber,
                    rating: getAverageRating(restaurant.rating),
                    address: restaurant.address,
                    city: restaurant.city,
                    area: restaurant.area,
                    totalOrders,
                    deliveredOrders,
                    totalEarnings: parseFloat(totalEarnings.toFixed(2)),
                    pendingPayouts: parseFloat(pendingPayouts.toFixed(2)),
                    payoutsCompleted: parseFloat(payoutsCompleted.toFixed(2))
                };
            })
        );
        const sortOrder = order === 'asc' ? 1 : -1;
        reportsData.sort((a, b) => {
            if (sortBy === 'name') return a.name.localeCompare(b.name) * sortOrder;
            return (a[sortBy] - b[sortBy]) * sortOrder;
        });
        const total = (await Restaurant.countDocuments(query));
        res.status(200).json({
            reports: reportsData,
            total,
            page,
            limit,
            pages: Math.ceil(total / limit),
            timestamp: new Date()
        });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};
exports.getRiderReport = async (req, res) => {
    try {
        const { page, limit, skip } = getPaginationParams(req, 20);
        const { city, area, minRating, maxRating, sortBy = 'totalOrders', order = 'desc' } = req.query;
        const query = { isAvailable: true };
        if (city) query.workCity = city;
        if (area) query.workZone = area;
        const ratingRange = buildRatingRange(minRating, maxRating);
        if (ratingRange) {
            query.$or = [
                { 'rating.average': ratingRange },
                { rating: ratingRange }
            ];
        }
        const riders = await Rider.find(query)
            .select('user rating address workCity workZone totalOrders totalDeliveries totalEarnings averageRating')
            .populate('user', 'name email mobile')
            .skip(skip)
            .limit(limit);
        const reportsData = await Promise.all(
            riders.map(async (rider) => {
                const orders = await Order.find({ rider: rider._id });
                const totalOrders = orders.length;
                const deliveredOrders = orders.filter(o => o.status === 'delivered').length;
                const cancelledOrders = orders.filter(o => o.status === 'cancelled').length;
                const totalEarnings = orders.reduce((sum, order) => {
                    if (typeof order.riderEarning === 'number') return sum + order.riderEarning;
                    return sum + (order.riderCommission || 0) + (order.tip || 0);
                }, 0);
                const pendingPayouts = orders
                    .filter(o => o.status !== 'delivered' && o.status !== 'cancelled')
                    .reduce((sum, o) => {
                        if (typeof o.riderEarning === 'number') return sum + o.riderEarning;
                        return sum + (o.riderCommission || 0) + (o.tip || 0);
                    }, 0);
                const payoutsCompleted = totalEarnings - pendingPayouts;
                return {
                    _id: rider._id,
                    name: rider.user?.name || 'N/A',
                    email: rider.user?.email || 'N/A',
                    phone: rider.user?.mobile || 'N/A',
                    rating: getAverageRating(rider.rating),
                    city: rider.workCity,
                    zone: rider.workZone,
                    totalOrders,
                    deliveredOrders,
                    cancelledOrders,
                    totalEarnings: parseFloat(totalEarnings.toFixed(2)),
                    pendingPayouts: parseFloat(pendingPayouts.toFixed(2)),
                    payoutsCompleted: parseFloat(payoutsCompleted.toFixed(2))
                };
            })
        );
        const sortOrder = order === 'asc' ? 1 : -1;
        reportsData.sort((a, b) => {
            if (sortBy === 'name') return a.name.localeCompare(b.name) * sortOrder;
            return (a[sortBy] - b[sortBy]) * sortOrder;
        });
        const total = (await Rider.countDocuments(query));
        res.status(200).json({
            reports: reportsData,
            total,
            page,
            limit,
            pages: Math.ceil(total / limit),
            timestamp: new Date()
        });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};
exports.getOrderReport = async (req, res) => {
    try {
        const { page, limit, skip } = getPaginationParams(req, 20);
        const { startDate, endDate, restaurantId, riderId, customerId, status, sortBy = 'createdAt', order = 'desc' } = req.query;
        const query = {};
        if (startDate || endDate) {
            query.createdAt = {};
            if (startDate) query.createdAt.$gte = new Date(startDate);
            if (endDate) query.createdAt.$lte = new Date(endDate);
        }
        if (restaurantId) query.restaurant = restaurantId;
        if (riderId) query.rider = riderId;
        if (customerId) query.customer = customerId;
        if (status) query.status = status;
        const total = await Order.countDocuments(query);
        const orders = await Order.find(query)
            .populate('customer', 'name mobile')
            .populate('restaurant', 'name')
            .populate({
                path: 'rider',
                populate: {
                    path: 'user',
                    select: 'name mobile'
                }
            })
            .skip(skip)
            .limit(limit)
            .sort({ [sortBy]: order === 'asc' ? 1 : -1 });
        const reportsData = orders.map(order => {
            let driverName = 'Not Assigned';
            let driverPhone = 'N/A';
            if (order.rider && order.rider.user) {
                driverName = order.rider.user.name || 'Not Assigned';
                driverPhone = order.rider.user.mobile || 'N/A';
            }
            return {
                _id: order._id,
                orderId: order._id.toString().slice(-8).toUpperCase(),
                date: order.createdAt,
                customerName: order.customer?.name || 'N/A',
                customerPhone: order.customer?.mobile || 'N/A',
                driverName: driverName,
                driverPhone: driverPhone,
                restaurant: order.restaurant?.name || 'N/A',
                itemTotal: order.itemTotal || 0,
                amount: order.totalAmount || 0,
                deliveryFee: order.deliveryFee || 0,
                tax: order.tax || 0,
                offer: order.discount || 0,
                adminCommission: order.adminCommission || 0,
                restaurantEarning: order.restaurantCommission || 0,
                driverCommission: getRiderEarning(order),
                tip: order.tip || 0,
                status: order.status,
                paymentMethod: order.paymentMethod,
                paymentStatus: order.paymentStatus
            };
        });
        res.status(200).json({
            reports: reportsData,
            total,
            page,
            limit,
            pages: Math.ceil(total / limit),
            timestamp: new Date()
        });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};
exports.getTopUsersReport = async (req, res) => {
    try {
        const limit = parseInt(req.query.limit) || 20;
        const { sortBy = 'amount', order = 'desc' } = req.query;
        const users = await User.find({ role: 'customer' })
            .select('name mobile totalOrders totalAmountSpent');
        const reportsData = await Promise.all(
            users.map(async (user) => {
                const orders = await Order.find({ 
                    customer: user._id,
                    status: { $ne: 'cancelled' }
                });
                const totalOrders = orders.length;
                const totalAmount = orders.reduce((sum, order) => sum + (order.totalAmount || 0), 0);
                return {
                    _id: user._id,
                    name: user.name,
                    phone: user.mobile,
                    orders: totalOrders,
                    amount: parseFloat(totalAmount.toFixed(2))
                };
            })
        );
        const sortOrder = order === 'asc' ? 1 : -1;
        reportsData.sort((a, b) => {
            if (sortBy === 'name') return a.name.localeCompare(b.name) * sortOrder;
            return (a[sortBy] - b[sortBy]) * sortOrder;
        });
        const topUsers = reportsData.slice(0, limit);
        res.status(200).json({
            reports: topUsers,
            total: topUsers.length,
            limit,
            timestamp: new Date()
        });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};
exports.getWalletReport = async (req, res) => {
    try {
        const { page, limit, skip } = getPaginationParams(req, 20);
        const { sortBy = 'walletBalance', order = 'desc' } = req.query;
        const users = await User.find({ role: 'customer' })
            .select('name mobile walletBalance')
            .skip(skip)
            .limit(limit)
            .sort({ [sortBy]: order === 'asc' ? 1 : -1 });
        const total = await User.countDocuments({ role: 'customer' });
        const reportsData = users.map(user => ({
            _id: user._id,
            name: user.name,
            phone: user.mobile,
            walletBalance: user.walletBalance || 0
        }));
        res.status(200).json({
            reports: reportsData,
            total,
            page,
            limit,
            pages: Math.ceil(total / limit),
            timestamp: new Date()
        });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};
exports.getProfitLossReport = async (req, res) => {
    try {
        const { page, limit, skip } = getPaginationParams(req, 20);
        const { startDate, endDate, restaurantId } = req.query;
        const query = {};
        if (startDate || endDate) {
            query.createdAt = {};
            if (startDate) query.createdAt.$gte = new Date(startDate);
            if (endDate) query.createdAt.$lte = new Date(endDate);
        }
        if (restaurantId) query.restaurant = restaurantId;
        query.status = 'delivered';
        const total = await Order.countDocuments(query);
        const orders = await Order.find(query)
            .populate('customer', 'name mobile')
            .populate('restaurant', 'name')
            .skip(skip)
            .limit(limit)
            .sort({ createdAt: -1 });
        const reportsData = orders.map(order => ({
            _id: order._id,
            orderId: order._id.toString().slice(-8).toUpperCase(),
            date: order.createdAt,
            customer: order.customer?.name || 'N/A',
            restaurant: order.restaurant?.name || 'N/A',
            billAmount: order.totalAmount || 0,
            itemTotal: order.itemTotal || 0,
            tax: order.tax || 0,
            platformFee: order.platformFee || 0,
            deliveryFee: order.deliveryFee || 0,
            offer: order.discount || 0,
            adminCommission: order.adminCommission || 0,
            restaurantCommission: order.restaurantCommission || 0,
            riderCommission: getRiderEarning(order),
            tip: order.tip || 0,
            isFreeDeli: order.deliveryFee === 0 ? 'Yes' : 'No'
        }));
        const summary = {
            totalOrdersDelivered: total,
            totalBillAmount: reportsData.reduce((sum, o) => sum + (o.billAmount || 0), 0),
            totalAdminProfit: reportsData.reduce((sum, o) => sum + (o.adminCommission || 0), 0),
            totalDiscount: reportsData.reduce((sum, o) => sum + (o.offer || 0), 0),
            totalPlatformFee: reportsData.reduce((sum, o) => sum + (o.platformFee || 0), 0),
            totalDeliveryFee: reportsData.reduce((sum, o) => sum + (o.deliveryFee || 0), 0),
            totalRestaurantCommission: reportsData.reduce((sum, o) => sum + (o.restaurantCommission || 0), 0),
            totalRiderCommission: reportsData.reduce((sum, o) => sum + (o.riderCommission || 0), 0),
            totalTip: reportsData.reduce((sum, o) => sum + (o.tip || 0), 0),
            totalTax: reportsData.reduce((sum, o) => sum + (o.tax || 0), 0)
        };
        Object.keys(summary).forEach(key => {
            if (typeof summary[key] === 'number' && key !== 'totalOrdersDelivered') {
                summary[key] = parseFloat(summary[key].toFixed(2));
            }
        });
        res.status(200).json({
            summary,
            reports: reportsData,
            total,
            page,
            limit,
            pages: Math.ceil(total / limit),
            timestamp: new Date()
        });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};
exports.exportReport = async (req, res) => {
    try {
        const { reportType } = req.params;
        let data;
        switch(reportType) {
            case 'restaurants':
                break;
            case 'riders':
                break;
            case 'orders':
                break;
            default:
                return res.status(400).json({ message: 'Invalid report type' });
        }
        res.header('Content-Type', 'text/csv');
        res.header('Content-Disposition', `attachment; filename="${reportType}-report-${Date.now()}.csv"`);
        res.send(data);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};
