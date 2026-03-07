
const Restaurant = require('../models/Restaurant');
const Product = require('../models/Product');
const calculateRestaurantPriceRange = async (restaurantId) => {
  try {
    const products = await Product.find({
      restaurant: restaurantId,
      available: true,
      isApproved: true
    }).select('basePrice');
    if (products.length === 0) {
      return { min: 0, max: 0, average: 0 };
    }
    const prices = products.map(p => p.basePrice);
    const min = Math.min(...prices);
    const max = Math.max(...prices);
    const average = Math.round(prices.reduce((sum, p) => sum + p, 0) / prices.length);
    return { min, max, average };
  } catch (error) {
    console.error(`Error calculating price range for restaurant ${restaurantId}:`, error);
    return { min: 0, max: 0, average: 0 };
  }
};
const updateRestaurantPriceRange = async (restaurantId) => {
  try {
    const priceRange = await calculateRestaurantPriceRange(restaurantId);
    await Restaurant.findByIdAndUpdate(
      restaurantId,
      {
        priceRange: {
          min: priceRange.min,
          max: priceRange.max,
          average: priceRange.average,
          lastCalculated: new Date()
        }
      },
      { new: false }
    );
    return true;
  } catch (error) {
    console.error(`Error updating price range for restaurant ${restaurantId}:`, error);
    return false;
  }
};
const updateAllRestaurantPriceRanges = async () => {
  try {
    console.log('🔄 Starting price range update for all restaurants...');
    const restaurants = await Restaurant.find({
      isActive: true
    }).select('_id name');
    let successCount = 0;
    let failCount = 0;
    for (const restaurant of restaurants) {
      const success = await updateRestaurantPriceRange(restaurant._id);
      if (success) {
        successCount++;
      } else {
        failCount++;
      }
    }
    console.log(`✅ Price range update complete: ${successCount} success, ${failCount} failed`);
    return {
      total: restaurants.length,
      success: successCount,
      failed: failCount
    };
  } catch (error) {
    console.error('Error updating all restaurant price ranges:', error);
    throw error;
  }
};
const getPriceRangeQuery = (minPrice, maxPrice) => {
  const query = {};
  if (minPrice !== undefined && minPrice !== null && !isNaN(minPrice)) {
    query['priceRange.max'] = { $gte: Number(minPrice) };
  }
  if (maxPrice !== undefined && maxPrice !== null && !isNaN(maxPrice)) {
    if (query['priceRange.max']) {
      query['priceRange.min'] = { $lte: Number(maxPrice) };
    } else {
      query['priceRange.min'] = { $lte: Number(maxPrice) };
    }
  }
  return query;
};
module.exports = {
  calculateRestaurantPriceRange,
  updateRestaurantPriceRange,
  updateAllRestaurantPriceRanges,
  getPriceRangeQuery
};
