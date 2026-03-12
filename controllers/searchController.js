const Restaurant = require('../models/Restaurant');
const Product = require('../models/Product');
const User = require('../models/User');
const SearchLog = require('../models/SearchLog');
const Rider = require('../models/Rider');
const { formatRestaurantForUser, formatProductForUser } = require('../utils/responseFormatter');
const { getNearbyRidersQuery, calculateDistance, estimateTravelMinutes } = require('../utils/locationUtils');
const { isRestaurantOpenNow } = require('../utils/restaurantAvailability');
const getAverageRating = (rating) => {
    if (typeof rating === 'number') return rating;
    if (rating && typeof rating === 'object' && typeof rating.average === 'number') {
        return rating.average;
    }
    return 0;
};
const applyMinRatingFilter = (query, minRating) => {
    if (!minRating) return;
    const range = { $gte: Number(minRating) };
    query.$and = query.$and || [];
    query.$and.push({
        $or: [
            { 'rating.average': range },
            { rating: range }
        ]
    });
};
exports.getSuggestions = async (req, res) => {
    try {
        const { q, lat, lng, radiusKm, riderRadiusKm } = req.query;
        if (!q) return res.status(200).json([]);
        const parsedLat = Number(lat);
        const parsedLng = Number(lng);
        const parsedRadiusKm = Number(radiusKm || 10);
        const parsedRiderRadiusKm = Number(riderRadiusKm || 5);
        const hasCoords = Number.isFinite(parsedLat) && Number.isFinite(parsedLng);
        const regex = new RegExp(q, 'i'); // Case-insensitive
        const restaurantQuery = {
            'name.en': regex,
            isActive: true,
            restaurantApproved: true,
            menuApproved: true,
            isTemporarilyClosed: false
        };
        if (hasCoords) {
            restaurantQuery.location = {
                $near: {
                    $geometry: { type: 'Point', coordinates: [parsedLng, parsedLat] },
                    $maxDistance: parsedRadiusKm * 1000
                }
            };
        }
        const restaurantLimit = hasCoords ? 50 : 10;
        let query = Restaurant.find(
            restaurantQuery,
            { 'name.en': 1, image: 1, bannerImage: 1, location: 1, timing: 1, isTemporarilyClosed: 1, deliveryTime: 1, menuApproved: 1, verificationStatus: 1 }
        );
        if (hasCoords) {
            query = query.sort({ location: 1 });
        }
        const restaurants = await query.limit(restaurantLimit);
        const filteredRestaurants = restaurants.filter((restaurant) => isRestaurantOpenNow(restaurant));
        const riderRadiusMeters = parsedRiderRadiusKm * 1000;
        const restaurantsWithAvailability = await Promise.all(
            filteredRestaurants.map(async (restaurant) => {
                if (!hasCoords) {
                    return { restaurant, nearbyRiderCount: null, estimatedDeliveryTime: null, distanceKm: null };
                }
                const coordinates = restaurant.location?.coordinates;
                if (!coordinates || coordinates.length !== 2 || 
                    !Number.isFinite(coordinates[0]) || !Number.isFinite(coordinates[1]) ||
                    (coordinates[0] === 0 && coordinates[1] === 0)) {
                    return null;
                }
                const riderQuery = getNearbyRidersQuery(coordinates, riderRadiusMeters);
                const nearbyRiders = await Rider.find(riderQuery).sort({ 'currentLocation': 1 }).select('currentLocation');
                const nearbyRiderCount = nearbyRiders.length;
                const nearestRider = nearbyRiders.length > 0 ? nearbyRiders[0] : null;
                if (nearbyRiderCount < 1) {
                    return null;
                }
                const baseDeliveryTime = restaurant.deliveryTime || 30;
                const availabilityPenalty = nearbyRiderCount < 2 ? 8 : nearbyRiderCount < 4 ? 4 : 0;
                let pickupMinutes = 0;
                if (nearestRider?.currentLocation?.coordinates?.length === 2) {
                    const riderCoords = nearestRider.currentLocation.coordinates;
                    const riderDistanceKm = calculateDistance(riderCoords, coordinates);
                    pickupMinutes = estimateTravelMinutes(riderDistanceKm);
                }
                const estimatedDeliveryTime = baseDeliveryTime + pickupMinutes + availabilityPenalty;
                const distanceKm = calculateDistance([parsedLng, parsedLat], coordinates);
                return {
                    restaurant,
                    nearbyRiderCount,
                    estimatedDeliveryTime,
                    pickupMinutes,
                    distanceKm
                };
            })
        );
        const availableRestaurants = restaurantsWithAvailability
            .filter(Boolean)
            .slice(0, 5);
        const allowedRestaurantIds = new Set(
            availableRestaurants.map((entry) => entry.restaurant._id.toString())
        );
        const foods = await Product.find(
            { 'name.en': regex, available: true },
            { 'name.en': 1, image: 1, restaurant: 1 }
        ).populate('restaurant', 'name').limit(5);
        const suggestions = [
            ...availableRestaurants.map(entry => ({
                type: 'restaurant',
                text: entry.restaurant.name.en,
                id: entry.restaurant._id,
                image: entry.restaurant.image,
                bannerImage: entry.restaurant.bannerImage,
                ...(entry.estimatedDeliveryTime !== null
                    ? {
                        estimatedDeliveryTime: entry.estimatedDeliveryTime,
                        riderAvailability: entry.nearbyRiderCount,
                        pickupMinutes: entry.pickupMinutes,
                        distanceKm: entry.distanceKm
                    }
                    : {})
            })),
            ...foods.filter((food) => {
                if (!hasCoords) return true;
                const restId = food.restaurant?._id?.toString();
                return restId && allowedRestaurantIds.has(restId);
            }).map(f => ({
                type: 'dish',
                text: f.name.en,
                id: f._id,
                image: f.image,
                restaurantId: f.restaurant?._id || null,
                restaurantName: f.restaurant?.name || null
            }))
        ];
        res.status(200).json(suggestions);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};
exports.globalSearch = async (req, res) => {
    try {
        const { 
            q,
            cuisine,
            minPrice, 
            maxPrice, 
            minRating, 
            maxDeliveryTime, 
            isFreeDelivery,
            lat,
            lng,
            radiusKm,
            riderRadiusKm
        } = req.query;
        const parsedLat = Number(lat);
        const parsedLng = Number(lng);
        const parsedRadiusKm = Number(radiusKm || 10);
        const parsedRiderRadiusKm = Number(riderRadiusKm || 5);
        const hasCoords = Number.isFinite(parsedLat) && Number.isFinite(parsedLng);
        const safeQuery = (q || '').trim();
        const regex = safeQuery ? new RegExp(safeQuery, 'i') : null;
        if (safeQuery) {
            if (req.user) {
                await User.findByIdAndUpdate(req.user._id, {
                    $push: { recentSearches: { $each: [safeQuery], $slice: -10 } } // Keep last 10
                });
            }
            await SearchLog.updateOne(
                { term: safeQuery.toLowerCase() },
                { $inc: { count: 1 }, $set: { lastSearched: new Date() } },
                { upsert: true }
            );
        }
        let restaurantQuery = {
            isActive: true,
            restaurantApproved: true,
            menuApproved: true,
            isTemporarilyClosed: false,
            ...(regex ? {
                $or: [
                    { 'name.en': regex },
                    { cuisine: regex } // Search by cuisine too (e.g., "Italian")
                ]
            } : {})
        };
        if (hasCoords) {
            restaurantQuery.location = {
                $near: {
                    $geometry: { type: 'Point', coordinates: [parsedLng, parsedLat] },
                    $maxDistance: parsedRadiusKm * 1000
                }
            };
        }
        if (cuisine) {
            restaurantQuery.cuisine = { $in: [cuisine] };
        }
        applyMinRatingFilter(restaurantQuery, minRating);
        if (maxDeliveryTime) restaurantQuery.deliveryTime = { $lte: Number(maxDeliveryTime) };
        if (isFreeDelivery === 'true') restaurantQuery.isFreeDelivery = true;
        const { getPriceRangeQuery } = require('../utils/priceRangeUtils');
        const priceQuery = getPriceRangeQuery(minPrice, maxPrice);
        Object.assign(restaurantQuery, priceQuery);
        let query = Restaurant.find(restaurantQuery)
            .select('_id name image bannerImage rating deliveryTime address area isFreeDelivery location timing isTemporarilyClosed menuApproved verificationStatus priceRange');
        if (hasCoords) {
            query = query.sort({ location: 1 }).limit(50); // Show 50 restaurants in delivery area
        } else {
            query = query.limit(10); // Show 10 restaurants in browsing mode
        }
        const restaurants = await query;
        const filteredRestaurants = hasCoords
            ? restaurants.filter((restaurant) => isRestaurantOpenNow(restaurant))
            : restaurants;
        const riderRadiusMeters = parsedRiderRadiusKm * 1000;
        const restaurantsWithAvailability = await Promise.all(
            filteredRestaurants.map(async (restaurant) => {
                const coordinates = restaurant.location?.coordinates;
                if (!coordinates || coordinates.length !== 2 || 
                    !Number.isFinite(coordinates[0]) || !Number.isFinite(coordinates[1]) ||
                    (coordinates[0] === 0 && coordinates[1] === 0)) {
                    return null;
                }
                if (!hasCoords) {
                    const baseDeliveryTime = restaurant.deliveryTime || 30;
                    return {
                        restaurant,
                        nearbyRiderCount: 0,
                        estimatedDeliveryTime: baseDeliveryTime,
                        distanceKm: null
                    };
                }
                const riderQuery = getNearbyRidersQuery(coordinates, riderRadiusMeters);
                const nearbyRiders = await Rider.find(riderQuery).sort({ 'currentLocation': 1 });
                const nearbyRiderCount = nearbyRiders.length;
                if (nearbyRiderCount < 1) {
                    return null;
                }
                const baseDeliveryTime = restaurant.deliveryTime || 30;
                const deliveryPenalty = nearbyRiderCount < 3 ? 10 : 0;
                const estimatedDeliveryTime = baseDeliveryTime + deliveryPenalty;
                const distanceKm = calculateDistance([parsedLng, parsedLat], coordinates);
                return {
                    restaurant,
                    nearbyRiderCount,
                    estimatedDeliveryTime,
                    distanceKm
                };
            })
        );
        const restaurantMetaMap = new Map();
        const formattedRestaurants = restaurantsWithAvailability
            .filter(Boolean)
            .filter((entry) => {
                if (!maxDeliveryTime) return true;
                return entry.estimatedDeliveryTime <= Number(maxDeliveryTime);
            })
            .map((entry) => {
                const formatted = formatRestaurantForUser(entry.restaurant);
                const meta = {
                    estimatedDeliveryTime: entry.estimatedDeliveryTime,
                    riderAvailability: entry.nearbyRiderCount,
                    pickupMinutes: entry.pickupMinutes,
                    ...(entry.distanceKm !== null ? { distanceKm: entry.distanceKm } : {})
                };
                restaurantMetaMap.set(entry.restaurant._id.toString(), meta);
                return { ...formatted, ...meta };
            });
        let productQuery = {
            available: true,
            ...(regex ? { 'name.en': regex } : {})
        };
        if (formattedRestaurants.length > 0) {
            productQuery.restaurant = { $in: formattedRestaurants.map(r => r._id) };
        } else if (hasCoords) {
            productQuery.restaurant = { $in: [] };
        }
        // isVeg filter removed - field not in Product schema
        if (minPrice || maxPrice) {
            productQuery.basePrice = {};
            if (minPrice) productQuery.basePrice.$gte = Number(minPrice);
            if (maxPrice) productQuery.basePrice.$lte = Number(maxPrice);
        }
        let products = await Product.find(productQuery)
            .populate('restaurant', '_id name rating deliveryTime isActive image bannerImage') 
            .select('_id name image basePrice restaurant description quantity unit gstPercent variations addOns');
        if (minRating || maxDeliveryTime) {
            products = products.filter(p => {
                if (!p.restaurant) return false;
                let pass = true;
                if (!p.restaurant.isActive) pass = false;
                if (minRating && getAverageRating(p.restaurant.rating) < Number(minRating)) pass = false;
                if (maxDeliveryTime && p.restaurant.deliveryTime > Number(maxDeliveryTime)) pass = false;
                return pass;
            });
        }
        const formattedProducts = products.map(p => {
            const restaurantId = p.restaurant?._id?.toString() || null;
            const meta = restaurantId ? restaurantMetaMap.get(restaurantId) : null;
            return {
                ...formatProductForUser(p),
                restaurantId: p.restaurant?._id || null,
                restaurantName: p.restaurant?.name || null,
                restaurantImage: p.restaurant?.image || null,
                restaurantBannerImage: p.restaurant?.bannerImage || null,
                ...(meta ? { estimatedDeliveryTime: meta.estimatedDeliveryTime, distanceKm: meta.distanceKm } : {})
            };
        });
        res.json({
            results: {
                restaurants: formattedRestaurants,
                products: formattedProducts
            }
        });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};
exports.getSearchLanding = async (req, res) => {
    try {
        const { lat, lng, radiusKm, riderRadiusKm } = req.query;
        const parsedLat = Number(lat);
        const parsedLng = Number(lng);
        const parsedRadiusKm = Number(radiusKm || 10);
        const parsedRiderRadiusKm = Number(riderRadiusKm || 5);
        const hasCoords = Number.isFinite(parsedLat) && Number.isFinite(parsedLng);
        const trendingLogs = await SearchLog.find()
            .sort({ count: -1 })
            .limit(5);
        const trending = trendingLogs.map(t => t.term);
        let recent = [];
        if (req.user) {
            const user = await User.findById(req.user._id);
            recent = user.recentSearches ? user.recentSearches.reverse() : []; 
        }
        let nearbyRestaurants = [];
        if (hasCoords) {
            const restaurantQuery = {
                restaurantApproved: true,
                menuApproved: true,
                isActive: true,
                isTemporarilyClosed: false,
                location: {
                    $near: {
                        $geometry: { type: 'Point', coordinates: [parsedLng, parsedLat] },
                        $maxDistance: parsedRadiusKm * 1000
                    }
                }
            };
            const restaurants = await Restaurant.find(restaurantQuery)
                .sort({ location: 1 })
                .limit(50) // Show 30-50 restaurants in delivery area
                .select('_id name image bannerImage rating deliveryTime address area isFreeDelivery location timing isTemporarilyClosed menuApproved verificationStatus');
            const openRestaurants = restaurants.filter((restaurant) =>
                isRestaurantOpenNow(restaurant)
            );
            const restaurantsWithAvailability = await Promise.all(
                openRestaurants.map(async (restaurant) => {
                    const coordinates = restaurant.location?.coordinates;
                    if (!coordinates || coordinates.length !== 2 || 
                        !Number.isFinite(coordinates[0]) || !Number.isFinite(coordinates[1]) ||
                        (coordinates[0] === 0 && coordinates[1] === 0)) {
                        return null;
                    }
                    const baseDeliveryTime = restaurant.deliveryTime || 30;
                    const distanceKm = calculateDistance([parsedLng, parsedLat], coordinates);
                    return {
                        restaurant,
                        nearbyRiderCount: 0,
                        estimatedDeliveryTime: baseDeliveryTime,
                        pickupMinutes: 0,
                        distanceKm
                    };
                })
            );
            nearbyRestaurants = restaurantsWithAvailability
                .filter(Boolean)
                .map((entry) => ({
                    ...formatRestaurantForUser(entry.restaurant),
                    estimatedDeliveryTime: entry.estimatedDeliveryTime,
                    riderAvailability: entry.nearbyRiderCount,
                    pickupMinutes: entry.pickupMinutes,
                    distanceKm: entry.distanceKm
                }));
        }
        res.status(200).json({ trending, recent, nearbyRestaurants });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};
exports.clearSearchHistory = async (req, res) => {
    try {
        await User.findByIdAndUpdate(req.user._id, { $set: { recentSearches: [] } });
        res.status(200).json({ message: "History cleared" });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};
