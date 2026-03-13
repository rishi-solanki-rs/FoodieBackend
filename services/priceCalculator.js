/**
 * priceCalculator.js
 * 
 * Pricing rules (India, pure-veg app):
 * ─────────────────────────────────────
 * 1. Item total      = sum of (basePrice + variation.price + addOns.price) × qty
 * 2. GST             = per-item GST% (0/5/12/18) applied on the full line total (base + variation + add-ons)
 * 3. Packaging       = restaurant.packagingCharge (set per restaurant)
 * 4. Platform fee    = global, admin-configurable (default ₹9)
 * 5. Delivery fee    = distance-based slab (admin-configurable):
 *                        0 – 5 km  → ₹3 / km
 *                        5 – 10 km → ₹4 / km
 *                        above 10  → ₹6 / km
 *    (Free delivery override from restaurant.isFreeDelivery)
 * 6. Discount        = coupon applied on subtotal
 * 7. Tip             = customer-chosen tip
 */

const Promocode = require('../models/Promocode');
const Restaurant = require('../models/Restaurant');
const Order = require('../models/Order');
const AdminSetting = require('../models/AdminSetting');
const { calculateSettlementBreakdown } = require('./settlementCalculator');
const { logger } = require('../utils/logger');

// ─── Helpers ─────────────────────────────────────────────────────────────────

function round(value) {
  return Math.round((Number(value) || 0) * 100) / 100;
}

function toNonNegativeNumber(value, fallback = 0) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return fallback;
  return Math.max(0, numeric);
}

/**
 * Get the active AdminSetting document (singleton).
 * Falls back to safe defaults so the server never crashes if the doc is missing.
 */
async function getAdminSettings() {
  const settings = await AdminSetting.findOne().lean();
  return {
    defaultGstPercent: settings?.defaultGstPercent ?? 5,
    platformFee: settings?.platformFee ?? 9,
    platformFeeGstPercent: settings?.platformFeeGstPercent ?? 18,
    adminCommissionGstPercent: settings?.adminCommissionGstPercent ?? 18,
    smallCartThreshold: settings?.smallCartThreshold ?? 0,
    smallCartFee: settings?.smallCartFee ?? 0,
    deliverySlabs: {
      baseDeliveryFee: settings?.deliverySlabs?.baseDeliveryFee ?? 0,
      firstSlabMaxKm: settings?.deliverySlabs?.firstSlabMaxKm ?? 5,
      firstSlabRatePerKm: settings?.deliverySlabs?.firstSlabRatePerKm ?? 3,
      secondSlabMaxKm: settings?.deliverySlabs?.secondSlabMaxKm ?? 10,
      secondSlabRatePerKm: settings?.deliverySlabs?.secondSlabRatePerKm ?? 4,
      thirdSlabRatePerKm: settings?.deliverySlabs?.thirdSlabRatePerKm ?? 6,
    },
    payoutConfig: {
      defaultRestaurantCommissionPercent: settings?.payoutConfig?.defaultRestaurantCommissionPercent ?? 10,
      riderBaseEarningPerDelivery: settings?.payoutConfig?.riderBaseEarningPerDelivery ?? 30,
      riderPerKmRate: settings?.payoutConfig?.riderPerKmRate ?? 5,
      riderBaseDistanceKm: settings?.payoutConfig?.riderBaseDistanceKm ?? 3,
    },
  };
}

/**
 * computeDeliveryFee
 * Calculates delivery fee using distance slabs read from AdminSetting.
 *
 * @param {number} distanceKm  - distance between restaurant and customer in km
 * @param {object} slabs       - deliverySlabs from AdminSetting
 * @returns {number}           - delivery fee in ₹
 */
function computeDeliveryFee(distanceKm, slabs) {
  const safeDistanceKm = toNonNegativeNumber(distanceKm, 0);
  if (safeDistanceKm <= 0) return 0;

  const firstSlabMaxKm = toNonNegativeNumber(slabs?.firstSlabMaxKm, 5);
  const firstSlabRatePerKm = toNonNegativeNumber(slabs?.firstSlabRatePerKm, 3);
  const secondSlabMaxKm = Math.max(firstSlabMaxKm, toNonNegativeNumber(slabs?.secondSlabMaxKm, 10));
  const secondSlabRatePerKm = toNonNegativeNumber(slabs?.secondSlabRatePerKm, 4);
  const thirdSlabRatePerKm = toNonNegativeNumber(slabs?.thirdSlabRatePerKm, 6);
  const baseDeliveryFee = toNonNegativeNumber(slabs?.baseDeliveryFee, 0);

  let fee = baseDeliveryFee;

  if (safeDistanceKm <= firstSlabMaxKm) {
    // Entirely in first slab
    fee += safeDistanceKm * firstSlabRatePerKm;
  } else if (safeDistanceKm <= secondSlabMaxKm) {
    // First slab fully consumed + remainder in second slab
    fee += (firstSlabMaxKm * firstSlabRatePerKm)
      + ((safeDistanceKm - firstSlabMaxKm) * secondSlabRatePerKm);
  } else {
    // All three slabs
    fee += (firstSlabMaxKm * firstSlabRatePerKm)
      + ((secondSlabMaxKm - firstSlabMaxKm) * secondSlabRatePerKm)
      + ((safeDistanceKm - secondSlabMaxKm) * thirdSlabRatePerKm);
  }

  return round(fee);
}

function shouldApplyFreeDelivery({ restaurant, itemTotal, couponResult }) {
  if (couponResult?.freeDelivery) return true;
  if (!restaurant?.isFreeDelivery) return false;
  const threshold = toNonNegativeNumber(restaurant?.freeDeliveryContribution, 0);
  return Number(itemTotal || 0) >= threshold;
}

function resolveDeliveryFee({ distanceKm, slabs, restaurant, itemTotal, couponResult }) {
  if (shouldApplyFreeDelivery({ restaurant, itemTotal, couponResult })) {
    return 0;
  }

  const deliveryFee = computeDeliveryFee(distanceKm, slabs);
  if ((Number(distanceKm) || 0) > 0 && deliveryFee <= 0) {
    logger.error('Delivery fee evaluated to zero for positive delivery distance', {
      event: 'DELIVERY_FEE_ZERO_GUARD',
      distanceKm: Number(distanceKm || 0),
      deliveryFee,
      slabs,
      restaurantId: restaurant?._id ? String(restaurant._id) : null,
      itemTotal: Number(itemTotal || 0),
      freeDeliveryApplied: false,
    });
  }

  return round(Math.max(0, deliveryFee));
}

// ─── Main calculator ─────────────────────────────────────────────────────────

/**
 * calculateOrderPrice
 *
 * @param {object} params
 * @param {Array}  params.items            - cart items: { price, gstPercent, quantity, variation, addOns }
 * @param {string} params.restaurantId
 * @param {string} [params.userId]
 * @param {string} [params.couponCode]
 * @param {number} [params.deliveryDistance] - km between restaurant & customer
 * @param {number} [params.tip]
 * @param {boolean}[params.useWallet]
 * @param {number} [params.walletBalance]
 */
async function calculateOrderPrice({
  items,
  restaurantId,
  userId = null,
  couponCode = null,
  deliveryDistance = 0,
  tip = 0,
  useWallet = false,
  walletBalance = 0,
}) {
  try {
    const restaurant = await Restaurant.findById(restaurantId);
    if (!restaurant) throw new Error('Restaurant not found');

    const adminSettings = await getAdminSettings();

    // 1. Item total + GST
    let itemTotal = 0;
    let gstTotal = 0;

    for (const item of items) {
      let unitPrice = item.price || 0;

      if (item.variation?.price) {
        unitPrice += item.variation.price;
      }
      if (Array.isArray(item.addOns)) {
        unitPrice += item.addOns.reduce((s, a) => s + (a.price || 0), 0);
      }

      const qty = item.quantity || 1;
      const lineTotal = unitPrice * qty;
      itemTotal += lineTotal;

      // GST on full line total (base + variation + add-ons) — uses product's slab, falls back to admin default
      const gstPercent = typeof item.gstPercent === 'number' ? item.gstPercent : adminSettings.defaultGstPercent;
      gstTotal += lineTotal * (gstPercent / 100);
    }

    itemTotal = round(itemTotal);
    gstTotal = round(gstTotal);

    // 2. Packaging charge (per restaurant)
    const packaging = round(restaurant.packagingCharge || 0);

    // 3. Delivery fee (distance slabs from AdminSetting)
    const deliveryFee = resolveDeliveryFee({
      distanceKm: deliveryDistance,
      slabs: adminSettings.deliverySlabs,
      restaurant,
      itemTotal,
      couponResult: null,
    });

    // 4. Platform fee (global, from AdminSetting)
    const platformFee = round(adminSettings.platformFee);

    // Small cart surcharge (admin-configured threshold & fee)
    const smallCartFee = (adminSettings.smallCartThreshold > 0 && itemTotal < adminSettings.smallCartThreshold)
      ? round(adminSettings.smallCartFee)
      : 0;

    // 5. Coupon / discount
    const couponResult = await validateAndApplyCoupon({ couponCode, itemTotal, restaurantId, userId, deliveryFee });
    const discount = round(couponResult.discount);
    const safeDeliveryFee = resolveDeliveryFee({
      distanceKm: deliveryDistance,
      slabs: adminSettings.deliverySlabs,
      restaurant,
      itemTotal,
      couponResult,
    });

    // 6. Canonical restaurant billing + platform settlement breakdown
    const effectiveFoodGstPercent = itemTotal > 0 ? round((gstTotal / itemTotal) * 100) : adminSettings.defaultGstPercent;
    const packagingGstPercent = adminSettings.defaultGstPercent;
    const discountGstPercent = adminSettings.defaultGstPercent;
    const estimatedCommissionPercent = Number(restaurant.adminCommission ?? adminSettings?.payoutConfig?.defaultRestaurantCommissionPercent ?? 0);
    const estimatedAdminCommission = round(itemTotal * (Math.max(0, estimatedCommissionPercent) / 100));
    const settlement = calculateSettlementBreakdown({
      itemTotal,
      restaurantDiscount: 0,
      foodGstPercent: effectiveFoodGstPercent,
      packagingCharge: packaging,
      packagingGstPercent,
      foodierDiscount: discount,
      discountGstPercent,
      // Pass platform bill so settlement can apply platform-first discount distribution
      deliveryFee: safeDeliveryFee,
      platformFee,
      platformGstPercent: adminSettings.platformFeeGstPercent, // 18% GST on platform fee + delivery (service tax)
      adminCommissionAmount: estimatedAdminCommission,
      adminCommissionGstPercent: adminSettings.adminCommissionGstPercent,
    });

    const gstTotalForOrder = round(settlement.gstOnFood + settlement.packagingGST);

    // 7. Grand total = restaurant bill (post-discount) + platform bill (post-discount) + tip
    let totalAmount = settlement.finalPayableToRestaurant + settlement.platformBillTotal + smallCartFee + round(tip);
    totalAmount = round(Math.max(0, totalAmount));

    // 8. Wallet deduction
    let walletDeduction = 0;
    let amountToPay = totalAmount;
    if (useWallet && walletBalance > 0) {
      walletDeduction = round(Math.min(walletBalance, totalAmount));
      amountToPay = round(totalAmount - walletDeduction);
    }

    return {
      success: true,
      breakdown: {
        itemTotal: settlement.itemTotal,
        restaurantDiscount: settlement.restaurantDiscount,
        gstOnFood: settlement.gstOnFood,
        gst: gstTotalForOrder,
        tax: gstTotalForOrder,
        packaging,
        packagingGST: settlement.packagingGST,
        restaurantBillTotal: settlement.restaurantBillTotal,
        deliveryFee: safeDeliveryFee,
        platformFee,
        smallCartFee,
        discount,
        foodierDiscount: settlement.foodierDiscount,
        gstOnDiscount: settlement.gstOnDiscount,
        finalPayableToRestaurant: settlement.finalPayableToRestaurant,
        paymentBreakdown: settlement,
        tip: round(tip),
        totalAmount,
        walletDeduction,
        amountToPay,
        // Legacy fields kept for backward compatibility
        taxRate: null,
        surgeFee: 0,
        surgeMultiplier: 1,
        subtotal: round(settlement.restaurantBillTotal + safeDeliveryFee + platformFee),
      },
      coupon: {
        code: couponCode || null,
        applied: discount > 0 || couponResult.freeDelivery,
        error: couponResult.error,
        freeDelivery: couponResult.freeDelivery || false,
      },
    };
  } catch (error) {
    return { success: false, error: error.message, breakdown: null };
  }
}

// ─── Coupon validation (unchanged) ───────────────────────────────────────────

async function validateAndApplyCoupon({ couponCode, itemTotal, restaurantId, userId, deliveryFee }) {
  if (!couponCode) return { discount: 0, freeDelivery: false, error: null };

  const promo = await Promocode.findOne({ code: couponCode, status: 'active' });
  if (!promo) return { discount: 0, freeDelivery: false, error: 'Invalid coupon code' };

  const now = new Date();
  if (now < promo.availableFrom || now > promo.expiryDate) {
    return { discount: 0, freeDelivery: false, error: 'Coupon expired or not yet active' };
  }
  if (promo.restaurant && promo.restaurant.toString() !== restaurantId.toString()) {
    return { discount: 0, freeDelivery: false, error: 'Coupon not valid for this restaurant' };
  }
  if (itemTotal < (promo.minOrderValue || 0)) {
    const needed = promo.minOrderValue - itemTotal;
    return { discount: 0, freeDelivery: false, error: `Add items worth ₹${needed.toFixed(2)} more to use this coupon` };
  }
  if (promo.isTimeBound) {
    const currentDay = now.toLocaleString('en-US', { weekday: 'long' });
    const currentTime = `${now.getHours()}:${String(now.getMinutes()).padStart(2, '0')}`;
    if (promo.activeDays?.length > 0 && !promo.activeDays.includes(currentDay)) {
      return { discount: 0, freeDelivery: false, error: `Coupon valid only on ${promo.activeDays.join(', ')}` };
    }
    if (promo.timeSlots?.length > 0) {
      const isValidTime = promo.timeSlots.some(s => currentTime >= s.startTime && currentTime <= s.endTime);
      if (!isValidTime) return { discount: 0, freeDelivery: false, error: 'Coupon not valid at this time' };
    }
  }
  if (userId && promo.usageLimitPerUser > 0) {
    const usageCount = await Order.countDocuments({ customer: userId, couponCode: promo.code, status: { $ne: 'cancelled' } });
    if (usageCount >= promo.usageLimitPerUser) {
      return { discount: 0, freeDelivery: false, error: 'You have reached the usage limit for this coupon' };
    }
  }
  if (promo.usageLimitPerCoupon > 0 && promo.usedCount >= promo.usageLimitPerCoupon) {
    return { discount: 0, freeDelivery: false, error: 'Coupon usage limit reached' };
  }

  let discount = 0;
  let freeDelivery = false;
  if (promo.offerType === 'percent') {
    discount = (itemTotal * promo.discountValue) / 100;
    if (promo.maxDiscountAmount > 0) discount = Math.min(discount, promo.maxDiscountAmount);
  } else if (promo.offerType === 'flat' || promo.offerType === 'amount') {
    discount = promo.discountValue;
  } else if (promo.offerType === 'free_delivery') {
    freeDelivery = true;
  }
  discount = Math.min(discount, itemTotal);
  return { discount, freeDelivery, error: null };
}

// ─── Exports ─────────────────────────────────────────────────────────────────

async function recalculateOrderPrice(order) {
  return calculateOrderPrice({
    items: order.items,
    restaurantId: order.restaurant,
    userId: order.customer,
    couponCode: order.couponCode,
    tip: order.tip || 0,
  });
}

module.exports = {
  calculateOrderPrice,
  computeDeliveryFee,
  resolveDeliveryFee,
  validateAndApplyCoupon,
  recalculateOrderPrice,
  getAdminSettings,
};
