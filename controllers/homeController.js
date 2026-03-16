const mongoose = require("mongoose");
const Restaurant = require("../models/Restaurant");
const Banner = require("../models/Banner");
const Order = require("../models/Order");
const Cuisine = require("../models/Cuisine"); // From Admin CMS
const Review = require("../models/Review");
const { formatRestaurantForUser } = require("../utils/responseFormatter");
const toRadians = (value) => (value * Math.PI) / 180;
const calculateDistanceKm = (lat1, lon1, lat2, lon2) => {
  const R = 6371; // Earth radius in km
  const dLat = toRadians(lat2 - lat1);
  const dLon = toRadians(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRadians(lat1)) * Math.cos(toRadians(lat2)) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
};
const buildReviewCountMap = async (restaurantIds) => {
  if (!restaurantIds.length) {
    return new Map();
  }
  const reviewCounts = await Review.aggregate([
    { $match: { restaurant: { $in: restaurantIds } } },
    { $group: { _id: "$restaurant", count: { $sum: 1 } } },
  ]);
  return new Map(reviewCounts.map((r) => [r._id.toString(), r.count]));
};
const normalizeProductName = (name) => {
  if (!name) return null;
  if (typeof name === "string") return name;
  if (name.en) return name.en;
  return name.de || name.ar || null;
};
const buildRestaurantBaseQuery = () => ({
  isActive: true,
  isTemporarilyClosed: { $ne: true },
  $and: [
    {
      restaurantApproved: true,
    },
    {
      menuApproved: true,
    },
    {
      verificationStatus: "verified",
    },
  ],
});
const buildBestSellerMap = async (restaurantIds) => {
  if (!restaurantIds.length) {
    return new Map();
  }
  const bestSellers = await Order.aggregate([
    {
      $match: {
        restaurant: { $in: restaurantIds },
        status: "delivered",
      },
    },
    { $unwind: "$items" },
    {
      $group: {
        _id: {
          restaurant: "$restaurant",
          product: "$items.product",
        },
        quantity: { $sum: "$items.quantity" },
      },
    },
    { $sort: { quantity: -1 } },
    {
      $group: {
        _id: "$_id.restaurant",
        product: { $first: "$_id.product" },
        quantity: { $first: "$quantity" },
      },
    },
    {
      $lookup: {
        from: "products",
        localField: "product",
        foreignField: "_id",
        as: "product",
      },
    },
    { $unwind: { path: "$product", preserveNullAndEmptyArrays: true } },
    {
      $project: {
        _id: 1,
        productName: "$product.name",
        quantity: 1,
      },
    },
  ]);
  return new Map(
    bestSellers
      .map((entry) => {
        const name = normalizeProductName(entry.productName);
        if (!name) return null;
        return [entry._id.toString(), name];
      })
      .filter(Boolean)
  );
};
const collectRestaurantIds = (collections) => {
  const ids = new Set();
  collections.forEach((items) => {
    if (!Array.isArray(items)) return;
    items.forEach((item) => {
      const id = item?._id?.toString();
      if (id) ids.add(id);
    });
  });
  return Array.from(ids).map((id) => id);
};
const applyMinRatingFilter = (query, minRating) => {
  if (!minRating) return;
  const range = { $gte: parseFloat(minRating) };
  query.$and = query.$and || [];
  query.$and.push({
    $or: [
      { "rating.average": range },
      { rating: range }
    ]
  });
};
const decorateRestaurants = ({
  restaurants,
  reviewCountMap,
  bestSellerMap,
  userLat,
  userLong,
}) => {
  const lat = parseFloat(userLat);
  const long = parseFloat(userLong);
  const hasLocation = Number.isFinite(lat) && Number.isFinite(long);
  if (!hasLocation) {
    return restaurants.map((restaurant) => {
      const formatted = formatRestaurantForUser(restaurant);
      const restaurantId = formatted?._id?.toString();
      if (!restaurantId) return formatted;
      const result = { ...formatted };
      if (reviewCountMap && reviewCountMap.has(restaurantId)) {
        result.reviewCount = reviewCountMap.get(restaurantId);
      } else if (reviewCountMap) {
        result.reviewCount = 0;
      }
      if (bestSellerMap && bestSellerMap.has(restaurantId)) {
        result.bestSeller = bestSellerMap.get(restaurantId);
      }
      return result;
    });
  }
  return restaurants.map((restaurant) => {
    const formatted = formatRestaurantForUser(restaurant);
    const restaurantId = formatted?._id?.toString();
    if (!restaurantId) return formatted;
    const result = { ...formatted };
    if (reviewCountMap && reviewCountMap.has(restaurantId)) {
      result.reviewCount = reviewCountMap.get(restaurantId);
    } else if (reviewCountMap) {
      result.reviewCount = 0;
    }
    if (bestSellerMap && bestSellerMap.has(restaurantId)) {
      result.bestSeller = bestSellerMap.get(restaurantId);
    }
    if (hasLocation && restaurant.location?.coordinates?.length === 2) {
      const [restaurantLong, restaurantLat] = restaurant.location.coordinates;
      if (
        Number.isFinite(restaurantLat) &&
        Number.isFinite(restaurantLong)
      ) {
        const distanceKm = calculateDistanceKm(
          lat,
          long,
          restaurantLat,
          restaurantLong
        );
        result.distanceKm = Number(distanceKm.toFixed(2));
      }
    }
    return result;
  });
};
const resolveCuisineNames = async ({ cuisine, cuisineId, cuisines }) => {
  const names = [];
  if (cuisine) names.push(cuisine);
  if (cuisines) {
    const list = cuisines
      .split(",")
      .map((entry) => entry.trim())
      .filter(Boolean);
    names.push(...list);
  }
  if (cuisineId) {
    const cuisineDoc = await Cuisine.findById(cuisineId).select("name").lean();
    if (!cuisineDoc) return { error: "Cuisine not found" };
    names.push(cuisineDoc.name);
  }
  const unique = Array.from(new Set(names));
  return { names: unique };
};
exports.getHomeData = async (req, res) => {
  try {
    const lat = Number(req.query.lat);
    const lng = Number(req.query.lng ?? req.query.long);
    const { city, minPrice, maxPrice } = req.query;
    const userId = req.user ? req.user._id : null;
    const radiusKm = Number(req.query.radiusKm || 10);
    const hasCoords = Number.isFinite(lat) && Number.isFinite(lng);
    let restaurantQuery = buildRestaurantBaseQuery();
    const radiusRadians = radiusKm / 6371;
    const useLocationFilter = hasCoords && await Restaurant.exists({
      ...buildRestaurantBaseQuery(),
      location: {
        $geoWithin: {
          $centerSphere: [[lng, lat], radiusRadians],
        },
      },
    });
    if (useLocationFilter) {
      restaurantQuery.location = {
        $near: {
          $geometry: { type: "Point", coordinates: [lng, lat] },
          $maxDistance: radiusKm * 1000, // Convert km to meters
        },
      };
    }
    if (city && !useLocationFilter) {
      restaurantQuery.city = city;
    }
    const { getPriceRangeQuery } = require('../utils/priceRangeUtils');
    const priceQuery = getPriceRangeQuery(minPrice, maxPrice);
    Object.assign(restaurantQuery, priceQuery);
    const bannersPromise = Banner.find({ isActive: true })
      .sort({ position: 1 })
      .lean();
    const cuisinesPromise = Cuisine.find({ isActive: true })
      .select("name image")
      .limit(8)
      .lean();
    let preferredCuisines = new Set();
    let recentRestaurants = [];
    const { isRestaurantOpenNow } = require('../utils/restaurantAvailability');
    if (userId) {
      const lastOrders = await Order.find({ customer: userId })
        .sort({ createdAt: -1 })
        .limit(10)
        .select("restaurant")
        .populate({
          path: "restaurant",
          select:
            "name description image bannerImage cuisine rating address city area deliveryTime deliveryType isFreeDelivery minOrderValue estimatedPreparationTime isActive isTemporarilyClosed timing location menuApproved verificationStatus",
        })
        .lean();
      const recentRestaurantsMap = new Map();
      lastOrders.forEach((order) => {
        if (order.restaurant) {
          const restaurantId = order.restaurant._id?.toString();
          if (restaurantId && !recentRestaurantsMap.has(restaurantId)) {
            recentRestaurantsMap.set(restaurantId, order.restaurant);
          }
          if (order.restaurant.cuisine) {
            order.restaurant.cuisine.forEach((c) => preferredCuisines.add(c));
          }
        }
      });
      recentRestaurants = Array.from(recentRestaurantsMap.values()).slice(0, 5);
    }
    let recommendationsPromise = Promise.resolve([]);
    const preferredCuisineList = Array.from(preferredCuisines);
    if (preferredCuisineList.length > 0) {
      let query = Restaurant.find({
        ...restaurantQuery,
        cuisine: { $in: preferredCuisineList },
      });
      if (useLocationFilter) {
        query = query.limit(30); // More results with location
      } else {
        query = query.sort({ "rating.average": -1, totalOrders: -1 }).limit(10);
      }
      recommendationsPromise = query.select("name image bannerImage rating deliveryTime address city area cuisine isFreeDelivery minOrderValue estimatedPreparationTime location isActive isTemporarilyClosed menuApproved verificationStatus timing priceRange").lean();
    } else {
      let query = Restaurant.find(restaurantQuery);
      if (useLocationFilter) {
        query = query.limit(30);
      } else {
        query = query.sort({ "rating.average": -1, totalOrders: -1 }).limit(10);
      }
      recommendationsPromise = query.select("name image bannerImage rating deliveryTime address city area cuisine isFreeDelivery minOrderValue estimatedPreparationTime location isActive isTemporarilyClosed menuApproved verificationStatus timing priceRange").lean();
    }
    let exploreQuery = Restaurant.find(restaurantQuery);
    if (useLocationFilter) {
      exploreQuery = exploreQuery.limit(50); // More results with location
    } else {
      exploreQuery = exploreQuery.sort({ "rating.average": -1, totalOrders: -1 }).limit(20);
    }
    const exploreRestaurantsPromise = exploreQuery.select("name image bannerImage rating deliveryTime address city area cuisine isFreeDelivery minOrderValue estimatedPreparationTime location isActive isTemporarilyClosed menuApproved verificationStatus timing priceRange").lean();
    let popularQuery = Restaurant.find(restaurantQuery);
    if (useLocationFilter) {
      popularQuery = popularQuery.limit(30);
    } else {
      popularQuery = popularQuery.sort({ "rating.average": -1, totalOrders: -1 }).limit(10);
    }
    const popularRestaurantsPromise = popularQuery.select("name image bannerImage rating deliveryTime address city area cuisine isFreeDelivery location isActive isTemporarilyClosed menuApproved verificationStatus timing priceRange").lean();
    let fastDeliveryQuery = Restaurant.find({
      ...restaurantQuery,
      deliveryTime: { $lte: 30 },
    });
    if (useLocationFilter) {
      fastDeliveryQuery = fastDeliveryQuery.limit(30);
    } else {
      fastDeliveryQuery = fastDeliveryQuery.limit(10);
    }
    const fastDeliveryPromise = fastDeliveryQuery.select("name image bannerImage deliveryTime rating cuisine location isActive isTemporarilyClosed menuApproved verificationStatus timing priceRange").lean();
    let freeDeliveryQuery = Restaurant.find({
      ...restaurantQuery,
      isFreeDelivery: true,
    });
    if (useLocationFilter) {
      freeDeliveryQuery = freeDeliveryQuery.limit(30);
    } else {
      freeDeliveryQuery = freeDeliveryQuery.limit(10);
    }
    const freeDeliveryPromise = freeDeliveryQuery.select("name image bannerImage deliveryTime rating cuisine location isActive isTemporarilyClosed menuApproved verificationStatus timing priceRange").lean();
    let newRestaurantsQuery = Restaurant.find({
      ...restaurantQuery,
      createdAt: { $gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) },
    });
    if (useLocationFilter) {
      newRestaurantsQuery = newRestaurantsQuery.limit(30);
    } else {
      newRestaurantsQuery = newRestaurantsQuery.limit(10);
    }
    const newRestaurantsPromise = newRestaurantsQuery.select("name image bannerImage rating cuisine location isActive isTemporarilyClosed menuApproved verificationStatus timing priceRange").lean();
    const [
      banners,
      cuisines,
      recommendations,
      exploreRestaurants,
      popularRestaurants,
      fastDelivery,
      freeDelivery,
      newRestaurants,
    ] = await Promise.all([
      bannersPromise,
      cuisinesPromise,
      recommendationsPromise,
      exploreRestaurantsPromise,
      popularRestaurantsPromise,
      fastDeliveryPromise,
      freeDeliveryPromise,
      newRestaurantsPromise,
    ]);
    const onlyOpen = req.query.onlyOpen === "1" || req.query.onlyOpen === "true";
    const filterOpen = (restaurants) => restaurants.filter(r => isRestaurantOpenNow(r));
    const filteredRecommendations = onlyOpen ? filterOpen(recommendations) : recommendations;
    const filteredExploreRestaurants = onlyOpen ? filterOpen(exploreRestaurants) : exploreRestaurants;
    const filteredPopularRestaurants = onlyOpen ? filterOpen(popularRestaurants) : popularRestaurants;
    const filteredFastDelivery = onlyOpen ? filterOpen(fastDelivery) : fastDelivery;
    const filteredFreeDelivery = onlyOpen ? filterOpen(freeDelivery) : freeDelivery;
    const filteredNewRestaurants = onlyOpen ? filterOpen(newRestaurants) : newRestaurants;
    const filteredRecentRestaurants = onlyOpen ? filterOpen(recentRestaurants) : recentRestaurants;
    const allRestaurantIds = collectRestaurantIds([
      filteredRecentRestaurants,
      filteredRecommendations,
      filteredExploreRestaurants,
      filteredPopularRestaurants,
      filteredFastDelivery,
      filteredFreeDelivery,
      filteredNewRestaurants,
    ]).map((id) => new mongoose.Types.ObjectId(id));
    const [reviewCountMap, bestSellerMap] = await Promise.all([
      buildReviewCountMap(allRestaurantIds),
      buildBestSellerMap(allRestaurantIds),
    ]);
    const formattedRecommendations = decorateRestaurants({
      restaurants: filteredRecommendations,
      reviewCountMap,
      bestSellerMap,
      userLat: lat,
      userLong: lng,
    });
    const formattedExploreRestaurants = decorateRestaurants({
      restaurants: filteredExploreRestaurants,
      reviewCountMap,
      bestSellerMap,
      userLat: lat,
      userLong: lng,
    });
    const formattedRecentRestaurants = decorateRestaurants({
      restaurants: filteredRecentRestaurants,
      reviewCountMap,
      bestSellerMap,
      userLat: lat,
      userLong: lng,
    });
    const formattedPopularRestaurants = decorateRestaurants({
      restaurants: filteredPopularRestaurants,
      reviewCountMap,
      bestSellerMap,
      userLat: lat,
      userLong: lng,
    });
    const formattedFastDelivery = decorateRestaurants({
      restaurants: filteredFastDelivery,
      reviewCountMap,
      bestSellerMap,
      userLat: lat,
      userLong: lng,
    });
    const formattedFreeDelivery = decorateRestaurants({
      restaurants: filteredFreeDelivery,
      reviewCountMap,
      bestSellerMap,
      userLat: lat,
      userLong: lng,
    });
    const formattedNewRestaurants = decorateRestaurants({
      restaurants: filteredNewRestaurants,
      reviewCountMap,
      bestSellerMap,
      userLat: lat,
      userLong: lng,
    });
    res.status(200).json({
      banners,
      categories: cuisines, // Pizza, Chicken, Burgers, Cakes
      sections: {
        recentRestaurants: formattedRecentRestaurants,
        recommendedForYou: formattedRecommendations,
        exploreRestaurants: formattedExploreRestaurants,
        popularRestaurants: formattedPopularRestaurants,
        fastDelivery: formattedFastDelivery,
        freeDelivery: formattedFreeDelivery,
        newOnPlatform: formattedNewRestaurants,
      },
      tabs: ["Restaurants", "Offers", "Pick-up"], // Available tabs
      metadata: {
        locationBased: useLocationFilter,
        radiusKm: useLocationFilter ? radiusKm : null,
        coordinates: useLocationFilter ? { lat, lng } : null,
        totalRestaurants: {
          recommended: formattedRecommendations.length,
          explore: formattedExploreRestaurants.length,
          popular: formattedPopularRestaurants.length,
          fastDelivery: formattedFastDelivery.length,
          freeDelivery: formattedFreeDelivery.length,
          new: formattedNewRestaurants.length,
        }
      }
    });
  } catch (error) {
    console.error("Get Home Data Error:", error);
    res.status(500).json({ message: error.message });
  }
};
exports.getCategories = async (req, res) => {
  try {
    const categories = await Cuisine.find({ isActive: true })
      .select("name image")
      .limit(20);
    res.status(200).json({
      categories,
      message: "Categories fetched successfully"
    });
  } catch (error) {
    console.error("Get Categories Error:", error);
    res.status(500).json({ message: error.message });
  }
};
exports.getRecommendedRestaurants = async (req, res) => {
  try {
    const userId = req.user ? req.user._id : null;
    const { limit = 30, city, lat, long } = req.query;
    const userLat = lat ? Number(lat) : null;
    const userLng = long ? Number(long) : null;
    const hasCoords = Number.isFinite(userLat) && Number.isFinite(userLng);
    let restaurantQuery = buildRestaurantBaseQuery();
    if (hasCoords) {
      restaurantQuery.location = {
        $near: {
          $geometry: { type: "Point", coordinates: [userLng, userLat] },
          $maxDistance: 20000 // 20km
        }
      };
    }
    if (city && !hasCoords) {
      restaurantQuery.city = city;
    }
    let preferredCuisines = new Set();
    if (userId) {
      const lastOrders = await Order.find({ customer: userId })
        .limit(10)
        .select("restaurant")
        .populate({ path: "restaurant", select: "cuisine" })
        .lean();
      lastOrders.forEach((o) => {
        if (o.restaurant && o.restaurant.cuisine) {
          o.restaurant.cuisine.forEach((c) => preferredCuisines.add(c));
        }
      });
    }
    let restaurants;
    const preferredCuisineList = Array.from(preferredCuisines);
    if (preferredCuisineList.length > 0) {
      restaurants = await Restaurant.find({
        ...restaurantQuery,
        cuisine: { $in: preferredCuisineList },
      })
        .limit(parseInt(limit))
        .select("name image bannerImage rating deliveryTime address city area cuisine isFreeDelivery minOrderValue location isActive isTemporarilyClosed menuApproved verificationStatus timing priceRange")
        .lean();
    } else {
      let query = Restaurant.find(restaurantQuery);
      if (!hasCoords) {
        query = query.sort({ "rating.average": -1, totalOrders: -1 });
      }
      restaurants = await query
        .limit(parseInt(limit))
        .select("name image bannerImage rating deliveryTime address city area cuisine isFreeDelivery minOrderValue location isActive isTemporarilyClosed menuApproved verificationStatus timing priceRange")
        .lean();
    }
    const { isRestaurantOpenNow } = require('../utils/restaurantAvailability');
    const openRestaurants = restaurants.filter(r => isRestaurantOpenNow(r));
    const restaurantIds = collectRestaurantIds([openRestaurants]).map((id) =>
      new mongoose.Types.ObjectId(id)
    );
    const [reviewCountMap, bestSellerMap] = await Promise.all([
      buildReviewCountMap(restaurantIds),
      buildBestSellerMap(restaurantIds),
    ]);
    const formattedRestaurants = decorateRestaurants({
      restaurants: openRestaurants,
      reviewCountMap,
      bestSellerMap,
      userLat: userLat,
      userLong: userLng,
    });
    res.status(200).json({
      restaurants: formattedRestaurants,
      count: formattedRestaurants.length
    });
  } catch (error) {
    console.error("Get Recommended Error:", error);
    res.status(500).json({ message: error.message });
  }
};
exports.getExploreRestaurants = async (req, res) => {
  try {
    const { 
      city, 
      cuisine, 
      cuisines,
      cuisineId,
      minRating, 
      maxDeliveryTime, 
      isFreeDelivery,
      minPrice,
      maxPrice,
      sort = "rating",
      limit = 20,
      page = 1,
      lat,
      long
    } = req.query;
    let query = buildRestaurantBaseQuery();
    if (city) query.city = city;
    const cuisineResult = await resolveCuisineNames({ cuisine, cuisines, cuisineId });
    if (cuisineResult.error) {
      return res.status(400).json({ message: cuisineResult.error });
    }
    if (cuisineResult.names && cuisineResult.names.length > 0) {
      query.cuisine = { $in: cuisineResult.names };
    }
    applyMinRatingFilter(query, minRating);
    if (maxDeliveryTime) query.deliveryTime = { $lte: parseInt(maxDeliveryTime) };
    if (isFreeDelivery === 'true') query.isFreeDelivery = true;
    const { getPriceRangeQuery } = require('../utils/priceRangeUtils');
    const priceQuery = getPriceRangeQuery(minPrice, maxPrice);
    Object.assign(query, priceQuery);
    const userLat = lat ? Number(lat) : null;
    const userLng = long ? Number(long) : null;
    const hasCoords = Number.isFinite(userLat) && Number.isFinite(userLng);
    let sortOption = {};
    let useGeoQuery = false;
    switch (sort) {
      case "rating":
        sortOption = { "rating.average": -1, totalOrders: -1 };
        break;
      case "deliveryTime":
        sortOption = { deliveryTime: 1 };
        break;
      case "distance":
        if (hasCoords) {
          useGeoQuery = true;
          query.location = {
            $near: {
              $geometry: { type: "Point", coordinates: [userLng, userLat] },
              $maxDistance: 50000 // 50km max radius
            }
          };
        } else {
          sortOption = { "rating.average": -1, totalOrders: -1 };
        }
        break;
      default:
        sortOption = { "rating.average": -1 };
    }
    const skip = (parseInt(page) - 1) * parseInt(limit);
    const total = await Restaurant.countDocuments(useGeoQuery ? { ...query, location: { $exists: true } } : query);
    let restaurantQuery = Restaurant.find(query);
    if (!useGeoQuery) {
      restaurantQuery = restaurantQuery.sort(sortOption);
    }
    const restaurants = await restaurantQuery
      .skip(skip)
      .limit(parseInt(limit))
      .select("name image bannerImage rating deliveryTime address city area cuisine isFreeDelivery minOrderValue location isActive isTemporarilyClosed menuApproved verificationStatus timing priceRange")
      .lean();
    const { isRestaurantOpenNow } = require('../utils/restaurantAvailability');
    const openRestaurants = restaurants.filter(r => isRestaurantOpenNow(r));
    const restaurantIds = collectRestaurantIds([openRestaurants]).map((id) =>
      new mongoose.Types.ObjectId(id)
    );
    const [reviewCountMap, bestSellerMap] = await Promise.all([
      buildReviewCountMap(restaurantIds),
      buildBestSellerMap(restaurantIds),
    ]);
    const formattedRestaurants = decorateRestaurants({
      restaurants: openRestaurants,
      reviewCountMap,
      bestSellerMap,
      userLat: userLat,
      userLong: userLng,
    });
    res.status(200).json({
      restaurants: formattedRestaurants,
      pagination: {
        total,
        page: parseInt(page),
        limit: parseInt(limit),
        pages: Math.ceil(total / parseInt(limit))
      }
    });
  } catch (error) {
    console.error("Get Explore Restaurants Error:", error);
    res.status(500).json({ message: error.message });
  }
};
exports.getBanners = async (req, res) => {
  try {
    const banners = await Banner.find({ isActive: true, type: "restaurant", targetModel: "Restaurant" })
      .sort({ position: 1 })
      .select("_id title image targetId")
      .lean();

    const normalized = banners.map((banner) => ({
      _id: banner._id,
      title: banner.title,
      image: banner.image,
      type: "restaurant",
      targetId: banner.targetId || null,
      targetModel: "Restaurant",
      navigationType: "restaurant",
    }));

    res.status(200).json({
      banners: normalized,
      count: normalized.length
    });
  } catch (error) {
    console.error("Get Banners Error:", error);
    res.status(500).json({ message: error.message });
  }
};
