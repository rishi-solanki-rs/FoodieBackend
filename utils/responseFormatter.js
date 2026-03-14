
const normalizeRatingOutput = (rating) => {
  if (rating && typeof rating === "object") return rating;
  const average = typeof rating === "number" ? rating : 0;
  return {
    average,
    count: 0,
    breakdown: { five: 0, four: 0, three: 0, two: 0, one: 0 },
    lastRatedAt: null,
  };
};
const getRatingCount = (rating) => {
  if (rating && typeof rating === "object" && typeof rating.count === "number") {
    return rating.count;
  }
  return 0;
};
exports.formatRestaurantForUser = (restaurant) => {
  if (!restaurant) return null;
  return {
    _id: restaurant._id,
    name: restaurant.name,
    description: restaurant.description,
    restaurantType: restaurant.restaurantType,
    image: restaurant.image,
    bannerImage: restaurant.bannerImage,
    restaurantImages: restaurant.restaurantImages || [],
    cuisine: restaurant.cuisine || [],
    rating: normalizeRatingOutput(restaurant.rating),
    ratingCount: getRatingCount(restaurant.rating),
    address: restaurant.address,
    city: restaurant.city,
    area: restaurant.area,
    deliveryTime: restaurant.deliveryTime,
    deliveryType: restaurant.deliveryType || [],
    isFreeDelivery: restaurant.isFreeDelivery,
    minOrderValue: restaurant.minOrderValue || 0,
    estimatedPreparationTime: restaurant.estimatedPreparationTime || 15,
    isActive: restaurant.isActive,
    isTemporarilyClosed: restaurant.isTemporarilyClosed || false,
    menuApproved: restaurant.menuApproved || false,
    verificationStatus: restaurant.verificationStatus || 'pending',
    timing: restaurant.timing,
  };
};
exports.formatRestaurantForList = (restaurant) => {
  if (!restaurant) return null;
  const formatted = exports.formatRestaurantForUser(restaurant);
  return formatted;
};
exports.formatRestaurantForAdmin = (restaurant) => {
  if (!restaurant) return null;
  return {
    _id: restaurant._id,
    name: restaurant.name,
    description: restaurant.description,
    restaurantType: restaurant.restaurantType,
    image: restaurant.image,
    bannerImage: restaurant.bannerImage,
    restaurantImages: restaurant.restaurantImages || [],
    cuisine: restaurant.cuisine || [],
    brand: restaurant.brand,
    owner: restaurant.owner,
    rating: normalizeRatingOutput(restaurant.rating),
    address: restaurant.address,
    city: restaurant.city,
    area: restaurant.area,
    email: restaurant.email,
    contactNumber: restaurant.contactNumber,
    deliveryTime: restaurant.deliveryTime,
    deliveryType: restaurant.deliveryType || [],
    paymentMethods: restaurant.paymentMethods,
    isActive: restaurant.isActive,
    restaurantApproved: restaurant.restaurantApproved,
    menuApproved: restaurant.menuApproved,
    isTemporarilyClosed: restaurant.isTemporarilyClosed || false,
    packagingCharge: restaurant.packagingCharge,
    adminCommission: restaurant.adminCommission,
    isFreeDelivery: restaurant.isFreeDelivery,
    freeDeliveryContribution: restaurant.freeDeliveryContribution,
    minOrderValue: restaurant.minOrderValue || 0,
    geofenceRadius: restaurant.geofenceRadius,
    deliveringZones: restaurant.deliveringZones || [],
    location: restaurant.location,
    estimatedPreparationTime: restaurant.estimatedPreparationTime || 15,
    timing: restaurant.timing,
    documents: restaurant.documents,
    verificationStatus: restaurant.verificationStatus,
    bankDetails: restaurant.bankDetails,
    taxConfig: restaurant.taxConfig,
    totalOrders: restaurant.totalOrders || 0,
    totalEarnings: restaurant.totalEarnings || 0,
    totalDeliveries: restaurant.totalDeliveries || 0,
    successfulOrders: restaurant.successfulOrders || 0,
    averageOrderValue: restaurant.averageOrderValue || 0,
    createdAt: restaurant.createdAt,
    updatedAt: restaurant.updatedAt,
  };
};
exports.formatProductForUser = (product) => {
  if (!product) return null;

  const rd = product.restaurantDiscount;
  const isDiscountActive = (discount) => {
    if (!discount) return false;
    const value = Number(discount.value || 0);
    if (!Number.isFinite(value) || value <= 0) return false;

    // Legacy records may not have `active`; treat value > 0 as active by default.
    if (discount.active === undefined || discount.active === null) return true;
    return discount.active === true || discount.active === 'true';
  };

  const rdActive = isDiscountActive(rd);
  const rdVal = rdActive ? Number(rd.value) : 0;

  const finalDiscount = rdActive ? rdVal : 0;
  const finalDiscountType = rdActive ? (rd.type || 'percent') : 'percent';

  const discountTag = finalDiscount > 0
    ? (finalDiscountType === 'percent' ? `${finalDiscount}% OFF` : `₹${finalDiscount} OFF`)
    : null;

  return {
    _id: product._id,
    name: product.name,
    description: product.description,
    image: product.image,
    basePrice: product.basePrice,
    unit: product.unit || "piece",
    isVeg: product.isVeg,
    available: product.available,
    variations: product.variations || [],
    addOns: product.addOns || [],
    seasonal: product.seasonal || false,
    seasonTag: product.seasonTag,
    restaurantDiscount: rdActive ? { type: rd.type, value: rdVal } : null,
    finalDiscount,
    finalDiscountType,
    discountTag,
  };
};
exports.formatOrderForCustomer = (order) => {
  if (!order) return null;
  return {
    _id: order._id,
    status: order.status,
    restaurant: order.restaurant,
    items: order.items,
    totalAmount: order.totalAmount,
    itemTotal: order.itemTotal,
    tax: order.tax,
    deliveryFee: order.deliveryFee,
    discount: order.discount,
    tip: order.tip,
    paymentMethod: order.paymentMethod,
    paymentStatus: order.paymentStatus,
    deliveryAddress: order.deliveryAddress,
    estimatedDeliveryTime: order.estimatedDeliveryTime,
    createdAt: order.createdAt,
    timeline: order.timeline,
    rider: order.rider,
    isRated: order.isRated,
  };
};
exports.formatWalletTransaction = (transaction) => {
  if (!transaction) return null;
  return {
    _id: transaction._id,
    amount: transaction.amount,
    type: transaction.type,
    description: transaction.description,
    orderId: transaction.orderId,
    createdAt: transaction.createdAt,
  };
};
exports.formatRiderForAdmin = (rider) => {
  if (!rider) return null;
  return {
    _id: rider._id,
    user: rider.user,
    rating: rider.rating,
    address: rider.address,
    workCity: rider.workCity,
    workZone: rider.workZone,
    vehicle: rider.vehicle,
    documents: rider.documents,
    bankDetails: rider.bankDetails,
    isOnline: rider.isOnline,
    isAvailable: rider.isAvailable,
    breakMode: rider.breakMode,
    verificationStatus: rider.verificationStatus,
    riderVerified: rider.riderVerified,
    totalEarnings: rider.totalEarnings,
    currentBalance: rider.currentBalance,
    totalOrders: rider.totalOrders,
    totalDeliveries: rider.totalDeliveries,
    createdAt: rider.createdAt,
    updatedAt: rider.updatedAt,
  };
};
exports.formatCityForUser = (city) => {
  if (!city) return null;
  return {
    _id: city._id,
    name: city.name,
    zones: (city.zones || []).map((zone) => ({
      _id: zone._id,
      name: zone.name,
      polygon: zone.polygon,
    })),
  };
};
module.exports = {
  formatRestaurantForUser: exports.formatRestaurantForUser,
  formatRestaurantForList: exports.formatRestaurantForList,
  formatRestaurantForAdmin: exports.formatRestaurantForAdmin,
  formatProductForUser: exports.formatProductForUser,
  formatOrderForCustomer: exports.formatOrderForCustomer,
  formatWalletTransaction: exports.formatWalletTransaction,
  formatRiderForAdmin: exports.formatRiderForAdmin,
  formatCityForUser: exports.formatCityForUser,
};
