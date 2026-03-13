/**
 * riderEarningsController.js
 *
 * Dedicated controller for rider earnings tracking:
 * - Total orders delivered + all-time / period payout summary
 * - Paginated list of all orders with per-order earnings
 * - Single order earnings detail breakdown
 */

const Order = require('../models/Order');
const Rider = require('../models/Rider');
const { getPaginationParams } = require('../utils/pagination');
const mongoose = require('mongoose');

const sendError = (res, status, msg) => res.status(status).json({ success: false, message: msg });

/** Resolve rider profile from authenticated user */
async function getRiderProfile(userId) {
    return Rider.findOne({ user: userId });
}

/** Round to 2 decimal places */
const r2 = (n) => Math.round((n || 0) * 100) / 100;

// ─────────────────────────────────────────────────────────────────────────────

/**
 * GET /api/rider/earnings/summary
 * Returns total delivered orders + earnings breakdown (today / week / month / all-time).
 * Also includes wallet snapshot.
 * Query: none required
 */
exports.getEarningsSummary = async (req, res) => {
    try {
        const rider = await getRiderProfile(req.user._id);
        if (!rider) return sendError(res, 404, 'Rider profile not found');

        const RiderWallet = require('../models/RiderWallet');

        const now = new Date();
        const sod = new Date(now); sod.setHours(0, 0, 0, 0);  // start of day
        const sow = new Date(now); sow.setDate(now.getDate() - now.getDay()); sow.setHours(0, 0, 0, 0); // start of week (Sun)
        const som = new Date(now.getFullYear(), now.getMonth(), 1); // start of month

        const [allTime, today, week, month, wallet] = await Promise.all([
            Order.aggregate([
                { $match: { rider: rider._id, status: 'delivered' } },
                {
                    $group: {
                        _id: null,
                        totalOrders: { $sum: 1 },
                        baseEarning: {
                            $sum: {
                                $add: [
                                    { $ifNull: ['$riderEarnings.deliveryCharge', 0] },
                                    { $ifNull: ['$riderEarnings.platformFee', 0] },
                                ],
                            },
                        },
                        tips: { $sum: '$tip' },
                        incentives: { $sum: { $ifNull: ['$riderEarnings.incentive', 0] } },
                        totalEarning: { $sum: { $ifNull: ['$riderEarnings.totalRiderEarning', 0] } },
                    }
                }
            ]),
            Order.aggregate([
                { $match: { rider: rider._id, status: 'delivered', deliveredAt: { $gte: sod } } },
                {
                    $group: {
                        _id: null,
                        orders: { $sum: 1 },
                        earning: { $sum: { $ifNull: ['$riderEarnings.totalRiderEarning', 0] } },
                        tips: { $sum: '$tip' },
                        incentives: { $sum: { $ifNull: ['$riderEarnings.incentive', 0] } },
                    },
                }
            ]),
            Order.aggregate([
                { $match: { rider: rider._id, status: 'delivered', deliveredAt: { $gte: sow } } },
                {
                    $group: {
                        _id: null,
                        orders: { $sum: 1 },
                        earning: { $sum: { $ifNull: ['$riderEarnings.totalRiderEarning', 0] } },
                        tips: { $sum: '$tip' },
                        incentives: { $sum: { $ifNull: ['$riderEarnings.incentive', 0] } },
                    },
                }
            ]),
            Order.aggregate([
                { $match: { rider: rider._id, status: 'delivered', deliveredAt: { $gte: som } } },
                {
                    $group: {
                        _id: null,
                        orders: { $sum: 1 },
                        earning: { $sum: { $ifNull: ['$riderEarnings.totalRiderEarning', 0] } },
                        tips: { $sum: '$tip' },
                        incentives: { $sum: { $ifNull: ['$riderEarnings.incentive', 0] } },
                    },
                }
            ]),
            RiderWallet.findOne({ rider: rider._id }).lean(),
        ]);

        const atData = allTime[0] || { totalOrders: 0, baseEarning: 0, tips: 0, incentives: 0, totalEarning: 0 };

        return res.status(200).json({
            success: true,
            summary: {
                allTime: {
                    totalOrders: atData.totalOrders,
                    baseEarning: r2(atData.baseEarning),
                    tips: r2(atData.tips),
                    incentives: r2(atData.incentives),
                    totalEarning: r2(atData.totalEarning),
                },
                today: {
                    orders: today[0]?.orders || 0,
                    earning: r2(today[0]?.earning),
                    tips: r2(today[0]?.tips),
                    incentives: r2(today[0]?.incentives),
                },
                thisWeek: {
                    orders: week[0]?.orders || 0,
                    earning: r2(week[0]?.earning),
                    tips: r2(week[0]?.tips),
                    incentives: r2(week[0]?.incentives),
                },
                thisMonth: {
                    orders: month[0]?.orders || 0,
                    earning: r2(month[0]?.earning),
                    tips: r2(month[0]?.tips),
                    incentives: r2(month[0]?.incentives),
                },
            },
            wallet: wallet ? {
                availableBalance: r2(wallet.availableBalance),
                totalEarnings: r2(wallet.totalEarnings),
                totalPayouts: r2(wallet.totalPayouts || 0),
                lastPayoutAt: wallet.lastPayoutAt || null,
                lastPayoutAmount: r2(wallet.lastPayoutAmount || 0),
            } : null,
        });
    } catch (err) {
        return sendError(res, 500, err.message);
    }
};

// ─────────────────────────────────────────────────────────────────────────────

/**
 * GET /api/rider/earnings/orders
 * Paginated list of ALL delivered orders with per-order earnings summary.
 * Query: page, limit, from (ISO date), to (ISO date)
 */
exports.getEarningsOrders = async (req, res) => {
    try {
        const rider = await getRiderProfile(req.user._id);
        if (!rider) return sendError(res, 404, 'Rider profile not found');

        const { page, limit, skip } = getPaginationParams(req, 20);
        const { from, to } = req.query;

        const matchStage = { rider: rider._id, status: 'delivered' };
        if (from || to) {
            matchStage.deliveredAt = {};
            if (from) matchStage.deliveredAt.$gte = new Date(from);
            if (to) matchStage.deliveredAt.$lte = new Date(to);
        }

        const [orders, total] = await Promise.all([
            Order.find(matchStage)
                .select('_id totalAmount itemTotal riderEarnings tip deliveryFee deliveredAt createdAt paymentMethod deliveryAddress restaurant items')
                .populate('restaurant', 'name address image')
                .sort({ deliveredAt: -1 })
                .skip(skip)
                .limit(limit)
                .lean(),
            Order.countDocuments(matchStage),
        ]);

        // Shape each order into a clean earnings card
        const earningsCards = orders.map((o) => {
            const base = r2((o.riderEarnings?.deliveryCharge || 0) + (o.riderEarnings?.platformFee || 0));
            const tip = r2((o.riderEarnings?.tip ?? o.tip) || 0);
            const incentive = r2(o.riderEarnings?.incentive || 0);
            const total = r2(o.riderEarnings?.totalRiderEarning || base + incentive + tip);
            return {
                orderId: o._id,
                deliveredAt: o.deliveredAt,
                placedAt: o.createdAt,
                restaurant: o.restaurant,
                deliveryArea: o.deliveryAddress?.area || o.deliveryAddress?.addressLine || '',
                orderValue: r2(o.totalAmount),
                itemTotal: r2(o.itemTotal || 0),
                itemCount: (o.items || []).length,
                paymentMethod: o.paymentMethod,
                earnings: {
                    base,
                    tip,
                    incentive,
                    incentivePercent: o.riderEarnings?.incentivePercentAtCompletion || 0,
                    total,
                },
            };
        });

        return res.status(200).json({
            success: true,
            orders: earningsCards,
            pagination: {
                total,
                page,
                limit,
                pages: Math.ceil(total / limit),
                hasNext: page < Math.ceil(total / limit),
                hasPrev: page > 1,
            },
        });
    } catch (err) {
        return sendError(res, 500, err.message);
    }
};

// ─────────────────────────────────────────────────────────────────────────────

/**
 * GET /api/rider/earnings/orders/:orderId
 * Full earnings breakdown for a single order.
 */
exports.getSingleOrderEarnings = async (req, res) => {
    try {
        const rider = await getRiderProfile(req.user._id);
        if (!rider) return sendError(res, 404, 'Rider profile not found');

        const { orderId } = req.params;
        if (!mongoose.Types.ObjectId.isValid(orderId)) {
            return sendError(res, 400, 'Invalid orderId');
        }

        const order = await Order.findOne({ _id: orderId, rider: rider._id })
            .populate('restaurant', 'name address contactNumber image')
            .populate('customer', 'name mobile')
            .lean();

        if (!order) return sendError(res, 404, 'Order not found or not assigned to you');

        const base = r2((order.riderEarnings?.deliveryCharge || 0) + (order.riderEarnings?.platformFee || 0));
        const tip = r2((order.riderEarnings?.tip ?? order.tip) || 0);
        const total = r2(order.riderEarnings?.totalRiderEarning || base + tip + r2(order.riderEarnings?.incentive || 0));

        return res.status(200).json({
            success: true,
            order: {
                orderId: order._id,
                status: order.status,
                placedAt: order.createdAt,
                deliveredAt: order.deliveredAt || null,

                restaurant: order.restaurant,
                // Customer contact only revealed after delivery
                customer: order.status === 'delivered' ? {
                    name: order.customer?.name,
                    mobile: order.customer?.mobile,
                } : { name: order.customer?.name },

                delivery: {
                    area: order.deliveryAddress?.area || '',
                    addressLine: order.deliveryAddress?.addressLine || '',
                    city: order.deliveryAddress?.city || '',
                },

                orderSummary: {
                    itemCount: (order.items || []).length,
                    orderValue: r2(order.totalAmount),
                    paymentMethod: order.paymentMethod,
                    paymentStatus: order.paymentStatus,
                },

                // ── The main earnings breakdown ──────────────────────────
                earnings: {
                    baseCommission: base,
                    tip,
                    incentive: r2(order.riderEarnings?.incentive || 0),
                    incentivePercent: order.riderEarnings?.incentivePercentAtCompletion || 0,
                    total,
                    breakdown: {
                        deliveryCharge: r2(order.riderEarnings?.deliveryCharge || 0),
                        platformFee: r2(order.riderEarnings?.platformFee || 0),
                        riderIncentive: r2(order.riderEarnings?.incentive || 0),
                        tip: r2((order.riderEarnings?.tip ?? order.tip) || 0),
                        riderTotalEarning: r2(order.riderEarnings?.totalRiderEarning || 0),
                        tipField: r2(order.tip || 0),
                    },
                },
            },
        });
    } catch (err) {
        return sendError(res, 500, err.message);
    }
};

// ─────────────────────────────────────────────────────────────────────────────

/**
 * GET /api/rider/earnings/payouts
 * Returns payout history from the rider wallet (total paid out, individual transactions).
 */
exports.getPayoutHistory = async (req, res) => {
    try {
        const rider = await getRiderProfile(req.user._id);
        if (!rider) return sendError(res, 404, 'Rider profile not found');

        const RiderWallet = require('../models/RiderWallet');
        const wallet = await RiderWallet.findOne({ rider: rider._id }).lean();

        if (!wallet) {
            return res.status(200).json({
                success: true,
                wallet: null,
                message: 'No wallet found. Wallet is created after your first delivery.',
            });
        }

        return res.status(200).json({
            success: true,
            wallet: {
                availableBalance: r2(wallet.availableBalance),
                totalEarnings: r2(wallet.totalEarnings || 0),
                totalPayouts: r2(wallet.totalPayouts || 0),
                lastPayoutAt: wallet.lastPayoutAt || null,
                lastPayoutAmount: r2(wallet.lastPayoutAmount || 0),
            },
        });
    } catch (err) {
        return sendError(res, 500, err.message);
    }
};
