/**
 * priceCalculator.js
 * 
 * Pricing rules (India, pure-veg app):
 * ─────────────────────────────────────
 * 1. Item total      = sum of (basePrice + variation.price + addOns.price) × qty
 * 2. Restaurant disc = per-item restaurant discount applied before GST
 * 3. GST             = per-item GST% (0/5/12/18) applied on discounted food price
 * 4. Packaging       = sum of product.packagingCharge × qty (not discountable)
 * 5. Platform fee    = global, admin-configurable (default ₹9)
 * 6. Delivery fee    = distance-based slab (admin-configurable):
 *                        0 – 5 km  → ₹3 / km
 *                        5 – 10 km → ₹4 / km
 *                        above 10  → ₹6 / km
 *    (Free delivery override from restaurant.isFreeDelivery)
 * 7. Coupon discount = platform-only (delivery + platform components)
 * 8. Tip             = customer-chosen tip
 */

const Promocode = require('../models/Promocode');
const Restaurant = require('../models/Restaurant');
const Order = require('../models/Order');
const AdminSetting = require('../models/AdminSetting');
const Product = require('../models/Product');
const { calculateSettlementBreakdown } = require('./settlementCalculator');
const { logger } = require('../utils/logger');

// ─── Helpers ─────────────────────────────────────────────────────────────────

const MONEY_SCALE = 5;

function round(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return 0;
  return Number(numeric.toFixed(MONEY_SCALE));
}

function toNonNegativeNumber(value, fallback = 0) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return fallback;
  return Math.max(0, numeric);
}

function toNullableNumber(value) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}

function nearlyEqual(a, b, tolerance = 0.00002) {
  return Math.abs(round(a) - round(b)) <= tolerance;
}

function getVariationPrice(variation) {
  return round(toNonNegativeNumber(variation?.price, 0));
}

function getAddOnPrice(addOns) {
  if (!Array.isArray(addOns) || addOns.length === 0) {
    return 0;
  }

  return round(addOns.reduce((sum, addOn) => sum + toNonNegativeNumber(addOn?.price, 0), 0));
}

function normalizePricingItem({ item, product, adminSettings }) {
  const quantity = Math.max(1, Math.trunc(toNonNegativeNumber(item?.quantity, 1)) || 1);
  const variationPrice = getVariationPrice(item?.variation);
  const addonPrice = getAddOnPrice(item?.addOns);
  const explicitUnitPrice = toNullableNumber(item?.price);
  const explicitBasePrice = toNullableNumber(item?.basePrice);
  const productBasePrice = toNullableNumber(product?.basePrice);

  let basePrice = 0;
  let unitPrice = 0;

  if (item?.priceIncludesComponents === false) {
    basePrice = round(Math.max(0, explicitUnitPrice ?? explicitBasePrice ?? productBasePrice ?? 0));
    unitPrice = round(basePrice + variationPrice + addonPrice);
  } else if (explicitUnitPrice !== null) {
    unitPrice = round(Math.max(0, explicitUnitPrice));

    if (explicitBasePrice !== null) {
      basePrice = round(Math.max(0, explicitBasePrice));
    } else if (productBasePrice !== null && nearlyEqual(unitPrice, productBasePrice + variationPrice + addonPrice, 0.05)) {
      basePrice = round(Math.max(0, productBasePrice));
    } else {
      basePrice = round(Math.max(0, unitPrice - variationPrice - addonPrice));
    }
  } else {
    basePrice = round(Math.max(0, explicitBasePrice ?? productBasePrice ?? 0));
    unitPrice = round(basePrice + variationPrice + addonPrice);
  }

  const lineTotal = round(unitPrice * quantity);

  const restaurantDiscountConfig = product?.restaurantDiscount || {};
  const discountActive =
    Boolean(restaurantDiscountConfig?.active)
    && Number(restaurantDiscountConfig?.value || 0) > 0;
  const discountType = restaurantDiscountConfig?.type === 'flat' ? 'flat' : 'percent';
  const rawDiscountValue = toNonNegativeNumber(restaurantDiscountConfig?.value, 0);
  let restaurantDiscountAmount = 0;

  if (discountActive) {
    if (discountType === 'percent') {
      restaurantDiscountAmount = round(lineTotal * (Math.min(100, rawDiscountValue) / 100));
    } else {
      restaurantDiscountAmount = round(rawDiscountValue * quantity);
    }
  }

  restaurantDiscountAmount = round(Math.min(lineTotal, Math.max(0, restaurantDiscountAmount)));
  const priceAfterDiscount = round(Math.max(0, lineTotal - restaurantDiscountAmount));
  const restaurantDiscountPercent = lineTotal > 0
    ? round((restaurantDiscountAmount / lineTotal) * 100)
    : 0;

  const gstPercent = toNonNegativeNumber(
    typeof item?.gstPercent === 'number' ? item.gstPercent : product?.gstPercent,
    adminSettings.defaultGstPercent,
  );
  const itemGstAmount = round(priceAfterDiscount * (gstPercent / 100));
  const cgst = round(itemGstAmount / 2);
  const sgst = round(itemGstAmount - cgst);

  const unitPackagingCharge = round(
    toNonNegativeNumber(item?.packagingCharge, toNonNegativeNumber(product?.packagingCharge, 0)),
  );
  const packagingGstPercent = toNonNegativeNumber(
    typeof item?.packagingGstPercent === 'number' ? item.packagingGstPercent : product?.packagingGstPercent,
    0,
  );
  const packagingTotal = round(unitPackagingCharge * quantity);
  const packagingGstAmount = round(packagingTotal * (packagingGstPercent / 100));

  const commissionPercent = toNonNegativeNumber(
    typeof item?.adminCommissionPercent === 'number' ? item.adminCommissionPercent : product?.adminCommissionPercent,
    adminSettings?.payoutConfig?.defaultRestaurantCommissionPercent ?? 0,
  );
  const adminCommissionAmount = round(priceAfterDiscount * (commissionPercent / 100));
  const adminCommissionGstPercent = toNonNegativeNumber(adminSettings?.adminCommissionGstPercent, 18);
  const adminCommissionGstAmount = round(adminCommissionAmount * (adminCommissionGstPercent / 100));
  const restaurantNetEarningAmount = round(
    Math.max(0, priceAfterDiscount + packagingTotal - adminCommissionAmount - adminCommissionGstAmount),
  );

  return {
    productId: item?.product ? String(item.product) : null,
    quantity,
    basePrice,
    variationPrice,
    addonPrice,
    unitPrice,
    originalPrice: lineTotal,
    lineTotal,
    restaurantDiscountPercent,
    restaurantDiscountAmount,
    priceAfterDiscount,
    gstOnDiscountedPrice: itemGstAmount,
    gstPercent,
    itemGstAmount,
    cgst,
    sgst,
    unitPackagingCharge,
    packagingTotal,
    packagingGstPercent,
    packagingGstAmount,
    commissionPercent,
    adminCommissionAmount,
    adminCommissionGstAmount,
    restaurantNetEarningAmount,
  };
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
    deliveryChargeGstPercent: settings?.deliveryChargeGstPercent ?? 18,
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

    const productIds = Array.isArray(items)
      ? items.map((item) => item?.product).filter(Boolean)
      : [];
    const products = productIds.length > 0
      ? await Product.find({ _id: { $in: productIds } })
          .select('_id basePrice gstPercent packagingCharge packagingGstPercent adminCommissionPercent restaurantDiscount')
          .lean()
      : [];
    const productMap = new Map(products.map((product) => [String(product._id), product]));
    const normalizedItems = (Array.isArray(items) ? items : []).map((item) =>
      normalizePricingItem({
        item,
        product: item?.product ? productMap.get(String(item.product)) : null,
        adminSettings,
      }),
    );

    // 1. Item total + GST
    const itemTotal = round(normalizedItems.reduce((sum, item) => sum + item.lineTotal, 0));
    const restaurantDiscountTotal = round(normalizedItems.reduce((sum, item) => sum + item.restaurantDiscountAmount, 0));
    const priceAfterRestaurantDiscount = round(normalizedItems.reduce((sum, item) => sum + item.priceAfterDiscount, 0));
    const gstTotal = round(normalizedItems.reduce((sum, item) => sum + item.itemGstAmount, 0));

    // 2. Packaging charge (per product × quantity)
    const packaging = round(normalizedItems.reduce((sum, item) => sum + item.packagingTotal, 0));
    const packagingGstTotal = round(normalizedItems.reduce((sum, item) => sum + item.packagingGstAmount, 0));

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
    const couponResult = await validateAndApplyCoupon({
      couponCode,
      itemTotal,
      restaurantId,
      userId,
      discountBase: round(deliveryFee + platformFee),
    });
    const discount = round(couponResult.discount);
    const safeDeliveryFee = resolveDeliveryFee({
      distanceKm: deliveryDistance,
      slabs: adminSettings.deliverySlabs,
      restaurant,
      itemTotal,
      couponResult,
    });

    // 6. Canonical restaurant billing + platform settlement breakdown
    const effectiveFoodGstPercent = priceAfterRestaurantDiscount > 0
      ? round((gstTotal / priceAfterRestaurantDiscount) * 100)
      : adminSettings.defaultGstPercent;
    const packagingGstPercent = packaging > 0 ? round((packagingGstTotal / packaging) * 100) : 0;
    const discountGstPercent = adminSettings.defaultGstPercent;
    const estimatedAdminCommission = round(normalizedItems.reduce((sum, item) => sum + item.adminCommissionAmount, 0));
    const settlement = calculateSettlementBreakdown({
      itemTotal,
      restaurantDiscount: restaurantDiscountTotal,
      foodGstPercent: effectiveFoodGstPercent,
      packagingCharge: packaging,
      packagingGstPercent,
      foodierDiscount: discount,
      discountGstPercent,
      // Pass platform and delivery components; settlement applies separated GST.
      deliveryFee: safeDeliveryFee,
      platformFee,
      deliveryChargeGstPercent: adminSettings.deliveryChargeGstPercent,
      platformGstPercent: adminSettings.platformFeeGstPercent,
      adminCommissionAmount: estimatedAdminCommission,
      adminCommissionGstPercent: adminSettings.adminCommissionGstPercent,
    });

    const gstTotalForOrder = round(settlement.gstOnFood + settlement.packagingGST + settlement.deliveryGST + settlement.platformGST);

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
        deliveryDistanceKm: round(deliveryDistance),
        itemTotal: settlement.itemTotal,
        restaurantDiscount: settlement.restaurantDiscount,
        priceAfterRestaurantDiscount: settlement.priceAfterRestaurantDiscount,
        gstOnFood: settlement.gstOnFood,
        gst: gstTotalForOrder,
        tax: gstTotalForOrder,
        packaging,
        packagingGST: settlement.packagingGST,
        restaurantBillTotal: settlement.restaurantBillTotal,
        deliveryFee: safeDeliveryFee,
        deliveryGST: settlement.deliveryGST,
        cgstDelivery: settlement.cgstDelivery,
        sgstDelivery: settlement.sgstDelivery,
        platformFee,
        smallCartFee,
        discount,
        couponCode: couponCode || null,
        couponDiscountAmount: round(discount),
        foodierDiscount: settlement.foodierDiscount,
        deliveryDiscountUsed: round(settlement.deliveryDiscountUsed || 0),
        platformDiscountSplit: round(settlement.platformDiscountSplit || 0),
        deliveryFeeAfterDiscount: settlement.deliveryFeeAfterDiscount ?? safeDeliveryFee,
        platformFeeAfterDiscount: settlement.platformFeeAfterDiscount ?? platformFee,
        adminDeliverySubsidy: round(settlement.adminDeliverySubsidy || 0),
        gstOnDiscount: settlement.gstOnDiscount,
        finalPayableToRestaurant: settlement.finalPayableToRestaurant,
        paymentBreakdown: settlement,
        itemsDetailed: normalizedItems,
        tip: round(tip),
        totalAmount,
        walletDeduction,
        amountToPay,
        // Legacy fields kept for backward compatibility
        taxRate: null,
        surgeFee: 0,
        surgeMultiplier: 1,
        subtotal: round(settlement.restaurantBillTotal + settlement.platformBillBeforeDiscount),
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

async function validateAndApplyCoupon({ couponCode, itemTotal, restaurantId, userId, discountBase = 0 }) {
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

  const eligibleDiscountBase = round(Math.max(0, discountBase));
  let discount = 0;
  let freeDelivery = false;
  if (promo.offerType === 'percent') {
    discount = (eligibleDiscountBase * promo.discountValue) / 100;
    if (promo.maxDiscountAmount > 0) discount = Math.min(discount, promo.maxDiscountAmount);
  } else if (promo.offerType === 'flat' || promo.offerType === 'amount') {
    discount = promo.discountValue;
  } else if (promo.offerType === 'free_delivery') {
    freeDelivery = true;
  }
  discount = Math.min(discount, eligibleDiscountBase);
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
