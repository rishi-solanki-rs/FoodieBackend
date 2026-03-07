const Review = require('../models/Review');
const Order = require('../models/Order');
const Restaurant = require('../models/Restaurant');
const Rider = require('../models/Rider');
const User = require('../models/User');
const { getPaginationParams } = require('../utils/pagination');
const { formatRestaurantForUser } = require('../utils/responseFormatter');
const buildRatingStatsOptimized = async (targetType, targetId, ratingField) => {
    const query = {};
    query[targetType] = targetId;
    query[ratingField] = { $exists: true };
    const result = await Review.aggregate([
        { $match: query },
        {
            $group: {
                _id: null,
                average: { $avg: `$${ratingField}` },
                count: { $sum: 1 },
                five: {
                    $sum: { $cond: [{ $eq: [`$${ratingField}`, 5] }, 1, 0] }
                },
                four: {
                    $sum: { $cond: [{ $eq: [`$${ratingField}`, 4] }, 1, 0] }
                },
                three: {
                    $sum: { $cond: [{ $eq: [`$${ratingField}`, 3] }, 1, 0] }
                },
                two: {
                    $sum: { $cond: [{ $eq: [`$${ratingField}`, 2] }, 1, 0] }
                },
                one: {
                    $sum: { $cond: [{ $eq: [`$${ratingField}`, 1] }, 1, 0] }
                }
            }
        }
    ]);
    if (result.length === 0) {
        return {
            average: 0,
            count: 0,
            breakdown: { five: 0, four: 0, three: 0, two: 0, one: 0 },
            lastRatedAt: null
        };
    }
    const stats = result[0];
    return {
        average: Math.round(stats.average * 10) / 10,
        count: stats.count,
        breakdown: {
            five: stats.five,
            four: stats.four,
            three: stats.three,
            two: stats.two,
            one: stats.one
        },
        lastRatedAt: new Date()
    };
};
const buildRatingStats = (ratings) => {
    const normalized = ratings.filter((value) => typeof value === 'number');
    const count = normalized.length;
    if (count === 0) {
        return {
            average: 0,
            count: 0,
            breakdown: { five: 0, four: 0, three: 0, two: 0, one: 0 },
            lastRatedAt: null
        };
    }
    const total = normalized.reduce((sum, value) => sum + value, 0);
    const average = Math.round((total / count) * 10) / 10;
    return {
        average,
        count,
        breakdown: {
            five: normalized.filter((value) => value === 5).length,
            four: normalized.filter((value) => value === 4).length,
            three: normalized.filter((value) => value === 3).length,
            two: normalized.filter((value) => value === 2).length,
            one: normalized.filter((value) => value === 1).length
        },
        lastRatedAt: new Date()
    };
};
exports.getAllReviewsAdmin = async (req, res) => {
    try {
        const { page, limit, skip } = getPaginationParams(req, 20);
        const { restaurantId, riderId, userId, orderId } = req.query;
        const query = {};
        if (restaurantId) query.restaurant = restaurantId;
        if (riderId) query.rider = riderId;
        if (userId) query.user = userId;
        if (orderId) query.order = orderId;
        const total = await Review.countDocuments(query);
        const reviews = await Review.find(query)
            .populate('user', 'name email mobile profilePic')
            .populate('order', 'orderId totalAmount status')
            .populate('restaurant', 'name address')
            .populate({
                path: 'rider',
                select: 'user',
                populate: {
                    path: 'user',
                    select: 'name mobile profilePic'
                }
            })
            .skip(skip)
            .limit(limit)
            .sort({ createdAt: -1 });
        const formattedReviews = reviews.map(review => ({
            _id: review._id,
            orderId: review.order?.orderId || review.order?._id,
            orderAmount: review.order?.totalAmount,
            orderStatus: review.order?.status,
            userName: review.user?.name,
            userEmail: review.user?.email,
            userMobile: review.user?.mobile,
            userProfilePic: review.user?.profilePic,
            restaurantName: review.restaurant?.name,
            restaurantRating: review.restaurantRating,
            restaurantAddress: review.restaurant?.address,
            riderName: review.rider?.user?.name,
            riderRating: review.riderRating,
            riderMobile: review.rider?.user?.mobile,
            comment: review.comment,
            photos: review.photos,
            createdAt: review.createdAt,
            updatedAt: review.updatedAt
        }));
        res.status(200).json({
            reviews: formattedReviews,
            total,
            page,
            limit,
            pages: Math.ceil(total / limit)
        });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};
exports.getReviewByOrderId = async (req, res) => {
    try {
        const { orderId } = req.params;
        const review = await Review.findOne({ order: orderId })
            .populate('user', 'name email mobile profilePic')
            .populate('order', 'orderId totalAmount status')
            .populate('restaurant', 'name address')
            .populate({
                path: 'rider',
                populate: {
                    path: 'user',
                    select: 'name mobile profilePic'
                }
            });
        if (!review) {
            return res.status(404).json({ message: 'Review not found for this order' });
        }
        const formattedReview = {
            _id: review._id,
            orderId: review.order?.orderId || review.order?._id,
            orderAmount: review.order?.totalAmount,
            orderStatus: review.order?.status,
            userName: review.user?.name,
            userEmail: review.user?.email,
            userMobile: review.user?.mobile,
            userProfilePic: review.user?.profilePic,
            restaurantName: review.restaurant?.name,
            restaurantRating: review.restaurantRating,
            restaurantAddress: review.restaurant?.address,
            riderName: review.rider?.user?.name,
            riderRating: review.riderRating,
            riderMobile: review.rider?.user?.mobile,
            comment: review.comment,
            photos: review.photos,
            createdAt: review.createdAt,
            updatedAt: review.updatedAt
        };
        res.status(200).json(formattedReview);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};
exports.getReviewsByRestaurant = async (req, res) => {
    try {
        const { restaurantId } = req.params;
        const { page, limit, skip } = getPaginationParams(req, 20);
        const query = { restaurant: restaurantId, restaurantRating: { $exists: true }, isHidden: { $ne: true } };
        const [total, reviews, ratingStats] = await Promise.all([
            Review.countDocuments(query),
            Review.find(query)
                .populate('user', 'name profilePic')
                .select('restaurantRating comment photos createdAt user')
                .skip(skip)
                .limit(limit)
                .sort({ createdAt: -1 }),
            buildRatingStatsOptimized('restaurant', restaurantId, 'restaurantRating'),
        ]);
        res.status(200).json({
            reviews,
            total,
            page,
            limit,
            pages: Math.ceil(total / limit),
            averageRating: ratingStats.average,
            totalRatings: ratingStats.count,
            ratingBreakdown: ratingStats.breakdown,
        });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};
exports.getReviewsByRider = async (req, res) => {
    try {
        const { riderId } = req.params;
        const { page, limit, skip } = getPaginationParams(req, 20);
        const isAdmin = req.user?.role === 'admin';
        if (!isAdmin) {
            const riderProfile = await Rider.findOne({ user: req.user._id || req.user.id });
            if (!riderProfile || riderProfile._id.toString() !== riderId) {
                return res.status(403).json({ message: 'Not authorized to view these reviews' });
            }
        }
        const query = { rider: riderId, riderRating: { $exists: true } };
        if (!isAdmin) query.isHidden = { $ne: true };
        const [total, reviews, ratingStats] = await Promise.all([
            Review.countDocuments(query),
            Review.find(query)
                .populate('user', 'name profilePic')
                .select('riderRating comment photos createdAt user isHidden')
                .skip(skip)
                .limit(limit)
                .sort({ createdAt: -1 }),
            buildRatingStatsOptimized('rider', riderId, 'riderRating'),
        ]);
        res.status(200).json({
            reviews,
            total,
            page,
            limit,
            pages: Math.ceil(total / limit),
            averageRating: ratingStats.average,
            totalRatings: ratingStats.count,
            ratingBreakdown: ratingStats.breakdown,
        });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};
exports.getMyRestaurantReviews = async (req, res) => {
    try {
        const restaurant = await Restaurant.findOne({ owner: req.user._id || req.user.id });
        if (!restaurant) return res.status(404).json({ message: 'Restaurant not found' });
        const { page, limit, skip } = getPaginationParams(req, 20);
        const query = { restaurant: restaurant._id, restaurantRating: { $exists: true }, isHidden: { $ne: true } };
        const [total, reviews, ratingStats] = await Promise.all([
            Review.countDocuments(query),
            Review.find(query)
                .populate('user', 'name profilePic')
                .select('restaurantRating comment photos createdAt user')
                .skip(skip)
                .limit(limit)
                .sort({ createdAt: -1 }),
            buildRatingStatsOptimized('restaurant', restaurant._id, 'restaurantRating'),
        ]);
        res.status(200).json({
            restaurantId: restaurant._id,
            restaurantName: restaurant.name,
            reviews,
            total,
            page,
            limit,
            pages: Math.ceil(total / limit),
            averageRating: ratingStats.average,
            totalRatings: ratingStats.count,
            ratingBreakdown: ratingStats.breakdown,
        });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};
exports.getMyRiderReviews = async (req, res) => {
    try {
        const riderProfile = await Rider.findOne({ user: req.user._id || req.user.id });
        if (!riderProfile) return res.status(404).json({ message: 'Rider profile not found' });
        const { page, limit, skip } = getPaginationParams(req, 20);
        const query = { rider: riderProfile._id, riderRating: { $exists: true }, isHidden: { $ne: true } };
        const [total, reviews, ratingStats] = await Promise.all([
            Review.countDocuments(query),
            Review.find(query)
                .populate('user', 'name profilePic')
                .select('riderRating comment photos createdAt user')
                .skip(skip)
                .limit(limit)
                .sort({ createdAt: -1 }),
            buildRatingStatsOptimized('rider', riderProfile._id, 'riderRating'),
        ]);
        res.status(200).json({
            riderId: riderProfile._id,
            reviews,
            total,
            page,
            limit,
            pages: Math.ceil(total / limit),
            averageRating: ratingStats.average,
            totalRatings: ratingStats.count,
            ratingBreakdown: ratingStats.breakdown,
        });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};
exports.adminModerateReview = async (req, res) => {
    try {
        const { id } = req.params;
        const { hidden, flagReason } = req.body;
        const review = await Review.findById(id);
        if (!review) return res.status(404).json({ message: 'Review not found' });
        review.isHidden = Boolean(hidden);
        if (flagReason) {
            review.flaggedBy = req.user._id || req.user.id;
            review.flagReason = flagReason;
        } else if (!hidden) {
            review.flaggedBy = undefined;
            review.flagReason = undefined;
        }
        await review.save();
        if (review.restaurant) {
            const restaurant = await Restaurant.findById(review.restaurant);
            if (restaurant) {
                restaurant.rating = await buildRatingStatsOptimized('restaurant', review.restaurant, 'restaurantRating');
                await restaurant.save();
            }
        }
        if (review.rider) {
            const rider = await Rider.findById(review.rider);
            if (rider) {
                rider.rating = await buildRatingStatsOptimized('rider', review.rider, 'riderRating');
                await rider.save();
            }
        }
        res.status(200).json({
            success: true,
            message: hidden ? 'Review hidden successfully' : 'Review restored successfully',
            review: { _id: review._id, isHidden: review.isHidden, flagReason: review.flagReason },
        });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};
exports.getMyReviews = async (req, res) => {
    try {
        const userId = req.user.id;
        const { page, limit, skip } = getPaginationParams(req, 20);
        const total = await Review.countDocuments({ user: userId });
        const reviews = await Review.find({ user: userId })
            .populate('order', 'orderId totalAmount status')
            .populate('restaurant', 'name image bannerImage')
            .populate({
                path: 'rider',
                populate: {
                    path: 'user',
                    select: 'name profilePic'
                }
            })
            .skip(skip)
            .limit(limit)
            .sort({ createdAt: -1 });
        const formattedReviews = reviews.map(review => ({
            _id: review._id,
            orderId: review.order?.orderId || review.order?._id,
            restaurantName: review.restaurant?.name,
            restaurantImage: review.restaurant?.image,
            restaurantBannerImage: review.restaurant?.bannerImage,
            restaurantRating: review.restaurantRating,
            riderName: review.rider?.user?.name,
            riderRating: review.riderRating,
            comment: review.comment,
            photos: review.photos,
            createdAt: review.createdAt
        }));
        res.status(200).json({
            reviews: formattedReviews,
            total,
            page,
            limit,
            pages: Math.ceil(total / limit)
        });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};
exports.createReview = async (req, res) => {
    try {
        const userId = req.user.id;
        const { orderId, restaurantRating, riderRating, comment, photos } = req.body;
        const order = await Order.findById(orderId);
        if (!order) {
            return res.status(404).json({ message: 'Order not found' });
        }
        if (order.customer.toString() !== userId) {
            return res.status(403).json({ message: 'Not authorized to review this order' });
        }
        if (order.status !== 'delivered') {
            return res.status(400).json({ message: 'Can only review delivered orders' });
        }
        const existingReview = await Review.findOne({ order: orderId });
        if (existingReview) {
            return res.status(400).json({ message: 'Review already submitted for this order' });
        }
        const review = await Review.create({
            user: userId,
            order: orderId,
            restaurant: order.restaurant,
            rider: order.rider,
            restaurantRating,
            riderRating,
            comment,
            photos: photos || []
        });
        if (restaurantRating) {
            const restaurant = await Restaurant.findById(order.restaurant);
            if (restaurant) {
                const stats = await buildRatingStatsOptimized('restaurant', order.restaurant, 'restaurantRating');
                restaurant.rating = stats;
                await restaurant.save();
            }
        }
        if (riderRating && order.rider) {
            const rider = await Rider.findById(order.rider);
            if (rider) {
                const stats = await buildRatingStatsOptimized('rider', order.rider, 'riderRating');
                rider.rating = stats;
                await rider.save();
            }
        }
        order.isRated = true;
        await order.save();
        res.status(201).json({
            message: 'Review submitted successfully',
            review
        });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};
exports.updateReview = async (req, res) => {
    try {
        const { id } = req.params;
        const userId = req.user.id;
        const { restaurantRating, riderRating, comment, photos } = req.body;
        const review = await Review.findById(id);
        if (!review) {
            return res.status(404).json({ message: 'Review not found' });
        }
        if (review.user.toString() !== userId) {
            return res.status(403).json({ message: 'Not authorized to update this review' });
        }
        const editTimeLimit = 48 * 60 * 60 * 1000; // 48 hours in milliseconds
        const timeSinceCreation = Date.now() - new Date(review.createdAt).getTime();
        if (timeSinceCreation > editTimeLimit) {
            return res.status(403).json({
                message: 'Edit time limit exceeded. Reviews can only be edited within 48 hours of creation.'
            });
        }
        if (restaurantRating !== undefined) review.restaurantRating = restaurantRating;
        if (riderRating !== undefined) review.riderRating = riderRating;
        if (comment !== undefined) review.comment = comment;
        if (photos !== undefined) review.photos = photos;
        await review.save();
        if (restaurantRating !== undefined && review.restaurant) {
            const restaurant = await Restaurant.findById(review.restaurant);
            if (restaurant) {
                const stats = await buildRatingStatsOptimized('restaurant', review.restaurant, 'restaurantRating');
                restaurant.rating = stats;
                await restaurant.save();
            }
        }
        if (riderRating !== undefined && review.rider) {
            const rider = await Rider.findById(review.rider);
            if (rider) {
                const stats = await buildRatingStatsOptimized('rider', review.rider, 'riderRating');
                rider.rating = stats;
                await rider.save();
            }
        }
        res.status(200).json({
            message: 'Review updated successfully',
            review
        });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};
exports.deleteReview = async (req, res) => {
    try {
        const { id } = req.params;
        const userId = req.user.id;
        const isAdmin = req.user.role === 'admin';
        const review = await Review.findById(id);
        if (!review) {
            return res.status(404).json({ message: 'Review not found' });
        }
        if (!isAdmin && review.user.toString() !== userId) {
            return res.status(403).json({ message: 'Not authorized to delete this review' });
        }
        await review.deleteOne();
        const order = await Order.findById(review.order);
        if (order) {
            order.isRated = false;
            await order.save();
        }
        if (review.restaurant) {
            const restaurant = await Restaurant.findById(review.restaurant);
            if (restaurant) {
                const stats = await buildRatingStatsOptimized('restaurant', review.restaurant, 'restaurantRating');
                restaurant.rating = stats;
                await restaurant.save();
            }
        }
        if (review.rider) {
            const rider = await Rider.findById(review.rider);
            if (rider) {
                const stats = await buildRatingStatsOptimized('rider', review.rider, 'riderRating');
                rider.rating = stats;
                await rider.save();
            }
        }
        res.status(200).json({ message: 'Review deleted successfully' });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};
exports.getReviewStats = async (req, res) => {
    try {
        const [totals, restStats, riderStats] = await Promise.all([
            Review.aggregate([
                {
                    $group: {
                        _id: null,
                        total: { $sum: 1 },
                        hidden: { $sum: { $cond: ['$isHidden', 1, 0] } },
                        withRestaurantRating: { $sum: { $cond: [{ $ifNull: ['$restaurantRating', false] }, 1, 0] } },
                        withRiderRating: { $sum: { $cond: [{ $ifNull: ['$riderRating', false] }, 1, 0] } },
                    }
                }
            ]),
            buildRatingStatsOptimized('restaurant', null, 'restaurantRating').catch(() => null),
            buildRatingStatsOptimized('rider', null, 'riderRating').catch(() => null),
        ]);
        const [globalRestAgg, globalRiderAgg] = await Promise.all([
            Review.aggregate([
                { $match: { restaurantRating: { $exists: true, $ne: null } } },
                {
                    $group: {
                        _id: null, avg: { $avg: '$restaurantRating' }, count: { $sum: 1 },
                        five: { $sum: { $cond: [{ $eq: ['$restaurantRating', 5] }, 1, 0] } },
                        four: { $sum: { $cond: [{ $eq: ['$restaurantRating', 4] }, 1, 0] } },
                        three: { $sum: { $cond: [{ $eq: ['$restaurantRating', 3] }, 1, 0] } },
                        two: { $sum: { $cond: [{ $eq: ['$restaurantRating', 2] }, 1, 0] } },
                        one: { $sum: { $cond: [{ $eq: ['$restaurantRating', 1] }, 1, 0] } },
                    }
                }
            ]),
            Review.aggregate([
                { $match: { riderRating: { $exists: true, $ne: null } } },
                {
                    $group: {
                        _id: null, avg: { $avg: '$riderRating' }, count: { $sum: 1 },
                        five: { $sum: { $cond: [{ $eq: ['$riderRating', 5] }, 1, 0] } },
                        four: { $sum: { $cond: [{ $eq: ['$riderRating', 4] }, 1, 0] } },
                        three: { $sum: { $cond: [{ $eq: ['$riderRating', 3] }, 1, 0] } },
                        two: { $sum: { $cond: [{ $eq: ['$riderRating', 2] }, 1, 0] } },
                        one: { $sum: { $cond: [{ $eq: ['$riderRating', 1] }, 1, 0] } },
                    }
                }
            ]),
        ]);
        const t = totals[0] || { total: 0, hidden: 0, withRestaurantRating: 0, withRiderRating: 0 };
        const ra = globalRestAgg[0] || { avg: 0, count: 0, five: 0, four: 0, three: 0, two: 0, one: 0 };
        const ri = globalRiderAgg[0] || { avg: 0, count: 0, five: 0, four: 0, three: 0, two: 0, one: 0 };
        res.status(200).json({
            totalReviews: t.total,
            hiddenReviews: t.hidden,
            restaurantReviews: t.withRestaurantRating,
            riderReviews: t.withRiderRating,
            averageRestaurantRating: Math.round((ra.avg || 0) * 10) / 10,
            averageRiderRating: Math.round((ri.avg || 0) * 10) / 10,
            ratingDistribution: {
                restaurant: { 5: ra.five, 4: ra.four, 3: ra.three, 2: ra.two, 1: ra.one },
                rider: { 5: ri.five, 4: ri.four, 3: ri.three, 2: ri.two, 1: ri.one },
            },
        });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};
