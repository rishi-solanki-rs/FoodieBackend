const Order = require("../models/Order");
const Product = require("../models/Product");
const Restaurant = require("../models/Restaurant");
const Rider = require("../models/Rider");
const Cart = require("../models/Cart");
const User = require("../models/User");
const WalletTransaction = require("../models/WalletTransaction");
const Promocode = require("../models/Promocode");
const Review = require("../models/Review"); // New
const AdminSetting = require("../models/AdminSetting"); // Added
const mongoose = require("mongoose");
const { sendNotification } = require("../utils/notificationService");
const { sendOTP } = require("../services/smsService");
const { getPaginationParams } = require("../utils/pagination");
const socketService = require("../services/socketService");
const { formatRestaurantForUser, formatOrderForCustomer } = require("../utils/responseFormatter");
const {
  validateOrderState,
  validateRestaurantAcceptance,
  validateRestaurantMarkReady,
  validateRiderAcceptance,
  validateRiderPickup,
  validateRiderDelivery,
  canBeCancelled,
} = require("../utils/orderStateValidator");
const { calculateOrderPrice } = require("../services/priceCalculator");
const { calculateSettlementBreakdown } = require('../services/settlementCalculator');
const { validateOrderFinancialIntegrity } = require('../services/financialIntegrityService');
const { processSettlement } = require('../services/settlementService');
const { computeDeliveryFee, getAdminSettings } = require('../services/priceCalculator');
const {
  logger,
  logOrderTransition,
  logPayment,
  logRefund,
  logRiderAssignment,
  logOTP,
  logRestaurantAction,
  logWalletTransaction,
  logCouponUsage,
} = require("../utils/logger");
const sendError = (res, status, message, details) => {
  return res.status(status).json({
    success: false,
    message,
    ...(details ? { details } : {}),
  });
};
const isValidObjectId = (id) => mongoose.Types.ObjectId.isValid(id);
const buildRatingStats = (ratings) => {
  const normalized = ratings.filter((value) => typeof value === "number");
  const count = normalized.length;
  if (count === 0) {
    return {
      average: 0,
      count: 0,
      breakdown: { five: 0, four: 0, three: 0, two: 0, one: 0 },
      lastRatedAt: null,
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
      one: normalized.filter((value) => value === 1).length,
    },
    lastRatedAt: new Date(),
  };
};
const getAverageRating = (rating) => {
  if (typeof rating === "number") return rating;
  if (rating && typeof rating === "object" && typeof rating.average === "number") {
    return rating.average;
  }
  return 0;
};
const getRatingCount = (rating) => {
  if (rating && typeof rating === "object" && typeof rating.count === "number") {
    return rating.count;
  }
  return 0;
};
const normalizeTip = (value) => {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric < 0) return 0;
  return Number(numeric.toFixed(5));
};

const toMoney = (value) => {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return 0;
  return Number(numeric.toFixed(5));
};
const calculateBill = async (
  cart,
  userId = null,
  deliveryDistanceKm = 0,
) => {
  try {
    const safeItems = Array.isArray(cart?.items)
      ? cart.items.filter((item) => item && item.restaurant)
      : [];
    if (!cart || safeItems.length === 0) {
      throw new Error("Cart is empty");
    }
    if (!cart.restaurant) {
      throw new Error("No restaurant in cart");
    }
    const restaurantId = cart.restaurant;
    const restaurantItems = safeItems;
    if (restaurantItems.length === 0) {
      throw new Error("No items found for this restaurant");
    }
    const restaurant = await Restaurant.findById(restaurantId);
    if (!restaurant) {
      throw new Error(`Restaurant not found: ${restaurantId}`);
    }
    const tip = normalizeTip(cart?.tip);
    const pricingResult = await calculateOrderPrice({
      items: restaurantItems.map((item) => ({
        product: item.product,
        price: item.price,
        quantity: item.quantity,
        gstPercent: item.gstPercent,
        variation: item.variation || null,
        addOns: item.addOns || [],
      })),
      restaurantId,
      userId,
      couponCode: cart.couponCode || null,
      deliveryDistance: deliveryDistanceKm,
      tip
    });
    if (!pricingResult.success) {
      throw new Error(pricingResult.error || "Price calculation failed");
    }
    const breakdown = pricingResult.breakdown;
    const coupon = pricingResult.coupon;
    return {
      itemTotal: breakdown.itemTotal,
      restaurantDiscount: breakdown.restaurantDiscount || 0,
      priceAfterRestaurantDiscount: breakdown.priceAfterRestaurantDiscount || Math.max(0, (breakdown.itemTotal || 0) - (breakdown.restaurantDiscount || 0)),
      gstOnFood: breakdown.gstOnFood || 0,
      tax: breakdown.tax,
      packaging: breakdown.packaging,
      packagingGST: breakdown.packagingGST || 0,
      restaurantBillTotal: breakdown.restaurantBillTotal || 0,
      deliveryFee: breakdown.deliveryFee,
      platformFee: breakdown.platformFee,
      smallCartFee: breakdown.smallCartFee,
      surgeFee: breakdown.surgeFee,
      surgeMultiplier: breakdown.surgeMultiplier,
      discount: breakdown.discount,
      foodierDiscount: breakdown.foodierDiscount || breakdown.discount || 0,
      gstOnDiscount: breakdown.gstOnDiscount || 0,
      finalPayableToRestaurant: breakdown.finalPayableToRestaurant || 0,
      paymentBreakdown: breakdown.paymentBreakdown || null,
      itemDetails: breakdown.itemsDetailed || [],
      toPay: breakdown.totalAmount,
      totalBeforeTip: Math.max(0, breakdown.totalAmount - breakdown.tip),
      tip: breakdown.tip,
      appliedCoupon: coupon.applied ? coupon.code : null,
      couponError: coupon.error || null,
      breakdown: {
        items: breakdown.itemTotal,
        fees: breakdown.tax + breakdown.packaging + breakdown.platformFee,
        delivery: breakdown.deliveryFee,
        smallCart: breakdown.smallCartFee,
        surge: breakdown.surgeFee,
        total: breakdown.totalAmount,
      },
      restaurantId: restaurantId
    };
  } catch (error) {
    logger.error("Calculate bill error", {
      error: error.message,
      cartId: cart?._id,
      userId,
    });
    throw error;
  }
};
module.exports.calculateBill = calculateBill;
exports.placeOrder = async (req, res) => {
  let walletDeducted = false;
  let walletDeductedAmount = 0;
  try {
    const { addressId, paymentMethod, paymentId } = req.body;
    if (!req.user || !isValidObjectId(req.user._id)) {
      return sendError(res, 401, "Unauthorized");
    }
    if (!addressId || typeof addressId !== "string") {
      return sendError(res, 400, "addressId is required");
    }
    if (!['wallet', 'online'].includes(paymentMethod)) {
      return sendError(res, 400, "Invalid paymentMethod. Only 'wallet' and 'online' (Razorpay) are accepted.");
    }
    const user = await User.findById(req.user._id);
    if (!user || user.isDeleted) {
      return sendError(res, 404, "User not found");
    }
    const cart = await Cart.findOne({ user: req.user._id });
    if (!cart || !cart.items || cart.items.length === 0) {
      return sendError(res, 400, "Cart is empty");
    }
    const restaurantId = cart.items[0].restaurant;
    const hasMixed = cart.items.some(item => item.restaurant.toString() !== restaurantId.toString());
    if (hasMixed) {
      return sendError(res, 400, "Cart data corruption: Contains mixed restaurants. Please clear cart.");
    }
    const deliveryAddress = user.savedAddresses.id(addressId);
    if (!deliveryAddress) {
      return sendError(res, 400, "Invalid Address ID");
    }
    const restaurant = await Restaurant.findById(restaurantId).populate('owner', 'name email mobile');
    if (!restaurant) {
      return sendError(res, 404, `Restaurant not found: ${restaurantId}`);
    }
    if (!restaurant.isActive) {
      return sendError(res, 400, `${restaurant.name} is currently not accepting orders`);
    }
    if (restaurant.isTemporarilyClosed) {
      return sendError(res, 400, `${restaurant.name} is temporarily closed`);
    }
    // Compute delivery distance so the bill uses the correct distance-based slab fee
    const { calculateDistance } = require('../utils/locationUtils');
    let deliveryDistanceKm = 0;
    if (
      restaurant.location?.coordinates?.length === 2 &&
      deliveryAddress.location?.coordinates?.length === 2
    ) {
      deliveryDistanceKm = Math.round(
        calculateDistance(restaurant.location.coordinates, deliveryAddress.location.coordinates) * 100
      ) / 100;
    }
    let bill = await calculateBill(cart, req.user._id, deliveryDistanceKm);
    if ((Number(deliveryDistanceKm) || 0) > 0 && (Number(bill.deliveryFee) || 0) <= 0) {
      const currentAdminSettings = await getAdminSettings();
      const freeDeliveryActive = Boolean(
        restaurant.isFreeDelivery &&
        (Number(bill.itemTotal || 0) >= Number(restaurant.freeDeliveryContribution || 0))
      );

      if (!freeDeliveryActive) {
        const recalculatedDeliveryFee = computeDeliveryFee(deliveryDistanceKm, currentAdminSettings.deliverySlabs);
        logger.error('Order placement detected zero delivery fee for positive distance; recalculating before save', {
          event: 'ORDER_DELIVERY_FEE_RECALCULATED',
          restaurantId: String(restaurant._id),
          userId: String(user._id),
          deliveryDistanceKm,
          previousDeliveryFee: Number(bill.deliveryFee || 0),
          recalculatedDeliveryFee,
          slabs: currentAdminSettings.deliverySlabs,
        });

        bill = await calculateBill(cart, req.user._id, deliveryDistanceKm);
      }
    }
    const totalPayment = bill.toPay;
    const tipAmount = bill.tip || 0;
    const totalBeforeTip = Math.max(0, totalPayment - tipAmount);
    let paymentStatus = "pending";
    if (paymentMethod === "wallet") {
      // Atomically check balance and deduct in a single operation — no MongoDB transaction
      // (transactions require replica set; standalone instances reject them).
      // The findOneAndUpdate with $gte condition is itself atomic and prevents
      // race conditions / negative balances without needing a session.
      const updatedUser = await User.findOneAndUpdate(
        { _id: user._id, walletBalance: { $gte: totalPayment } },
        { $inc: { walletBalance: -totalPayment } },
        { new: true }
      );
      if (!updatedUser) {
        return sendError(res, 400, "Insufficient Wallet Balance");
      }
      walletDeducted = true;
      walletDeductedAmount = totalPayment;
      user.walletBalance = updatedUser.walletBalance;
      paymentStatus = "paid";
    } else if (paymentMethod === "online") {
      paymentStatus = "pending";
      logPayment(null, user._id, "online", totalPayment, "pending");
    }
    const isOnlineOrder = paymentMethod === "online";
    const initialStatus = isOnlineOrder ? "pending" : "placed";
    const initialStatusLabel = isOnlineOrder ? "Awaiting Payment" : "Order Placed";
    const initialStatusDesc = isOnlineOrder
      ? "Waiting for payment to be completed via Razorpay."
      : "Your order has been placed";
    const adminSettings = await AdminSetting.findOne().lean();
    const payoutConfig = adminSettings?.payoutConfig || {};
    const incentivePercent = payoutConfig.riderIncentivePercent ?? 5;
    const adminCommissionGstPercent = adminSettings?.adminCommissionGstPercent ?? 18;
    const defaultCommissionPercent = Number(payoutConfig.defaultRestaurantCommissionPercent ?? 0);

    let adminCommission = 0;
    let adminCommissionGstTotal = 0;
    let restaurantEarningSum = 0;
    const calculatedItems = Array.isArray(bill.itemDetails) ? bill.itemDetails : [];
    const orderItems = cart.items.map((item, index) => {
      const calculatedItem = calculatedItems[index] || {};
      const fullUnitPrice = toMoney(Number(calculatedItem.unitPrice ?? item.price) || 0);
      const lineTotal = toMoney(Number(calculatedItem.lineTotal) || (fullUnitPrice * (Number(item.quantity) || 0)));
      const originalPrice = toMoney(Number(calculatedItem.originalPrice ?? lineTotal) || 0);
      const restaurantDiscountAmount = toMoney(Number(calculatedItem.restaurantDiscountAmount) || 0);
      const restaurantDiscountPercent = toMoney(Number(calculatedItem.restaurantDiscountPercent) || 0);
      const priceAfterDiscount = toMoney(Number(calculatedItem.priceAfterDiscount) || Math.max(0, originalPrice - restaurantDiscountAmount));
      const commissionPercent = Number.isFinite(Number(calculatedItem.commissionPercent))
        ? Number(calculatedItem.commissionPercent)
        : defaultCommissionPercent;
      const itemAdminCommission = toMoney(
        Number(calculatedItem.adminCommissionAmount) || (priceAfterDiscount * (commissionPercent / 100)),
      );
      const itemAdminCommissionGst = toMoney(
        Number(calculatedItem.adminCommissionGstAmount) || (itemAdminCommission * (adminCommissionGstPercent / 100)),
      );
      const itemPackagingTotal = toMoney(
        Number(calculatedItem.packagingTotal)
        || ((Number(calculatedItem.unitPackagingCharge) || 0) * (Number(item.quantity) || 0)),
      );

      const itemGstPercent = Number(calculatedItem.gstPercent ?? item.gstPercent ?? 0);
      const itemGstAmount = toMoney(Number(calculatedItem.gstOnDiscountedPrice ?? calculatedItem.itemGstAmount) || (priceAfterDiscount * (itemGstPercent / 100)));
      const itemCgst = toMoney(Number(calculatedItem.cgst) || (itemGstAmount / 2));
      const itemSgst = toMoney(Number(calculatedItem.sgst) || (itemGstAmount - itemCgst));
      const itemRestaurantEarning = Math.max(
        0,
        toMoney(
          Number(calculatedItem.restaurantNetEarningAmount)
          || (priceAfterDiscount + itemPackagingTotal - itemAdminCommission - itemAdminCommissionGst),
        ),
      );

      adminCommission += itemAdminCommission;
      adminCommissionGstTotal += itemAdminCommissionGst;
      restaurantEarningSum += itemRestaurantEarning;

      return {
        product: item.product,
        name: item.name,
        quantity: item.quantity,
        basePrice: Number(calculatedItem.basePrice ?? Math.max(0, fullUnitPrice - (Number(calculatedItem.variationPrice) || 0) - (Number(calculatedItem.addonPrice) || 0))) || 0,
        variationPrice: Number(calculatedItem.variationPrice || 0),
        addonPrice: Number(calculatedItem.addonPrice || 0),
        originalPrice,
        restaurantDiscountPercent,
        restaurantDiscountAmount,
        priceAfterDiscount,
        gstOnDiscountedPrice: itemGstAmount,
        price: fullUnitPrice,
        lineTotal,
        gstPercent: itemGstPercent,
        itemGstAmount,
        cgst: itemCgst,
        sgst: itemSgst,
        packagingCharge: Number(calculatedItem.unitPackagingCharge || 0),
        packagingGstPercent: Number(calculatedItem.packagingGstPercent || 0),
        packagingGstAmount: Number(calculatedItem.packagingGstAmount || 0),
        commissionPercent,
        adminCommissionAmount: itemAdminCommission,
        restaurantEarningAmount: itemRestaurantEarning,
        variation: item.variation ? { name: item.variation.name, price: item.variation.price } : undefined,
        addOns: item.addOns,
        restaurant: restaurantId
      };
    });
    adminCommission = toMoney(adminCommission);
    adminCommissionGstTotal = toMoney(adminCommissionGstTotal);
    restaurantEarningSum = toMoney(restaurantEarningSum);

    const canonicalSettlement = calculateSettlementBreakdown({
      itemTotal: bill.itemTotal || 0,
      restaurantDiscount: bill.restaurantDiscount || 0,
      foodGstPercent: (bill.priceAfterRestaurantDiscount || 0) > 0
        ? ((bill.gstOnFood || 0) / bill.priceAfterRestaurantDiscount) * 100
        : 0,
      packagingCharge: bill.packaging || 0,
      packagingGstPercent: (bill.packaging || 0) > 0 ? ((bill.packagingGST || 0) / bill.packaging) * 100 : 0,
      foodierDiscount: bill.foodierDiscount || bill.discount || 0,
      discountGstPercent: adminSettings?.defaultGstPercent ?? 5,
      deliveryFee: bill.deliveryFee || 0,
      platformFee: bill.platformFee || 0,
      deliveryChargeGstPercent: adminSettings?.deliveryChargeGstPercent ?? 18,
      platformGstPercent: adminSettings?.platformFeeGstPercent ?? 18,
      adminCommissionAmount: adminCommission,
      adminCommissionGstPercent,
    });

    // Canonical restaurant earning is item-based and must match item aggregation.
    canonicalSettlement.adminCommissionGst = adminCommissionGstTotal;
    canonicalSettlement.restaurantNet = restaurantEarningSum;
    canonicalSettlement.restaurantNetEarning = restaurantEarningSum;
    canonicalSettlement.customerRestaurantBill = canonicalSettlement.finalPayableToRestaurant;
    canonicalSettlement.restaurantGross = toMoney(
      (canonicalSettlement.priceAfterRestaurantDiscount || 0) + (bill.packaging || 0),
    );
    canonicalSettlement.totalAdminCommissionDeduction = toMoney(adminCommission + adminCommissionGstTotal);

    // ── Rider Earnings ───────────────────────────────────────────────────────
    // Rider receives: deliveryFee (pre-GST) + platformFee (pre-GST) + incentive.
    // Platform GST and delivery GST are tracked separately in paymentBreakdown.

    // Rider delivery charge = full delivery fee collected from customer (System A — snapshot)
    const riderDeliveryCharge = toMoney(bill.deliveryFee || 0);
    // Rider receives the pre-GST platform fee.
    const riderPlatformFeeShare = toMoney(bill.platformFee || 0);
    // Admin platform GST earning = GST on platform fee only.
    const adminPlatformFeeShare = toMoney(canonicalSettlement.gstOnPlatform || 0);
    // Incentive: % of item subtotal (before GST/fees)
    const riderIncentiveAmount = Math.max(0, toMoney(bill.itemTotal * (incentivePercent / 100)));
    const riderTipAmount = Math.max(0, toMoney(tipAmount || 0));

    const riderEarningsData = {
      deliveryCharge: riderDeliveryCharge,
      platformFee: riderPlatformFeeShare,
      incentive: riderIncentiveAmount,
      tip: riderTipAmount,
      incentivePercentAtCompletion: incentivePercent,
      totalRiderEarning: Math.max(0, toMoney(riderDeliveryCharge + riderPlatformFeeShare + riderIncentiveAmount + riderTipAmount)),
      earnedAt: new Date(),
    };
    const pickupOtp = Math.floor(1000 + Math.random() * 9000).toString();
    const deliveryOtp = Math.floor(1000 + Math.random() * 9000).toString();
    const otpExpiry = 100 * 60 * 1000; // 100 minutes

    // customerRestaurantBill = what the customer pays toward the restaurant component
    //   (from settlement calculator: items + GST + packaging − discounts)
    // restaurantNetEarning   = what the restaurant actually keeps after admin commission
    //   (= Σ items[].restaurantEarningAmount = itemTotal − adminCommission)
    // These are two different quantities and must never overwrite each other.
    const customerRestaurantBill = toMoney((canonicalSettlement.finalPayableToRestaurant) || 0);
    const cgstAdminCommission = toMoney(adminCommissionGstTotal / 2);
    const sgstAdminCommission = toMoney(adminCommissionGstTotal - cgstAdminCommission);
    const totalGstCollected = toMoney(
      (canonicalSettlement.gstOnFood || 0)
      + (canonicalSettlement.packagingGST || 0)
      + (canonicalSettlement.deliveryGst || 0)
      + (canonicalSettlement.gstOnPlatform || 0)
      + adminCommissionGstTotal,
    );
    const cgstTotalForAdmin = toMoney(
      (canonicalSettlement.cgstOnFood || 0)
      + (canonicalSettlement.cgstOnPackaging || 0)
      + (canonicalSettlement.cgstDelivery || 0)
      + (canonicalSettlement.cgstPlatform || 0)
      + cgstAdminCommission,
    );
    const sgstTotalForAdmin = toMoney(
      (canonicalSettlement.sgstOnFood || 0)
      + (canonicalSettlement.sgstOnPackaging || 0)
      + (canonicalSettlement.sgstDelivery || 0)
      + (canonicalSettlement.sgstPlatform || 0)
      + sgstAdminCommission,
    );

    const orderDoc = {
      customer: user._id,
      restaurant: restaurantId,
      idempotencyKey: `${cart._id}-${restaurantId}`,
      pickupOtp,
      pickupOtpExpiresAt: new Date(Date.now() + otpExpiry),
      deliveryOtp,
      deliveryOtpExpiresAt: new Date(Date.now() + otpExpiry),
      items: orderItems,
      deliveryDistanceKm,
      itemTotal: bill.itemTotal,
      tax: bill.tax,
      packaging: bill.packaging,
      deliveryFee: bill.deliveryFee,
      platformFee: bill.platformFee,
      tip: tipAmount,
      discount: bill.discount,
      couponCode: bill.appliedCoupon,
      totalAmount: bill.toPay,
      paymentBreakdown: {
        ...canonicalSettlement,
        priceAfterRestaurantDiscount: toMoney(canonicalSettlement.priceAfterRestaurantDiscount || 0),
        deliveryCharge: riderEarningsData.deliveryCharge,
        finalPayableToRestaurant: customerRestaurantBill,
        customerRestaurantBill,
        restaurantNet: restaurantEarningSum,
        restaurantNetEarning: restaurantEarningSum,
        adminCommissionGst: adminCommissionGstTotal,
        cgstAdminCommission,
        sgstAdminCommission,
        adminCommissionGstPercent,
        deliveryGST: canonicalSettlement.deliveryGst,
        deliveryGst: canonicalSettlement.deliveryGst,
        cgstDelivery: canonicalSettlement.cgstDelivery,
        sgstDelivery: canonicalSettlement.sgstDelivery,
        deliveryChargeGstPercent: canonicalSettlement.deliveryChargeGstPercent,
        platformGST: canonicalSettlement.gstOnPlatform,
        totalAdminCommissionDeduction: toMoney(adminCommission + adminCommissionGstTotal),
        totalGstCollected,
        totalGstBreakdownForAdmin: {
          foodGst: toMoney(canonicalSettlement.gstOnFood || 0),
          packagingGst: toMoney(canonicalSettlement.packagingGST || 0),
          deliveryGst: toMoney(canonicalSettlement.deliveryGst || 0),
          platformGst: toMoney(canonicalSettlement.gstOnPlatform || 0),
          adminCommissionGst: toMoney(adminCommissionGstTotal),
          cgstTotal: cgstTotalForAdmin,
          sgstTotal: sgstTotalForAdmin,
        },
        riderDeliveryEarning: riderEarningsData.deliveryCharge,
        riderIncentive: riderIncentiveAmount,
        riderTip: riderTipAmount,
        riderPlatformFeeShare,
        adminPlatformFeeShare,
        computedVersion: canonicalSettlement.computedVersion || "settlement-v3",
        computedAt: new Date(),
      },
      // Structured rider earnings (single source of truth)
      riderEarnings: riderEarningsData,
      deliveryAddress: {
        addressLine: deliveryAddress.addressLine,
        coordinates: deliveryAddress.location.coordinates,
      },
      paymentMethod,
      paymentStatus,
      status: initialStatus,
      timeline: [{
        status: initialStatus,
        timestamp: new Date(),
        label: initialStatusLabel,
        by: "system",
        description: initialStatusDesc
      }],
    };

    const integrityResult = validateOrderFinancialIntegrity(orderDoc);
    if (!integrityResult.valid) {
      return sendError(res, 400, 'Financial integrity validation failed', integrityResult.issues);
    }
    const newOrder = await Order.create(orderDoc);
    // Record wallet transaction after order is created so orderId can be linked
    if (paymentMethod === "wallet") {
      await WalletTransaction.create([{
        user: user._id,
        amount: -totalPayment,
        type: "debit",
        source: 'order_payment',
        orderId: newOrder._id,
        description: `Payment for Order #${newOrder._id}`,
      }]);
      logWalletTransaction(user._id, "debit", totalPayment, null, user.walletBalance);
      logPayment(null, user._id, "wallet", totalPayment, "success");
    }
    await User.findByIdAndUpdate(user._id, { $inc: { totalOrders: 1, totalAmountSpent: bill.toPay } });
    await Restaurant.findByIdAndUpdate(restaurantId, { $inc: { totalOrders: 1 } });
    logOrderTransition(newOrder._id, null, initialStatus, user._id, "customer", `Order placed via ${paymentMethod}`);
    if (isOnlineOrder) {
      return res.status(201).json({
        success: true,
        message: "Order created. Complete payment to confirm.",
        order: newOrder,
        orderId: newOrder._id,
        totalPayment,
        requiresPayment: true,
      });
    }
    try {
      if (restaurant && restaurant.owner) {
        await sendNotification(
          restaurant.owner._id,
          "New Order Received",
          `Order #${newOrder._id} - ₹${bill.toPay}`,
          { orderId: newOrder._id, restaurantId }
        );
      }
      const restaurantOrderPayload = {
        orderId: newOrder._id,
        restaurantId: restaurantId.toString(),
        customerId: user._id.toString(),
        customerName: user.name,
        restaurantName: restaurant.name,
        items: cart.items.length,
        itemCount: cart.items.length,
        amount: bill.toPay,
        totalAmount: bill.toPay,
        paymentMethod,
        status: "placed",
        timestamp: new Date(),
      };
      socketService.emitToRestaurant(restaurantId.toString(), "order:new", restaurantOrderPayload);
      socketService.emitToRestaurant(restaurantId.toString(), "restaurant:new_order", restaurantOrderPayload);
    } catch (e) {
      logger.error("Notify error", e);
    }
    try {
      socketService.emitToAdmin("order:new", {
        orderIds: [newOrder._id],
        customerName: user.name,
        restaurantCount: 1,
        totalAmount: totalPayment,
        paymentMethod,
        timestamp: new Date(),
      });
    } catch (err) { }
    await Cart.findByIdAndDelete(cart._id);
    if (paymentStatus === "paid" && cart.couponCode) {
      await Promocode.updateOne({ code: cart.couponCode }, { $inc: { usedCount: 1 } });
      logCouponUsage(user._id, cart.couponCode, newOrder._id, null, true);
    }
    res.status(201).json({
      success: true,
      message: "Order placed successfully",
      order: newOrder,
      totalPayment
    });
  } catch (error) {
    // If wallet was deducted but order creation failed, refund atomically (saga compensation)
    if (walletDeducted) {
      await User.findByIdAndUpdate(req.user._id, { $inc: { walletBalance: walletDeductedAmount } })
        .catch(err => logger.error("Wallet compensation refund failed", { error: err.message, userId: req.user._id }));
    }
    console.error("Place order error:", error);
    return sendError(res, 500, "Failed to place order", error.message);
  }
};
exports.getMyOrders = async (req, res) => {
  try {
    if (!req.user || !isValidObjectId(req.user._id)) {
      return sendError(res, 401, "Unauthorized");
    }
    const { calculateDistance } = require('../utils/locationUtils');
    const orders = await Order.find({ customer: req.user._id })
      .populate('restaurant', 'name image bannerImage address location deliveryFee menuApproved verificationStatus') // Populate only necessary restaurant fields
      .populate('items.product', 'name image price')
      .populate('rider', 'user currentLocation rating vehicle')
      .populate('rider.user', 'name mobile profilePic')
      .select('-timeline -riderNotificationStatus') // Exclude heavy fields for list view
      .sort({ createdAt: -1 });
    const formattedOrders = orders.map(order => {
      const orderObj = order.toObject();
      if (orderObj.restaurant) {
        orderObj.restaurant = formatRestaurantForUser(orderObj.restaurant);
      }
      if (orderObj.rider && orderObj.rider.rating !== undefined) {
        const ratingValue = orderObj.rider.rating;
        orderObj.rider.rating = getAverageRating(ratingValue);
        orderObj.rider.ratingCount = getRatingCount(ratingValue);
      }
      if (orderObj.rider && orderObj.rider.currentLocation && orderObj.deliveryAddress) {
        const riderCoords = orderObj.rider.currentLocation.coordinates;
        const customerCoords = orderObj.deliveryAddress.coordinates;
        if (riderCoords && customerCoords && riderCoords.length === 2 && customerCoords.length === 2) {
          const distanceToCustomer = calculateDistance(riderCoords, customerCoords);
          orderObj.distanceToCustomer = Math.round(distanceToCustomer * 100) / 100;
          orderObj.estimatedMinutes = Math.ceil(distanceToCustomer / 1); // 1 km/min assumption
        }
      }
      return orderObj;
    });
    res.status(200).json({ success: true, orders: formattedOrders });
  } catch (error) {
    return sendError(res, 500, "Failed to fetch orders", error.message);
  }
};
exports.getOrderDetailsCustomer = async (req, res) => {
  try {
    if (!req.user || !isValidObjectId(req.user._id)) {
      return sendError(res, 401, "Unauthorized");
    }
    const order = await Order.findById(req.params.id)
      .populate("customer", "name email mobile profilePic")
      .populate("restaurant", "name image bannerImage address city area location deliveryTime phone")
      .populate("items.product", "name image price category")
      .populate("rider", "user currentLocation rating vehicle")
      .populate("rider.user", "name mobile profilePic");
    if (!order) return sendError(res, 404, "Order not found");
    if (order.customer._id.toString() !== req.user._id.toString()) {
      return sendError(res, 403, "Access denied");
    }
    const { calculateDistance } = require('../utils/locationUtils');
    const orderObj = order.toObject();
    const response = {
      success: true,
      order: {
        id: orderObj._id,
        orderNumber: orderObj.orderNumber || orderObj._id.toString().slice(-6),
        status: orderObj.status,
        statusLabel: mapStatusLabel(orderObj.status),
        createdAt: orderObj.createdAt,
        restaurant: {
          id: orderObj.restaurant._id,
          name: orderObj.restaurant.name,
          image: orderObj.restaurant.image,
          address: orderObj.restaurant.address,
          city: orderObj.restaurant.city,
          area: orderObj.restaurant.area,
          phone: orderObj.restaurant.phone,
          deliveryTime: orderObj.restaurant.deliveryTime,
        },
        items: orderObj.items.map(item => ({
          id: item._id,
          name: item.product?.name || item.name,
          image: item.product?.image,
          quantity: item.quantity,
          price: item.price,
          lineTotal: item.lineTotal || Math.round((item.price || 0) * item.quantity * 100) / 100,
          gstPercent: item.gstPercent || 0,
          itemGstAmount: item.itemGstAmount || 0,
          cgst: item.cgst || 0,
          sgst: item.sgst || 0,
          ...(item.variation && { variation: item.variation }),
          ...(item.addOns?.length && { addOns: item.addOns })
        })),
        bill: {
          itemTotal: orderObj.itemTotal,
          tax: orderObj.tax,
          packaging: orderObj.packaging || 0,
          deliveryFee: orderObj.deliveryFee,
          platformFee: orderObj.platformFee,
          tip: orderObj.tip,
          discount: orderObj.discount,
          totalAmount: orderObj.totalAmount,
          paymentBreakdown: orderObj.paymentBreakdown || null,
        },
        payment: {
          method: orderObj.paymentMethod,
          status: orderObj.paymentStatus,
        },
        deliveryAddress: orderObj.deliveryAddress,
        ...(orderObj.rider && {
          rider: {
            id: orderObj.rider._id,
            name: orderObj.rider.user?.name || 'Rider',
            phone: orderObj.rider.user?.mobile,
            avatar: orderObj.rider.user?.profilePic,
            rating: getAverageRating(orderObj.rider.rating),
            ratingCount: getRatingCount(orderObj.rider.rating),
            isRated: orderObj.restaurantRatedRider ?? false,
            vehicle: orderObj.rider.vehicle,
            currentLocation: orderObj.rider.currentLocation,
          }
        }),
        timeline: orderObj.timeline?.map(t => ({
          status: t.status,
          label: t.label,
          description: t.description,
          timestamp: t.timestamp,
        })) || [],
      }
    };
    if (orderObj.rider && orderObj.rider.currentLocation && orderObj.deliveryAddress?.coordinates && orderObj.restaurant?.location?.coordinates) {
      const riderCoords = orderObj.rider.currentLocation.coordinates;
      const customerCoords = orderObj.deliveryAddress.coordinates;
      const restaurantCoords = orderObj.restaurant.location.coordinates;
      if (riderCoords?.length === 2 && customerCoords?.length === 2 && restaurantCoords?.length === 2) {
        const distanceToCustomer = calculateDistance(riderCoords, customerCoords);
        const distanceToRestaurant = calculateDistance(riderCoords, restaurantCoords);
        response.distances = {
          toCustomer: Math.round(distanceToCustomer * 100) / 100,
          toRestaurant: Math.round(distanceToRestaurant * 100) / 100,
          toCustomerMeters: Math.round(distanceToCustomer * 1000),
        };
      }
    }
    res.status(200).json(response);
  } catch (error) {
    return sendError(res, 500, "Failed to fetch order details", error.message);
  }
};
exports.getOrderDetailsRestaurant = async (req, res) => {
  try {
    if (!req.user || !isValidObjectId(req.user._id)) {
      return sendError(res, 401, "Unauthorized");
    }
    const restaurant = await Restaurant.findOne({ owner: req.user._id }).select("_id");
    if (!restaurant) return sendError(res, 404, "Restaurant not found");
    const order = await Order.findById(req.params.id)
      .populate("customer", "name email mobile profilePic address")
      .populate("restaurant", "name image address phone")
      .populate("items.product", "name image category")
      .populate("rider", "user currentLocation rating vehicle")
      .populate("rider.user", "name mobile profilePic");
    if (!order) return sendError(res, 404, "Order not found");
    if (order.restaurant._id.toString() !== restaurant._id.toString()) {
      return sendError(res, 403, "Access denied");
    }
    const orderObj = order.toObject();
    const response = {
      success: true,
      order: {
        id: orderObj._id,
        orderNumber: orderObj.orderNumber || orderObj._id.toString().slice(-6),
        status: orderObj.status,
        statusLabel: mapStatusLabel(orderObj.status),
        createdAt: orderObj.createdAt,
        estimatedReadyTime: orderObj.estimatedDeliveryTime,
        customer: {
          id: orderObj.customer._id,
          name: orderObj.customer.name,
          phone: orderObj.customer.mobile,
          avatar: orderObj.customer.profilePic,
          address: orderObj.customer.address,
        },
        items: orderObj.items.map(item => ({
          id: item._id,
          name: item.product?.name || item.name,
          image: item.product?.image,
          category: item.product?.category,
          quantity: item.quantity,
          price: item.price,
          total: (item.price || 0) * item.quantity,
          ...(item.variation && { variation: item.variation }),
          ...(item.addOns?.length && { addOns: item.addOns })
        })),
        bill: {
          itemTotal: orderObj.itemTotal,
          tax: orderObj.tax,
          packaging: orderObj.packaging || 0,
          deliveryFee: orderObj.deliveryFee,
          platformFee: orderObj.platformFee,
          tip: orderObj.tip,
          discount: orderObj.discount,
          totalAmount: orderObj.totalAmount,
          restaurantEarning: orderObj.paymentBreakdown?.restaurantNet || 0,
        },
        payment: {
          method: orderObj.paymentMethod,
          status: orderObj.paymentStatus,
        },
        ...(orderObj.pickupOtp && {
          pickupOtp: orderObj.pickupOtp,
          pickupOtpExpiresAt: orderObj.pickupOtpExpiresAt,
          pickupOtpVerifiedAt: orderObj.pickupOtpVerifiedAt,
        }),
        ...(orderObj.rider && {
          rider: {
            id: orderObj.rider._id,
            name: orderObj.rider.user?.name || 'Rider',
            phone: orderObj.rider.user?.mobile,
            avatar: orderObj.rider.user?.profilePic,
            rating: getAverageRating(orderObj.rider.rating),
            ratingCount: getRatingCount(orderObj.rider.rating),
            vehicle: orderObj.rider.vehicle,
            currentLocation: orderObj.rider.currentLocation,
          }
        }),
        deliveryAddress: orderObj.deliveryAddress,
        timeline: orderObj.timeline?.map(t => ({
          status: t.status,
          label: t.label,
          description: t.description,
          timestamp: t.timestamp,
          by: t.by,
        })) || [],
      }
    };
    res.status(200).json(response);
  } catch (error) {
    return sendError(res, 500, "Failed to fetch restaurant order details", error.message);
  }
};
exports.getOrderDetailsRider = async (req, res) => {
  try {
    if (!req.user || !isValidObjectId(req.user._id)) {
      return sendError(res, 401, "Unauthorized");
    }
    const riderProfile = await Rider.findOne({ user: req.user._id }).select("_id currentLocation");
    if (!riderProfile) return sendError(res, 404, "Rider profile not found");
    const order = await Order.findById(req.params.id)
      .populate("customer", "name email mobile profilePic")
      .populate("restaurant", "name image address phone location")
      .populate("items.product", "name image")
      .populate("rider", "user currentLocation rating vehicle")
      .populate("rider.user", "name mobile profilePic");
    if (!order) return sendError(res, 404, "Order not found");
    if (!order.rider || order.rider._id.toString() !== riderProfile._id.toString()) {
      return sendError(res, 403, "Access denied");
    }
    const { calculateDistance } = require('../utils/locationUtils');
    const orderObj = order.toObject();
    const response = {
      success: true,
      order: {
        id: orderObj._id,
        orderNumber: orderObj.orderNumber || orderObj._id.toString().slice(-6),
        status: orderObj.status,
        statusLabel: mapStatusLabel(orderObj.status),
        createdAt: orderObj.createdAt,
        pickedUpAt: orderObj.pickedUpAt,
        deliveredAt: orderObj.deliveredAt,
        restaurant: {
          id: orderObj.restaurant._id,
          name: orderObj.restaurant.name,
          image: orderObj.restaurant.image,
          address: orderObj.restaurant.address,
          phone: orderObj.restaurant.phone,
          location: orderObj.restaurant.location,
        },
        customer: {
          id: orderObj.customer._id,
          name: orderObj.customer.name,
          phone: orderObj.customer.mobile,
          avatar: orderObj.customer.profilePic,
          deliveryAddress: orderObj.deliveryAddress,
        },
        items: orderObj.items.map(item => ({
          name: item.product?.name || item.name,
          image: item.product?.image,
          quantity: item.quantity,
        })),
        bill: {
          itemTotal: orderObj.itemTotal,
          deliveryFee: orderObj.deliveryFee,
          tip: orderObj.tip,
          totalAmount: orderObj.totalAmount,
          riderEarning: (orderObj.riderEarnings?.totalRiderEarning || 0),
        },
        payment: {
          method: orderObj.paymentMethod,
          status: orderObj.paymentStatus,
        },
        otps: {
          pickup: {
            otp: orderObj.pickupOtp,
            expiresAt: orderObj.pickupOtpExpiresAt,
            verifiedAt: orderObj.pickupOtpVerifiedAt,
          },
          delivery: {
            otp: orderObj.deliveryOtp,
            expiresAt: orderObj.deliveryOtpExpiresAt,
            verifiedAt: orderObj.deliveryOtpVerifiedAt,
          }
        },
        timeline: orderObj.timeline?.map(t => ({
          status: t.status,
          label: t.label,
          description: t.description,
          timestamp: t.timestamp,
        })) || [],
      }
    };
    if (riderProfile.currentLocation && orderObj.restaurant?.location?.coordinates && orderObj.deliveryAddress?.coordinates) {
      const riderCoords = riderProfile.currentLocation.coordinates;
      const restaurantCoords = orderObj.restaurant.location.coordinates;
      const customerCoords = orderObj.deliveryAddress.coordinates;
      if (riderCoords?.length === 2 && restaurantCoords?.length === 2 && customerCoords?.length === 2) {
        const distToRestaurant = calculateDistance(riderCoords, restaurantCoords);
        const distToCustomer = calculateDistance(restaurantCoords, customerCoords);
        response.distances = {
          toRestaurant: {
            km: Math.round(distToRestaurant * 100) / 100,
            meters: Math.round(distToRestaurant * 1000),
          },
          toCustomer: {
            km: Math.round(distToCustomer * 100) / 100,
            meters: Math.round(distToCustomer * 1000),
          },
          totalDistance: {
            km: Math.round((distToRestaurant + distToCustomer) * 100) / 100,
            meters: Math.round((distToRestaurant + distToCustomer) * 1000),
          }
        };
      }
    }
    res.status(200).json(response);
  } catch (error) {
    return sendError(res, 500, "Failed to fetch rider order details", error.message);
  }
};
exports.getOrderDetails = async (req, res) => {
  try {
    if (!req.user || !isValidObjectId(req.user._id)) {
      return sendError(res, 401, "Unauthorized");
    }
    const userId = req.user._id.toString();
    if (req.user.role === "customer") {
      return exports.getOrderDetailsCustomer(req, res);
    }
    if (req.user.role === "restaurant_owner") {
      return exports.getOrderDetailsRestaurant(req, res);
    }
    if (req.user.role === "rider") {
      return exports.getOrderDetailsRider(req, res);
    }
    return sendError(res, 403, "Unknown role");
  } catch (error) {
    return sendError(res, 500, "Failed to fetch order details", error.message);
  }
};
function mapStatusLabel(status) {
  const labels = {
    'placed': 'Order Placed',
    'accepted': 'Restaurant Accepted',
    'preparing': 'Preparing',
    'ready': 'Ready for Pickup',
    'assigned': 'Rider Assigned',
    'reached_restaurant': 'Rider at Restaurant',
    'picked_up': 'Out for Delivery',
    'delivery_arrived': 'Arriving Soon',
    'delivered': 'Delivered',
    'cancelled': 'Cancelled',
    'failed': 'Payment Failed',
  };
  return labels[status] || status;
}
exports.getRestaurantOrders = async (req, res) => {
  try {
    if (!req.user || !isValidObjectId(req.user._id)) {
      return sendError(res, 401, "Unauthorized");
    }
    const restaurant = await Restaurant.findOne({ owner: req.user._id });
    if (!restaurant) return sendError(res, 404, "Restaurant not found");
    const orders = await Order.find({ restaurant: restaurant._id })
      .populate("customer", "name email mobile phone")
      .populate("rider", "user rating")
      .populate("rider.user", "name mobile profilePic")
      .select('-timeline -riderNotificationStatus')
      .sort({ createdAt: -1 });
    const formattedOrders = orders.map((order) => {
      const orderObj = order.toObject();
      if (orderObj.rider && orderObj.rider.rating !== undefined) {
        const ratingValue = orderObj.rider.rating;
        orderObj.rider.rating = getAverageRating(ratingValue);
        orderObj.rider.ratingCount = getRatingCount(ratingValue);
      }
      return orderObj;
    });
    res.status(200).json({ success: true, orders: formattedOrders });
  } catch (error) {
    return sendError(
      res,
      500,
      "Failed to fetch restaurant orders",
      error.message,
    );
  }
};
exports.getRestaurantOrderDetails = async (req, res) => {
  try {
    if (!req.user || !isValidObjectId(req.user._id)) {
      return sendError(res, 401, "Unauthorized");
    }
    const restaurant = await Restaurant.findOne({ owner: req.user._id }).select("_id");
    if (!restaurant) {
      return sendError(res, 404, "Restaurant not found");
    }
    const order = await Order.findById(req.params.id)
      .populate("customer", "name email mobile profilePic")
      .populate("restaurant", "name image bannerImage address city area location deliveryTime")
      .populate("items.product", "name image price")
      .populate("rider", "user currentLocation rating vehicle")
      .populate("rider.user", "name mobile profilePic");
    if (!order) {
      return sendError(res, 404, "Order not found");
    }
    if (!order.restaurant || order.restaurant._id.toString() !== restaurant._id.toString()) {
      return sendError(res, 403, "Access denied");
    }
    const orderObj = order.toObject();
    if (orderObj.restaurant) {
      orderObj.restaurant = formatRestaurantForUser(orderObj.restaurant);
    }
    if (orderObj.rider && orderObj.rider.rating !== undefined) {
      const ratingValue = orderObj.rider.rating;
      orderObj.rider.rating = getAverageRating(ratingValue);
      orderObj.rider.ratingCount = getRatingCount(ratingValue);
    }
    return res.status(200).json({
      success: true,
      order: orderObj,
    });
  } catch (error) {
    return sendError(res, 500, "Failed to fetch restaurant order details", error.message);
  }
};
exports.getPendingOrdersForRestaurant = async (req, res) => {
  try {
    if (!req.user || !isValidObjectId(req.user._id)) {
      return sendError(res, 401, "Unauthorized");
    }
    const restaurant = await Restaurant.findOne({ owner: req.user._id });
    if (!restaurant) {
      return sendError(res, 404, "Restaurant not found");
    }
    const pendingOrders = await Order.find({
      restaurant: restaurant._id,
      status: "placed",
    })
      .populate("customer", "name email mobile address")
      .populate("items.product", "name image category")
      .sort({ createdAt: -1 });
    res.status(200).json({
      success: true,
      message: `Found ${pendingOrders.length} pending orders`,
      count: pendingOrders.length,
      orders: pendingOrders,
    });
  } catch (error) {
    logger.error("Failed to fetch pending restaurant orders", {
      restaurantOwnerId: req.user._id,
      error: error.message,
    });
    return sendError(res, 500, "Failed to fetch pending orders", error.message);
  }
};
exports.getCompletedOrdersForRestaurant = async (req, res) => {
  try {
    if (!req.user || !isValidObjectId(req.user._id)) {
      return sendError(res, 401, "Unauthorized");
    }
    const restaurant = await Restaurant.findOne({ owner: req.user._id });
    if (!restaurant) {
      return sendError(res, 404, "Restaurant not found");
    }
    const { page, limit, skip } = getPaginationParams(req, 20);
    const query = { restaurant: restaurant._id, status: "delivered" };
    const [orders, total] = await Promise.all([
      Order.find(query)
        .populate("customer", "name email mobile")
        .populate("rider", "user rating")
        .populate("rider.user", "name mobile profilePic")
        .select("-timeline -riderNotificationStatus")
        .sort({ deliveredAt: -1, createdAt: -1 })
        .skip(skip)
        .limit(limit),
      Order.countDocuments(query),
    ]);
    return res.status(200).json({
      success: true,
      orders,
      pagination: {
        total,
        page,
        limit,
        pages: Math.ceil(total / limit),
        hasNext: page < Math.ceil(total / limit),
        hasPrev: page > 1,
      },
    });
  } catch (error) {
    logger.error("Failed to fetch completed restaurant orders", {
      restaurantOwnerId: req.user?._id,
      error: error.message,
    });
    return sendError(res, 500, "Failed to fetch completed orders", error.message);
  }
};
exports.customerCancelOrder = async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();
  try {
    const { reason } = req.body;
    const order = await Order.findById(req.params.id).session(session);
    if (!order) {
      await session.abortTransaction();
      return res.status(404).json({ message: "Order not found" });
    }
    if (order.customer.toString() !== req.user._id.toString()) {
      await session.abortTransaction();
      return res.status(403).json({ message: "Not your order" });
    }
    const cancellableStatuses = ['placed', 'accepted'];
    if (!cancellableStatuses.includes(order.status)) {
      await session.abortTransaction();
      return res.status(400).json({
        message: `Cannot cancel order in ${order.status} status`,
        currentStatus: order.status,
        reason: "Chef has started preparing"
      });
    }
    let refundAmount = order.totalAmount;
    let refundPercentage = 100;
    if (order.status === 'preparing') {
      refundAmount = Math.round(order.totalAmount * 0.5 * 100) / 100;
      refundPercentage = 50;
    }
    const oldStatus = order.status;
    order.status = 'cancelled';
    order.cancellationReason = `Cancelled by customer: ${reason || 'No reason provided'}`;
    order.timeline.push({
      status: 'cancelled',
      timestamp: new Date(),
      label: 'Order Cancelled',
      by: 'customer',
      description: 'Order cancelled by customer'
    });
    if (order.paymentStatus === 'paid') {
      const user = await User.findById(order.customer).session(session);
      user.walletBalance = (user.walletBalance || 0) + refundAmount;
      await user.save({ session });
      const WalletTransaction = require('../models/WalletTransaction');
      await WalletTransaction.create([{
        user: user._id,
        amount: refundAmount,
        type: 'credit',
        source: 'refund',
        description: `Cancellation refund (${refundPercentage}%) - Order ${order._id.toString().slice(-6)}`,
        orderId: order._id
      }], { session });
      order.paymentStatus = 'refunding';
      order.refund = {
        status: 'completed',
        amount: refundAmount,
        completedAt: new Date(),
        method: 'wallet',
        note: `Customer cancellation (${refundPercentage}% refund)`
      };
    }
    await order.save({ session });
    if (['placed', 'accepted'].includes(oldStatus)) {
      try {
        socketService.emitToRestaurant(order.restaurant.toString(), 'order:cancelled_by_customer', {
          orderId: order._id,
          reason: reason,
          status: oldStatus
        });
      } catch (e) { }
    }
    if (order.rider) {
      const rider = await Rider.findById(order.rider).session(session);
      if (rider) {
        rider.isAvailable = true;
        await rider.save({ session });
        try {
          socketService.emitToRider(rider.user.toString(), 'order:cancelled', {
            orderId: order._id.toString(),
            message: "Order cancelled by customer",
            status: 'cancelled',
            reason: reason || 'Customer cancellation',
            timestamp: new Date()
          });
        } catch (e) { }
      }
      try {
        socketService.emitToRider(order.rider.toString(), 'order:cancelled', {
          orderId: order._id.toString(),
          message: "Order cancelled by customer",
          status: 'cancelled',
          reason: reason || 'Customer cancellation',
          timestamp: new Date()
        });
      } catch (e) { }
    }
    logOrderTransition(order._id, oldStatus, 'cancelled', req.user._id, 'customer');
    await session.commitTransaction();
    session.endSession();
    res.status(200).json({
      success: true,
      message: `Order cancelled successfully. Refund: ₹${refundAmount}`,
      order,
      refund: {
        amount: refundAmount,
        percentage: refundPercentage,
        creditedTo: 'wallet'
      }
    });
  } catch (error) {
    await session.abortTransaction();
    session.endSession();
    res.status(500).json({ message: error.message });
  }
};
exports.getOrderTimeline = async (req, res) => {
  try {
    const order = await Order.findById(req.params.id);
    if (!order) return res.status(404).json({ message: "Order not found" });
    const isCustomer = order.customer.toString() === req.user._id.toString();
    const isRestaurant = order.restaurant && (await Restaurant.findOne({
      _id: order.restaurant,
      owner: req.user._id
    }));
    const isRider = order.rider && (await Rider.findOne({
      _id: order.rider,
      user: req.user._id
    }));
    const isAdmin = req.user.role === 'admin';
    if (!isCustomer && !isRestaurant && !isRider && !isAdmin) {
      return res.status(403).json({ message: "Access denied" });
    }
    const formattedTimeline = order.timeline.map(event => ({
      status: event.status,
      timestamp: event.timestamp,
      label: event.label || getStatusLabel(event.status),
      description: event.description || getStatusDescription(event.status),
      icon: getStatusIcon(event.status),
      by: event.by || 'system'
    }));
    res.status(200).json({
      orderId: order._id,
      timeline: formattedTimeline,
      currentStatus: order.status,
      createdAt: order.createdAt,
      updatedAt: order.updatedAt
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};
exports.rateRider = async (req, res) => {
  try {
    const { rating, comment, restaurantRating } = req.body;
    const orderId = req.params.id || req.body.orderId;
    if (!rating || rating < 1 || rating > 5) {
      return res.status(400).json({ message: "Rating must be between 1 and 5" });
    }
    const order = await Order.findById(orderId);
    if (!order) return res.status(404).json({ message: "Order not found" });
    if (order.customer.toString() !== req.user._id.toString()) {
      return res.status(403).json({ message: "Only customer can rate" });
    }
    if (order.status !== 'delivered') {
      return res.status(400).json({ message: "Can only rate after delivery" });
    }
    const existingReview = await Review.findOne({ order: orderId });
    if (existingReview) {
      return res.status(400).json({ message: "Order already rated" });
    }
    await Review.create({
      user: req.user._id,
      order: orderId,
      restaurant: order.restaurant,
      rider: order.rider,
      riderRating: rating,
      restaurantRating: restaurantRating || undefined,
      comment,
    });
    let riderNewRating = 0;
    if (order.rider) {
      const riderDoc = await Rider.findById(order.rider);
      if (riderDoc) {
        const stats = await Review.aggregate([
          { $match: { rider: riderDoc._id, riderRating: { $exists: true, $ne: null } } },
          {
            $group: {
              _id: null, average: { $avg: '$riderRating' }, count: { $sum: 1 },
              five: { $sum: { $cond: [{ $eq: ['$riderRating', 5] }, 1, 0] } },
              four: { $sum: { $cond: [{ $eq: ['$riderRating', 4] }, 1, 0] } },
              three: { $sum: { $cond: [{ $eq: ['$riderRating', 3] }, 1, 0] } },
              two: { $sum: { $cond: [{ $eq: ['$riderRating', 2] }, 1, 0] } },
              one: { $sum: { $cond: [{ $eq: ['$riderRating', 1] }, 1, 0] } },
            }
          }
        ]);
        if (stats.length > 0) {
          const s = stats[0];
          riderDoc.rating = {
            average: Math.round(s.average * 10) / 10,
            count: s.count,
            breakdown: { five: s.five, four: s.four, three: s.three, two: s.two, one: s.one },
            lastRatedAt: new Date(),
          };
          await riderDoc.save();
          riderNewRating = riderDoc.rating.average;
        }
      }
    }
    if (restaurantRating && order.restaurant) {
      const restaurantDoc = await Restaurant.findById(order.restaurant);
      if (restaurantDoc) {
        const rStats = await Review.aggregate([
          { $match: { restaurant: restaurantDoc._id, restaurantRating: { $exists: true, $ne: null } } },
          { $group: { _id: null, average: { $avg: '$restaurantRating' }, count: { $sum: 1 } } },
        ]);
        if (rStats.length > 0) {
          restaurantDoc.rating = { average: Math.round(rStats[0].average * 10) / 10, count: rStats[0].count, lastRatedAt: new Date() };
          await restaurantDoc.save();
        }
      }
    }
    order.isRated = true;
    await order.save();
    res.status(201).json({
      success: true,
      message: "Rated successfully",
      riderNewRating,
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// POST /orders/restaurant/:id/rate-rider — restaurant owner rates the rider
exports.rateRiderByRestaurant = async (req, res) => {
  try {
    if (!req.user || !isValidObjectId(req.user._id)) {
      return sendError(res, 401, "Unauthorized");
    }

    const numericRating = Number(req.body.rating);
    const comment = typeof req.body.comment === "string" ? req.body.comment.trim() : "";
    if (!Number.isFinite(numericRating) || numericRating < 1 || numericRating > 5) {
      return sendError(res, 400, "Rating must be between 1 and 5");
    }

    const restaurant = await Restaurant.findOne({ owner: req.user._id }).select("_id");
    if (!restaurant) return sendError(res, 404, "Restaurant not found");

    const order = await Order.findById(req.params.id);
    if (!order) return sendError(res, 404, "Order not found");
    if (order.restaurant.toString() !== restaurant._id.toString()) {
      return sendError(res, 403, "Access denied");
    }
    if (order.status !== "delivered") {
      return sendError(res, 400, "Can only rate after delivery");
    }
    if (order.restaurantRatedRider) {
      return sendError(res, 400, "You have already rated the rider for this order");
    }
    if (!order.rider) {
      return sendError(res, 400, "No rider assigned to this order");
    }

    const riderDoc = await Rider.findById(order.rider);
    let riderNewRating = 0;
    if (riderDoc) {
      const existing = riderDoc.rating || {};
      const prevCount = Number(existing.count) || 0;
      const prevAvg = Number(existing.average) || 0;
      const newCount = prevCount + 1;
      const newAvg = Math.round(((prevAvg * prevCount + numericRating) / newCount) * 10) / 10;

      riderDoc.rating = {
        average: newAvg,
        count: newCount,
        breakdown: {
          five: (existing.breakdown?.five || 0) + (numericRating === 5 ? 1 : 0),
          four: (existing.breakdown?.four || 0) + (numericRating === 4 ? 1 : 0),
          three: (existing.breakdown?.three || 0) + (numericRating === 3 ? 1 : 0),
          two: (existing.breakdown?.two || 0) + (numericRating === 2 ? 1 : 0),
          one: (existing.breakdown?.one || 0) + (numericRating === 1 ? 1 : 0),
        },
        lastRatedAt: new Date(),
      };
      await riderDoc.save();
      riderNewRating = newAvg;
    }

    order.restaurantRatedRider = true;
    order.timeline = order.timeline || [];
    order.timeline.push({
      status: order.status,
      timestamp: new Date(),
      label: "Rider Rated",
      by: "restaurant_owner",
      description: comment || "Restaurant rated rider",
    });
    await order.save();

    return res.status(201).json({
      success: true,
      message: "Rider rated successfully",
      riderNewRating,
    });
  } catch (error) {
    return sendError(res, 500, "Failed to submit rating", error.message);
  }
};
function getStatusLabel(status) {
  const labels = {
    'placed': 'Order Placed',
    'accepted': 'Restaurant Accepted',
    'preparing': 'Preparing',
    'ready': 'Ready for Pickup',
    'assigned': 'Rider Assigned',
    'reached_restaurant': 'Rider at Restaurant',
    'picked_up': 'Picked Up',
    'delivery_arrived': 'Rider Arrived',
    'delivered': 'Delivered',
    'cancelled': 'Cancelled'
  };
  return labels[status] || status;
}
function getStatusDescription(status) {
  const descriptions = {
    'placed': 'Your order has been placed',
    'accepted': 'Restaurant has accepted your order',
    'preparing': 'Chef is preparing your food',
    'ready': 'Your food is ready. Waiting for rider to pick up',
    'assigned': 'A rider has been assigned',
    'reached_restaurant': 'Rider has arrived at the restaurant',
    'picked_up': 'Rider has picked up your order',
    'delivery_arrived': 'Rider is at your location',
    'delivered': 'Your order has been delivered',
    'cancelled': 'Order has been cancelled'
  };
  return descriptions[status] || '';
}
function getStatusIcon(status) {
  const icons = {
    'placed': 'order_placed',
    'accepted': 'check_circle',
    'preparing': 'cooking',
    'ready': 'inventory',
    'assigned': 'two_wheeler',
    'reached_restaurant': 'location_on',
    'picked_up': 'local_shipping',
    'delivery_arrived': 'home',
    'delivered': 'celebration',
    'cancelled': 'cancel'
  };
  return icons[status] || 'pending';
}
exports.updateOrderStatus = async (req, res) => {
  try {
    const { status } = req.body;
    const order = await Order.findById(req.params.id);
    if (!order) return res.status(404).json({ message: "Order not found" });
    if (status === "accepted" && req.user?.role === "restaurant_owner") {
      if (order.paymentMethod === "online" && order.paymentStatus !== "paid") {
        logger.warn("Restaurant attempted to accept unpaid online order", {
          orderId: order._id,
          paymentMethod: order.paymentMethod,
          paymentStatus: order.paymentStatus,
          restaurantOwnerId: req.user._id,
        });
        return res.status(400).json({
          message: "Cannot accept order with unpaid online payment",
          error: "Payment must be completed before acceptance",
          paymentStatus: order.paymentStatus,
        });
      }
      const validation = validateRestaurantAcceptance(order);
      if (!validation.valid) {
        logger.warn("Restaurant acceptance validation failed", {
          orderId: order._id,
          error: validation.error,
        });
        return res.status(400).json({
          message: "Cannot accept order",
          error: validation.error,
        });
      }
      logRestaurantAction(order._id, order.restaurant, "accepted");
    }
    const isAdmin = req.user?.role === "admin";
    const validation = validateOrderState(order.status, status, isAdmin);
    if (!validation.valid) {
      logger.warn("Invalid order state transition attempted", {
        orderId: order._id,
        currentStatus: order.status,
        attemptedStatus: status,
        userId: req.user?.userId,
        error: validation.error,
      });
      return res.status(400).json({
        message: "Invalid status transition",
        error: validation.error,
        currentStatus: order.status,
        allowedTransitions: validation.error,
      });
    }
    const oldStatus = order.status;
    order.status = status;
    const timelineLabels = {
      'placed': { label: 'Order Placed', description: 'Your order has been placed' },
      'accepted': { label: 'Restaurant Accepted', description: 'Restaurant has accepted your order' },
      'preparing': { label: 'Preparing', description: 'Chef is preparing your food' },
      'ready': { label: 'Ready for Pickup', description: 'Your food is ready. Waiting for rider to pick up' },
      'assigned': { label: 'Rider Assigned', description: 'A rider has been assigned' },
      'reached_restaurant': { label: 'Rider at Restaurant', description: 'Rider has arrived at the restaurant' },
      'picked_up': { label: 'Picked Up', description: 'Rider has picked up your order' },
      'delivery_arrived': { label: 'Rider Arrived', description: 'Rider is at your location' },
      'delivered': { label: 'Delivered', description: 'Your order has been delivered' },
      'cancelled': { label: 'Order Cancelled', description: 'Order has been cancelled' }
    };
    const timeline = timelineLabels[status] || { label: status, description: '' };
    order.timeline.push({
      status,
      timestamp: new Date(),
      label: timeline.label,
      by: req.user?.role || 'system',
      description: timeline.description
    });
    if (status === "accepted" && oldStatus === "placed") {
      if (!order.riderNotificationStatus) order.riderNotificationStatus = {};
      order.riderNotificationStatus.notified = true;
      order.riderNotificationStatus.notifiedAt = new Date();
    }
    await order.save();
    if (status === "accepted" && oldStatus !== "accepted") {
      await Restaurant.findByIdAndUpdate(
        order.restaurant,
        {
          $inc: {
          },
        },
        { new: true },
      );
    }
    if (status === "delivered" && oldStatus !== "delivered") {
      order.deliveredAt = new Date();
      await order.save();
      await Restaurant.findByIdAndUpdate(
        order.restaurant,
        {
          $inc: {
            totalDeliveries: 1,
            successfulOrders: 1,
          },
        },
        { new: true },
      );
      try {
        const settlementResult = await processSettlement(order._id, { trigger: 'orderController.updateOrderStatus' });
        if (order.rider) {
          const settlementPayload = {
            orderId: order._id,
            status: settlementResult?.alreadyProcessed ? 'already_processed' : 'processed',
            paymentMethod: order.paymentMethod,
            rider: settlementResult?.rider || null,
            restaurant: settlementResult?.restaurant || null,
            admin: settlementResult?.admin || null,
            timestamp: new Date(),
          };
          socketService.emitToRider(order.rider.toString(), 'rider:earnings_updated', settlementPayload);
          // Also emit to rider:<userId> room for robustness
          const riderDocForEmit = await Rider.findById(order.rider).select('user').lean();
          if (riderDocForEmit?.user) {
            socketService.emitToRider(riderDocForEmit.user.toString(), 'rider:earnings_updated', settlementPayload);
          }
          socketService.emitToRestaurant(order.restaurant.toString(), 'restaurant:earnings_updated', settlementPayload);
          socketService.emitToAdmin('earnings:updated', settlementPayload);
        }
      } catch (payErr) {
        logger.error("Failed to trigger payment processing on delivery", { orderId: order._id, error: payErr.message });
      }
    }
    if (status === "accepted" && oldStatus !== "accepted") {
      const riderDispatchService = require('../services/riderDispatchService');
      riderDispatchService.findAndNotifyRider(order._id);
    }
    logOrderTransition(
      order._id,
      oldStatus,
      status,
      req.user?.userId,
      req.user?.role,
    );
    try {
      const populatedOrder = await Order.findById(order._id)
        .populate('customer', 'name _id')
        .populate('restaurant', 'name _id owner')
        .populate({ path: 'rider', select: 'user vehicle', populate: { path: 'user', select: '_id name mobile' } });
      const updateData = {
        orderId: order._id,
        status: status,
        oldStatus: oldStatus,
        timestamp: new Date(),
      };
      const customerMessage = getCustomerStatusMessage(status, populatedOrder.restaurant?.name);
      socketService.emitToCustomer(
        populatedOrder.customer._id.toString(),
        'order:status',
        {
          ...updateData,
          message: customerMessage,
        },
      );
      if (['accepted', 'preparing', 'ready', 'assigned', 'picked_up', 'delivery_arrived', 'delivered', 'cancelled'].includes(status)) {
        try {
          await sendNotification(
            populatedOrder.customer._id,
            getCustomerNotificationTitle(status),
            customerMessage,
            { orderId: order._id.toString(), status, type: 'order_status' }
          );
        } catch (e) {
          logger.error("Failed to send customer push notification", { error: e.message, orderId: order._id });
        }
      }
      socketService.emitToRestaurant(
        populatedOrder.restaurant._id.toString(),
        "order:status",
        updateData,
      );
      if (['assigned', 'reached_restaurant', 'picked_up', 'delivered', 'cancelled'].includes(status) && populatedOrder.restaurant?.owner) {
        try {
          await sendNotification(
            populatedOrder.restaurant.owner,
            getRestaurantNotificationTitle(status),
            getRestaurantStatusMessage(status, order._id),
            { orderId: order._id.toString(), status, type: 'order_status' }
          );
        } catch (e) {
          logger.error("Failed to send restaurant push notification", { error: e.message, orderId: order._id });
        }
      }
      if (populatedOrder.rider?.user) {
        const riderUserId = populatedOrder.rider.user._id.toString();
        socketService.emitToRider(riderUserId, 'order:status', updateData);
        if (status === 'accepted' && oldStatus === 'placed') {
          socketService.emitToRider(riderUserId, 'order:accepted', {
            orderId: order._id.toString(),
            status: 'accepted',
            customerName: populatedOrder.customer.name,
            restaurantName: populatedOrder.restaurant.name,
            totalAmount: order.totalAmount,
            timestamp: new Date(),
            message: 'New order accepted by restaurant'
          });
        }
        if (['preparing', 'ready', 'cancelled'].includes(status)) {
          try {
            const riderMessage = getRiderStatusMessage(status, populatedOrder.restaurant?.name);
            await sendNotification(
              riderUserId,
              getRiderNotificationTitle(status),
              riderMessage,
              { orderId: order._id.toString(), status, type: 'order_status' }
            );
          } catch (e) {
            logger.error("Failed to send rider push notification", { error: e.message, orderId: order._id });
          }
        }
      }
      socketService.emitToAdmin("order:status", {
        ...updateData,
        customerName: populatedOrder.customer.name,
        restaurantName: populatedOrder.restaurant.name,
        riderName: populatedOrder.rider?.user?.name,
        totalAmount: order.totalAmount,
        amount: order.totalAmount,
      });
      if (status === 'cancelled') {
        const cancelData = {
          orderId: order._id,
          status: 'cancelled',
          reason: order.cancellationReason || 'Order cancelled',
          timestamp: new Date(),
        };
        socketService.emitToUser(populatedOrder.customer._id.toString(), 'order:cancelled', {
          ...cancelData,
          message: 'Your order has been cancelled'
        });
        socketService.emitToRestaurant(populatedOrder.restaurant._id.toString(), 'order:cancelled', cancelData);
        if (populatedOrder.rider?.user) {
          socketService.emitToRider(populatedOrder.rider.user._id.toString(), 'order:cancelled', {
            ...cancelData,
            message: 'Order has been cancelled'
          });
        }
      }
    } catch (socketError) {
      logger.error("Socket emission error in updateOrderStatus", {
        orderId: order._id,
        error: socketError.message,
      });
    }
    res.json({ message: "Status updated", order });
  } catch (error) {
    logger.error("Failed to update order status", { error: error.message });
    res.status(500).json({ message: error.message });
  }
};
function getCustomerStatusMessage(status, restaurantName) {
  const messages = {
    'placed': 'Your order has been placed successfully',
    'accepted': `${restaurantName || 'Restaurant'} has accepted your order`,
    'preparing': 'Chef is preparing your delicious food',
    'ready': 'Your order is ready and waiting for pickup',
    'assigned': 'A rider has been assigned to deliver your order',
    'reached_restaurant': 'Rider has arrived at the restaurant',
    'picked_up': 'Your order is on the way!',
    'delivery_arrived': 'Rider has arrived at your location',
    'delivered': 'Your order has been delivered. Enjoy your meal!',
    'cancelled': 'Your order has been cancelled'
  };
  return messages[status] || `Your order is now ${status}`;
}
function getCustomerNotificationTitle(status) {
  const titles = {
    'accepted': 'Order Accepted!',
    'preparing': 'Cooking Started',
    'ready': 'Order Ready!',
    'assigned': 'Rider Assigned',
    'picked_up': 'Out for Delivery',
    'delivery_arrived': 'Rider Arrived!',
    'delivered': 'Delivered Successfully',
    'cancelled': 'Order Cancelled'
  };
  return titles[status] || 'Order Update';
}
function getRestaurantStatusMessage(status, orderId) {
  const orderRef = orderId.toString().slice(-6);
  const messages = {
    'assigned': `Rider assigned to Order #${orderRef}`,
    'reached_restaurant': `Rider arrived for Order #${orderRef}`,
    'picked_up': `Order #${orderRef} picked up successfully`,
    'delivered': `Order #${orderRef} delivered successfully`,
    'cancelled': `Order #${orderRef} has been cancelled`
  };
  return messages[status] || `Order #${orderRef} status: ${status}`;
}
function getRestaurantNotificationTitle(status) {
  const titles = {
    'assigned': 'Rider Assigned',
    'reached_restaurant': 'Rider Arrived',
    'picked_up': 'Order Picked Up',
    'delivered': 'Order Delivered',
    'cancelled': 'Order Cancelled'
  };
  return titles[status] || 'Order Update';
}
function getRiderStatusMessage(status, restaurantName) {
  const messages = {
    'preparing': `${restaurantName || 'Restaurant'} is preparing the order`,
    'ready': `Order is ready for pickup at ${restaurantName || 'Restaurant'}!`,
    'cancelled': 'Order has been cancelled'
  };
  return messages[status] || `Order status: ${status}`;
}
function getRiderNotificationTitle(status) {
  const titles = {
    'preparing': 'Food Being Prepared',
    'ready': 'Order Ready for Pickup!',
    'cancelled': 'Order Cancelled'
  };
  return titles[status] || 'Order Update';
}
exports.markOrderReady = async (req, res) => {
  try {
    const order = await Order.findById(req.params.id)
      .populate("customer", "name")
      .populate("restaurant", "name")
      .populate({ path: "rider", select: "user", populate: { path: "user", select: "_id name mobile" } });
    if (!order) return res.status(404).json({ message: "Order not found" });
    const validation = validateRestaurantMarkReady(order);
    if (!validation.valid) {
      logger.warn("Invalid mark ready attempt", {
        orderId: order._id,
        currentStatus: order.status,
        error: validation.error,
      });
      return res.status(400).json({
        message: "Cannot mark order ready",
        error: validation.error,
      });
    }
    const oldStatus = order.status;
    order.status = "ready";
    order.timeline.push({ status: "ready", timestamp: new Date() });
    await order.save();
    logOrderTransition(
      order._id,
      oldStatus,
      "ready",
      req.user?.userId,
      "restaurant_owner",
    );
    let restaurantName = "";
    let restaurantCoords = null;
    try {
      const restaurantDoc = await Restaurant.findById(order.restaurant).select("name location");
      restaurantName = restaurantDoc?.name || "";
      restaurantCoords = restaurantDoc?.location?.coordinates;
    } catch (e) { }
    if (order.rider) {
      const readyPayload = {
        orderId: order._id.toString(),
        message: 'Order is Ready for Pickup!',
        restaurantName,
        status: 'ready',
        timestamp: new Date()
      };
      // Emit to rider:<riderId> room AND rider:<userId> room for robustness.
      // The rider joins both at socket connect time; either room will deliver the event.
      socketService.emitToRider(order.rider._id.toString(), 'order:ready', readyPayload);
      if (order.rider.user?._id) {
        socketService.emitToRider(order.rider.user._id.toString(), 'order:ready', readyPayload);
      }
      try {
        const riderUserId = order.rider.user?._id || order.rider.user;
        if (riderUserId) {
          await sendNotification(
            riderUserId,
            "Order Ready For Pickup!",
            `${restaurantName} - Your food is ready - ₹${order.totalAmount}`
          );
        }
      } catch (e) {
        console.error("Push notify error for assigned rider", e);
      }
    } else {
      try {
        if (restaurantCoords && restaurantCoords.length === 2) {
          const nearbyRiders = await Rider.find({
            currentLocation: {
              $near: {
                $geometry: {
                  type: "Point",
                  coordinates: [restaurantCoords[0], restaurantCoords[1]]
                },
                $maxDistance: 1000000  // Dev: 1000km (production: 15km for ready orders - wider radius)
              }
            },
            isOnline: true,
            isAvailable: true,
            verificationStatus: 'approved'
          }).select('_id user');
          if (nearbyRiders.length > 0) {
            console.log(`[Notification #2B] Found ${nearbyRiders.length} unassigned nearby riders (closest first)`);
            const notificationPromises = nearbyRiders.map(async (rider) => {
              try {
                const riderUser = await User.findById(rider.user).select('_id');
                if (riderUser) {
                  await sendNotification(
                    riderUser._id,
                    "Order Ready - Pick It Up Now!",
                    `${restaurantName} - Food ready now - ₹${order.totalAmount}`,
                    {
                      orderId: order._id.toString(),
                      restaurantId: order.restaurant.toString(),
                      type: "order_ready",
                      priority: "high"
                    }
                  );
                  return {
                    riderId: rider._id,
                    notifiedAt: new Date(),
                    status: 'sent',
                    reason: 'order_ready'
                  };
                }
              } catch (e) {
                logger.error("Failed to notify rider on ready", { error: e.message, riderId: rider._id });
                return null;
              }
            });
            const results = await Promise.all(notificationPromises);
            const sent = results.filter(r => r !== null);
            if (sent.length > 0) {
              const existing = order.riderNotificationStatus?.notifiedRiders || [];
              const riderMap = new Map(existing.map(entry => [entry.riderId.toString(), entry]));
              sent.forEach(entry => {
                riderMap.set(entry.riderId.toString(), entry);
              });
              if (!order.riderNotificationStatus) order.riderNotificationStatus = {};
              order.riderNotificationStatus.notified = true;
              order.riderNotificationStatus.notifiedAt = new Date();
              order.riderNotificationStatus.notifiedRiders = Array.from(riderMap.values());
              await order.save();
              logger.info("Notified riders when order ready", {
                orderId: order._id,
                riderCount: sent.length,
                nearRestaurant: restaurantName
              });
            }
          }
        }
      } catch (err) {
        logger.error("Failed to notify nearby riders on ready", { error: err.message, orderId: order._id });
      }
      // Re-trigger the full socket dispatch so riders get a RideRequest they can accept
      try {
        const riderDispatchService = require('../services/riderDispatchService');
        riderDispatchService.findAndNotifyRider(order._id);
      } catch (e) {
        logger.error("Failed to trigger rider dispatch on ready", { error: e.message, orderId: order._id });
      }
    }
    try {
      const updateData = {
        orderId: order._id,
        status: "ready",
        oldStatus,
        timestamp: new Date(),
      };
      if (order.customer?._id) {
        socketService.emitToUser(
          order.customer._id.toString(),
          "order:status",
          {
            ...updateData,
            message: "Your order is now ready",
          },
        );
      }
      if (order.restaurant?._id) {
        socketService.emitToRestaurant(
          order.restaurant._id.toString(),
          "order:status",
          updateData,
        );
      }
      if (order.rider?._id) {
        socketService.emitToRider(
          order.rider._id.toString(),
          "order:status",
          updateData,
        );
      }
      socketService.emitToAdmin("order:status", {
        ...updateData,
        customerName: order.customer?.name,
        restaurantName: order.restaurant?.name,
        riderName: order.rider?.name,
        totalAmount: order.totalAmount,
        amount: order.totalAmount,
      });
    } catch (socketError) {
      logger.error("Socket emission error in markOrderReady", {
        orderId: order._id,
        error: socketError.message,
      });
    }
    res.status(200).json({
      message: "Order marked Ready. Riders notified.",
      order,
    });
  } catch (error) {
    logger.error("Failed to mark order ready", { error: error.message });
    res.status(500).json({ message: error.message });
  }
};
exports.searchRidersForOrder = async (req, res) => {
  try {
    const order = await Order.findById(req.params.id);
    if (!order) return res.status(404).json({ message: "Order not found" });
    if (order.rider) {
      return res.status(400).json({ message: "Order already assigned to a rider" });
    }
    if (!['accepted', 'ready'].includes(order.status)) {
      return res.status(400).json({
        message: "Order is not eligible for rider search",
        status: order.status,
      });
    }
    const restaurant = await Restaurant.findById(order.restaurant).select("name location");
    const restaurantCoords = restaurant?.location?.coordinates;
    if (!restaurant || !restaurantCoords || restaurantCoords.length !== 2) {
      return res.status(400).json({ message: "Restaurant location missing" });
    }
    const RideRequest = require('../models/RideRequest');
    await RideRequest.deleteMany({
      order: order._id,
      status: { $in: ['timeout', 'rejected'] }
    });
    const nearbyRiderCount = await Rider.countDocuments({
      currentLocation: {
        $near: {
          $geometry: {
            type: "Point",
            coordinates: [restaurantCoords[0], restaurantCoords[1]],
          },
          $maxDistance: 1000000, // Match dispatch service radius (1000km dev)
        },
      },
      isOnline: true,
      isAvailable: true,
      verificationStatus: 'approved',
    });
    if (nearbyRiderCount === 0) {
      logger.info('[SearchRiders] No online riders found, emitting no_rider_found immediately', {
        orderId: order._id,
        restaurantId: order.restaurant.toString(),
      });
      socketService.emitToRestaurant(order.restaurant.toString(), 'order:no_rider_found', {
        orderId: order._id,
        message: 'No riders available nearby',
      });
      return res.status(200).json({
        success: true,
        message: "No riders available nearby",
        count: 0,
        orderId: order._id,
      });
    }
    logger.info(`[SearchRiders] Found ${nearbyRiderCount} online riders, triggering dispatch`, {
      orderId: order._id,
    });
    try {
      const riderDispatchService = require('../services/riderDispatchService');
      riderDispatchService.findAndNotifyRider(order._id);
    } catch (e) {
      console.warn("Error triggering rider dispatch after manual search", { error: e.message, orderId: order._id });
    }
    try {
      const nearbyRiders = await Rider.find({
        currentLocation: {
          $near: {
            $geometry: {
              type: "Point",
              coordinates: [restaurantCoords[0], restaurantCoords[1]],
            },
            $maxDistance: 100000,
          },
        },
        isOnline: true,
        isAvailable: true,
        verificationStatus: 'approved',
      }).select('_id user').limit(10);
      const notificationPromises = nearbyRiders.map(async (rider) => {
        try {
          const riderUser = await User.findById(rider.user).select('_id');
          if (!riderUser) return null;
          await sendNotification(
            riderUser._id,
            "New Order Available",
            `Order at ${restaurant.name.en || restaurant.name} - ₹${order.totalAmount}`,
            {
              orderId: order._id.toString(),
              restaurantId: order.restaurant.toString(),
              type: "order_available",
              reason: "manual_search",
            }
          );
          return { riderId: rider._id, notifiedAt: new Date(), status: 'sent' };
        } catch (notifErr) {
          return null;
        }
      });
      const results = await Promise.all(notificationPromises);
      const sent = results.filter((entry) => entry !== null);
      if (sent.length > 0) {
        const existing = order.riderNotificationStatus?.notifiedRiders || [];
        const riderMap = new Map(existing.map((entry) => [entry.riderId.toString(), entry]));
        sent.forEach((entry) => riderMap.set(entry.riderId.toString(), entry));
        order.riderNotificationStatus.notified = true;
        order.riderNotificationStatus.notifiedAt = new Date();
        order.riderNotificationStatus.notifiedRiders = Array.from(riderMap.values());
        await order.save();
      }
    } catch (pushErr) {
      logger.warn('[SearchRiders] Push notification error (non-blocking):', pushErr.message);
    }
    return res.status(200).json({
      success: true,
      message: "Rider search initiated",
      count: nearbyRiderCount,
      orderId: order._id,
    });
  } catch (error) {
    logger.error("Failed to search riders for order", { error: error.message });
    return res.status(500).json({ message: error.message });
  }
};
exports.trackOrder = async (req, res) => {
  try {
    const { calculateDistance, calculateETA } = require('../utils/locationUtils');
    const order = await Order.findById(req.params.id)
      .populate("restaurant", "location name address")
      .populate("rider", "user currentLocation vehicle")
      .populate("rider.user", "name mobile");
    if (!order) return res.status(404).json({ message: "Order not found" });
    let liveLocation = null;
    let distanceInfo = null;
    if (order.rider && order.rider.currentLocation && order.deliveryAddress) {
      liveLocation = order.rider.currentLocation;
      const riderCoords = order.rider.currentLocation.coordinates;
      const customerCoords = order.deliveryAddress.coordinates;
      const restaurantCoords = order.restaurant?.location?.coordinates;
      if (riderCoords && customerCoords && riderCoords.length === 2 && customerCoords.length === 2) {
        const distanceToCustomer = calculateDistance(riderCoords, customerCoords);
        const etaInfo = calculateETA(riderCoords, customerCoords, order.status);
        let pickupDistance = null;
        if (restaurantCoords && restaurantCoords.length === 2) {
          const distanceToRestaurant = calculateDistance(riderCoords, restaurantCoords);
          pickupDistance = Math.round(distanceToRestaurant * 100) / 100;
        }
        distanceInfo = {
          distanceToCustomer: Math.round(distanceToCustomer * 100) / 100,
          distanceToRestaurant: pickupDistance,
          etaMinutes: etaInfo.minutes,
          etaDisplay: etaInfo.display
        };
      }
    }
    const formattedRestaurant = formatRestaurantForUser(order.restaurant);
    res.status(200).json({
      status: order.status,
      timeline: order.timeline,
      eta: order.estimatedDeliveryTime,
      restaurant: formattedRestaurant,
      rider: order.rider
        ? {
          name: order.rider.name,
          phone: order.rider.contactNumber,
          location: liveLocation,
          vehicle: order.rider.vehicle,
        }
        : null,
      deliveryLocation: order.deliveryAddress,
      supportPhone: "+1-800-FOOD-APP",
      ...(distanceInfo && { distances: distanceInfo })  // ✅ NEW: Include distance
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};
exports.reorder = async (req, res) => {
  try {
    const oldOrder = await Order.findById(req.params.id);
    if (!oldOrder) return res.status(404).json({ message: "Order not found" });
    const Cart = require("../models/Cart");
    let cart = await Cart.findOne({ user: req.user._id });
    if (cart) {
      cart.items = [];
      cart.restaurant = oldOrder.restaurant;
    } else {
      cart = new Cart({
        user: req.user._id,
        restaurant: oldOrder.restaurant,
        items: [],
      });
    }
    oldOrder.items.forEach((item) => {
      cart.items.push({
        product: item.product,
        name: item.name,
        quantity: item.quantity,
        price: item.price,
        variation: item.variation,
        addOns: item.addOns,
      });
    });
    await cart.save();
    res.status(200).json({ message: "Items added to cart", cartId: cart._id });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};
exports.reportIssue = async (req, res) => {
  try {
    const { issue } = req.body; // e.g., "Food spilled", "Missing item"
    const order = await Order.findById(req.params.id);
    if (!order) return res.status(404).json({ message: "Order not found" });
    order.status = "issue_reported";
    order.issueReported = issue;
    await order.save();
    res
      .status(200)
      .json({ message: "Issue reported. Support will contact you." });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};
exports.getAllOrdersAdmin = async (req, res) => {
  try {
    const { page, limit, skip } = getPaginationParams(req, 50);
    const { status, date, orderId, rider, restaurant, restaurantId } = req.query;
    const search = req.query.search ? req.query.search.trim() : null;
    let query = {};

    if (status && status !== "all") query.status = status;
    if (orderId) query._id = orderId;
    if (rider) query.rider = rider;
    if (restaurant) query.restaurant = restaurant;
    if (restaurantId) query.restaurant = restaurantId;

    if (date) {
      const start = new Date(date);
      const end = new Date(date);
      end.setHours(23, 59, 59, 999);
      query.createdAt = { $gte: start, $lte: end };
    }

    // Handle search by customer name, mobile, or order ID
    if (search) {
      const users = await User.find({
        $or: [
          { name: { $regex: search, $options: 'i' } },
          { mobile: { $regex: search, $options: 'i' } }
        ]
      }).select('_id');
      const userIds = users.map(u => u._id);
      const searchConditions = [];
      if (userIds.length > 0) {
        searchConditions.push({ customer: { $in: userIds } });
      }
      // Only add ObjectId condition if it's a valid 24-char hex ID
      if (mongoose.Types.ObjectId.isValid(search) && search.length === 24) {
        searchConditions.push({ _id: search });
      }
      // Only apply $or if we have at least one condition
      if (searchConditions.length > 0) {
        query.$or = searchConditions;
      }
    }

    const total = await Order.countDocuments(query);
    const orders = await Order.find(query)
      .populate("customer", "name email mobile")
      .populate("restaurant", "name address contactNumber")
      .populate("rider", "user")
      .populate("rider.user", "name mobile profilePic")
      .skip(skip)
      .limit(limit)
      .sort({ createdAt: -1 })
      .lean();

    // Attach a lightweight billing flag (billingGenerated) to each order
    const orderIds = orders.map(o => o._id);
    const billedOrderIds = await CustomerBill.distinct('order', { order: { $in: orderIds } });
    const billedSet = new Set(billedOrderIds.map(id => id.toString()));
    const ordersWithBillingFlag = orders.map(o => ({
      ...o,
      billingGenerated: billedSet.has(o._id.toString()),
    }));

    res.status(200).json({
      orders: ordersWithBillingFlag,
      total,
      page,
      limit,
      pages: Math.ceil(total / limit),
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};
exports.getFailedOrdersAdmin = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const { from, to, search } = req.query;
    const query = { status: "failed" };
    if (from) query.createdAt = { $gte: new Date(from) };
    if (to)
      query.createdAt = query.createdAt
        ? { ...query.createdAt, $lte: new Date(to) }
        : { $lte: new Date(to) };
    if (search)
      query.$or = [
        { "customer.name": { $regex: search, $options: "i" } },
        { cancellationReason: { $regex: search, $options: "i" } },
        { failureReason: { $regex: search, $options: "i" } },
      ];
    const orders = await Order.find(query)
      .populate("customer", "name email mobile")
      .populate("restaurant", "name")
      .populate("rider", "user")
      .populate("rider.user", "name")
      .skip((page - 1) * limit)
      .limit(limit)
      .sort({ createdAt: -1 });
    const total = await Order.countDocuments(query);
    res.status(200).json({ orders, total, page, limit });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};
exports.adminRetryPayment = async (req, res) => {
  try {
    const { result = "paid", note } = req.body; // result = 'paid' | 'failed'
    const order = await Order.findById(req.params.id);
    if (!order) return res.status(404).json({ message: "Order not found" });
    if (order.status !== "failed" && order.paymentStatus !== "failed") {
      return res.status(400).json({ message: "Order is not in failed state" });
    }
    order.retryCount = (order.retryCount || 0) + 1;
    order.lastRetryAt = new Date();
    if (result === "paid") {
      order.paymentStatus = "paid";
      order.status = "placed";
      order.timeline.push({
        status: "payment_retried_paid",
        timestamp: new Date(),
        note: note || "Payment retried by admin and succeeded",
      });
      await order.save();
      try {
        await sendNotification(
          order.customer,
          "Payment Successful",
          `Payment retried and succeeded for Order ${order._id}`,
        );
      } catch (e) { }
      try {
        const restaurant = await Restaurant.findById(order.restaurant).populate(
          "owner",
        );
        if (restaurant && restaurant.owner)
          await sendNotification(
            restaurant.owner._id,
            "Order Received",
            `Order #${order._id} is now placed after payment retry.`,
          );
      } catch (e) { }
      return res
        .status(200)
        .json({ message: "Payment retried and succeeded", order });
    } else {
      order.paymentStatus = "failed";
      order.failureReason = note || "Payment retry failed";
      order.timeline.push({
        status: "payment_retried_failed",
        timestamp: new Date(),
        note: note || "Payment retried by admin and failed",
      });
      await order.save();
      try {
        await sendNotification(
          order.customer,
          "Payment Retry Failed",
          `We retried payment for Order ${order._id} but it failed.`,
        );
      } catch (e) { }
      return res
        .status(200)
        .json({ message: "Payment retried and failed", order });
    }
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};
exports.adminResolveFailedOrder = async (req, res) => {
  try {
    const { resolutionNote } = req.body;
    const order = await Order.findById(req.params.id);
    if (!order) return res.status(404).json({ message: "Order not found" });
    order.status = "cancelled";
    order.cancellationReason =
      resolutionNote || "Cancelled by admin after failed payment";
    order.timeline.push({
      status: "cancelled",
      timestamp: new Date(),
      note: order.cancellationReason,
    });
    await order.save();
    res.status(200).json({ message: "Order cancelled/resolved", order });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};
exports.getOrderDetailsAdmin = async (req, res) => {
  try {
    const order = await Order.findById(req.params.id)
      .populate("customer", "name email mobile profilePic walletBalance totalOrders")
      .populate("restaurant", "name email contactNumber address city image adminCommission packagingCharge")
      .populate({
        path: "rider",
        select: "user vehicle rating totalEarnings currentBalance",
        populate: { path: "user", select: "name email mobile profilePic" },
      })
      .populate("items.product", "name image basePrice gstPercent adminCommissionPercent")
      .lean();

    if (!order) return res.status(404).json({ message: "Order not found" });

    // Fetch billing records (generated after delivery settlement)
    const [customerBill, restaurantBill, riderBill] = await Promise.all([
      CustomerBill.findOne({ order: order._id }).lean(),
      RestaurantBill.findOne({ order: order._id }).lean(),
      RiderBill.findOne({ order: order._id }).lean(),
    ]);

    res.status(200).json({
      success: true,
      order,
      billing: {
        generated: !!customerBill,
        customerBill:    customerBill    || null,
        restaurantBill:  restaurantBill  || null,
        riderBill:       riderBill       || null,
      },
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};
exports.adminAssignRider = async (req, res) => {
  try {
    const { riderId } = req.body;
    const order = await Order.findById(req.params.id);
    if (!order) return res.status(404).json({ message: "Order not found" });
    const rider = await Rider.findById(riderId);
    if (!rider) return res.status(404).json({ message: "Rider not found" });
    order.rider = riderId;
    order.status = "assigned"; // Force status update
    order.timeline.push({
      status: "assigned",
      timestamp: new Date(),
      note: "Admin manually reassigned rider",
    });
    await order.save();
    res.status(200).json({ message: "Rider reassigned successfully", order });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};
exports.adminUpdateStatus = async (req, res) => {
  try {
    const { status } = req.body;
    const order = await Order.findById(req.params.id);
    if (!order) return res.status(404).json({ message: "Order not found" });
    const oldStatus = order.status;
    order.status = status;
    if (status === "delivered" && oldStatus !== "delivered") {
      order.deliveredAt = new Date();
    }
    order.timeline.push({
      status: status,
      timestamp: new Date(),
      note: "Admin status override",
    });
    await order.save();

    if (status === "delivered" && oldStatus !== "delivered") {
      await Restaurant.findByIdAndUpdate(
        order.restaurant,
        {
          $inc: {
            totalDeliveries: 1,
            successfulOrders: 1,
          },
        },
        { new: true },
      );

      try {
        const settlementResult = await processSettlement(order._id, { trigger: 'orderController.adminUpdateStatus' });
        if (order.rider) {
          const settlementPayload = {
            orderId: order._id,
            status: settlementResult?.alreadyProcessed ? 'already_processed' : 'processed',
            paymentMethod: order.paymentMethod,
            rider: settlementResult?.rider || null,
            restaurant: settlementResult?.restaurant || null,
            admin: settlementResult?.admin || null,
            timestamp: new Date(),
          };
          socketService.emitToRider(order.rider.toString(), 'rider:earnings_updated', settlementPayload);
          // Also emit to rider:<userId> room for robustness
          const riderDocForEmitAdmin = await Rider.findById(order.rider).select('user').lean();
          if (riderDocForEmitAdmin?.user) {
            socketService.emitToRider(riderDocForEmitAdmin.user.toString(), 'rider:earnings_updated', settlementPayload);
          }
          socketService.emitToRestaurant(order.restaurant.toString(), 'restaurant:earnings_updated', settlementPayload);
          socketService.emitToAdmin('earnings:updated', settlementPayload);
        }
      } catch (payErr) {
        logger.error("Failed to trigger payment processing on admin delivered update", {
          orderId: order._id,
          error: payErr.message,
        });
      }
    }

    res.status(200).json({ message: "Status updated by Admin", order });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};
exports.adminCancelOrder = async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();
  try {
    const { reason, refundAmount } = req.body;
    const order = await Order.findById(req.params.id);
    if (!order) {
      await session.abortTransaction();
      return res.status(404).json({ message: "Order not found" });
    }
    if (order.status === "cancelled") {
      await session.abortTransaction();
      return res.status(400).json({ message: "Order is already cancelled" });
    }
    order.status = "cancelled";
    order.cancellationReason = reason || "Cancelled by Admin";
    order.timeline.push({
      status: "cancelled",
      timestamp: new Date(),
      note: `Admin Cancelled: ${reason}`,
    });
    await order.save({ session });
    if ((order.paymentStatus === "paid" && order.paymentMethod !== "cod") || refundAmount) {
      const user = await User.findById(order.customer).session(session);
      const amountToRefund = refundAmount ? Number(refundAmount) : order.totalAmount;
      user.walletBalance = (user.walletBalance || 0) + amountToRefund;
      await user.save({ session });
      const WalletTransaction = require('../models/WalletTransaction');
      await WalletTransaction.create([{
        user: user._id,
        amount: amountToRefund,
        type: 'credit',
        description: `Refund (Admin): Order #${order._id.toString().slice(-6)}`,
        orderId: order._id,
        adminAction: true,
        adminId: req.user._id
      }], { session });
      order.paymentStatus = 'refunded';
      order.refund = {
        status: 'completed',
        amount: amountToRefund,
        refundedAt: new Date(),
        method: 'wallet',
        note: reason || "Admin refund"
      };
      await order.save({ session });
      const { sendNotification } = require("../utils/notificationService");
      try {
        await sendNotification(
          user._id,
          "Refund Processed",
          `Admin processed a refund of ₹${amountToRefund} to your wallet.`,
          { orderId: order._id, amount: amountToRefund },
        );
      } catch (e) { }
    }
    const socketService = require('../services/socketService');
    const cancelData = {
      orderId: order._id.toString(),
      status: "cancelled",
      reason: reason || "Cancelled by Admin",
      timestamp: new Date(),
    };
    socketService.emitToUser(order.customer.toString(), "order:cancelled", { ...cancelData, message: "Your order has been cancelled by admin" });
    socketService.emitToRestaurant(order.restaurant.toString(), "order:cancelled", cancelData);
    if (order.rider) {
      socketService.emitToRider(order.rider.toString(), "order:cancelled", {
        ...cancelData,
        message: "Order has been cancelled by admin"
      });
      const riderDoc = await Rider.findById(order.rider).select('user');
      if (riderDoc?.user) {
        socketService.emitToRider(riderDoc.user.toString(), "order:cancelled", {
          ...cancelData,
          message: "Order has been cancelled by admin"
        });
      }
    }
    await session.commitTransaction();
    session.endSession();
    res.status(200).json({
      message: "Order cancelled and refund processed (if applicable)",
      order,
    });
  } catch (error) {
    await session.abortTransaction();
    session.endSession();
    res.status(500).json({ message: error.message });
  }
};
exports.ownerRejectOrder = async (req, res) => {
  try {
    const { reason } = req.body;
    const order = await Order.findById(req.params.id);
    if (!order) return res.status(404).json({ message: "Order not found" });
    const restaurant = await Restaurant.findOne({ owner: req.user._id });
    if (
      !restaurant ||
      order.restaurant.toString() !== restaurant._id.toString()
    ) {
      return res.status(403).json({ message: "Access denied" });
    }
    if (!reason || reason.trim().length === 0) {
      return res.status(400).json({
        message: "Rejection reason is required",
        error: "Please provide a reason for rejecting this order",
      });
    }
    if (order.status !== "placed") {
      return res.status(400).json({
        message: "Can only reject newly placed orders",
        currentStatus: order.status,
      });
    }
    order.status = "cancelled";
    order.cancellationReason = `Rejected by restaurant: ${reason}`;
    order.timeline.push({
      status: "cancelled",
      timestamp: new Date(),
      note: `Restaurant Rejected: ${reason}`,
    });
    logRestaurantAction(order._id, restaurant._id, "rejected", reason);
    logOrderTransition(
      order._id,
      "placed",
      "cancelled",
      req.user._id,
      "restaurant_owner",
      `Rejected: ${reason}`,
    );
    if (order.paymentStatus === "paid" && order.paymentMethod !== "cod") {
      const user = await User.findById(order.customer);
      const amountToRefund = order.totalAmount;
      const RefundRequest = require("../models/RefundRequest");
      const refundReq = await RefundRequest.create({
        order: order._id,
        user: user._id,
        amount: amountToRefund,
        method: order.paymentMethod === "wallet" ? "wallet" : "original",
        requestedBy: req.user._id,
        note: `Order rejected by restaurant: ${reason}`,
      });
      order.refund = order.refund || {};
      order.refund.status = "in_progress";
      order.refund.amount = amountToRefund;
      order.refund.note = `Rejected by restaurant: ${reason}`;
      logRefund(
        order._id,
        user._id,
        amountToRefund,
        `Restaurant rejection: ${reason}`,
        "in_progress",
      );
      try {
        await sendNotification(
          order.customer,
          "Order Rejected - Refund Initiated",
          `Your order was rejected by the restaurant. Refund of ₹${amountToRefund} is being processed.`,
          { orderId: order._id, amount: amountToRefund, reason },
        );
      } catch (e) {
        logger.error("Failed to send rejection notification", {
          error: e.message,
        });
      }
    } else {
      try {
        await sendNotification(
          order.customer,
          "Order Rejected",
          `Your order was rejected by the restaurant. Reason: ${reason}`,
          { orderId: order._id, reason },
        );
      } catch (e) {
        logger.error("Failed to send rejection notification", {
          error: e.message,
        });
      }
    }
    await order.save();
    try {
      const rejectData = {
        orderId: order._id,
        status: "cancelled",
        reason: reason,
        rejectedBy: "restaurant",
        timestamp: new Date(),
      };
      socketService.emitToUser(order.customer.toString(), "order:cancelled", {
        ...rejectData,
        cancellationReason: reason,
        message: `Restaurant rejected your order: ${reason}`,
        refundInitiated:
          order.paymentStatus === "paid" && order.paymentMethod !== "cod",
      });
      socketService.emitToAdmin("order:cancelled", {
        ...rejectData,
        restaurantName: restaurant.name,
        restaurantId: restaurant._id,
        cancellationReason: reason,
        customerName: order.customer?.name,
      });
    } catch (socketError) {
      console.error("Socket emission error:", socketError);
    }
    res.status(200).json({
      message: "Order rejected successfully",
      order,
      refundInitiated:
        order.paymentStatus === "paid" && order.paymentMethod !== "cod",
    });
  } catch (error) {
    logger.error("Failed to reject order", { error: error.message });
    res.status(500).json({ message: error.message });
  }
};
exports.ownerCancelOrder = async (req, res) => {
  try {
    const { reason, refundAmount } = req.body;
    const order = await Order.findById(req.params.id);
    if (!order) return res.status(404).json({ message: "Order not found" });
    const restaurant = await Restaurant.findOne({ owner: req.user._id });
    if (
      !restaurant ||
      order.restaurant.toString() !== restaurant._id.toString()
    )
      return res.status(403).json({ message: "Access denied" });
    if (order.status === "cancelled")
      return res.status(400).json({ message: "Order already cancelled" });
    if (!canBeCancelled(order.status)) {
      return res.status(400).json({
        message: "Cannot cancel order in current state",
        currentStatus: order.status,
      });
    }
    order.status = "cancelled";
    order.cancellationReason = reason || "Cancelled by restaurant";
    order.timeline.push({
      status: "cancelled",
      timestamp: new Date(),
      note: `Restaurant Cancelled: ${reason}`,
    });
    logOrderTransition(
      order._id,
      oldStatus,
      "cancelled",
      req.user._id,
      "restaurant_owner",
      reason,
    );
    if (order.paymentStatus === "paid" && order.paymentMethod !== "cod") {
      const user = await User.findById(order.customer);
      const amountToRefund = refundAmount
        ? Number(refundAmount)
        : order.totalAmount;
      const RefundRequest = require("../models/RefundRequest");
      const refundReq = await RefundRequest.create({
        order: order._id,
        user: user._id,
        amount: amountToRefund,
        method: "wallet",
        requestedBy: req.user._id,
        note: reason || "Refund requested by restaurant",
      });
      order.refund = order.refund || {};
      order.refund.status = "in_progress";
      order.refund.amount = amountToRefund;
      order.refund.note = reason || "Refund requested by restaurant";
      logRefund(
        order._id,
        user._id,
        amountToRefund,
        reason || "Restaurant cancellation",
        "in_progress",
      );
      try {
        await sendNotification(
          order.customer,
          "Refund Requested",
          `A refund of ${amountToRefund} for order ${order._id} has been initiated and is pending admin approval.`,
          { orderId: order._id, amount: amountToRefund },
        );
      } catch (e) { }
    }
    await order.save();
    await sendNotification(
      order.customer,
      "Order Cancelled",
      `Your order ${order._id} was cancelled by the restaurant.`,
      { orderId: order._id },
    );
    try {
      const cancelData = {
        orderId: order._id,
        status: "cancelled",
        reason: reason || "Cancelled by restaurant",
        rejectedBy: "restaurant",
        timestamp: new Date(),
      };
      socketService.emitToUser(order.customer.toString(), "order:cancelled", {
        ...cancelData,
        cancellationReason: reason || "Cancelled by restaurant",
        message: `Restaurant cancelled your order: ${reason || 'No reason provided'}`,
      });
      socketService.emitToAdmin("order:cancelled", {
        ...cancelData,
        restaurantName: restaurant.name,
        restaurantId: restaurant._id,
        cancellationReason: reason || "Cancelled by restaurant",
        customerName: order.customer?.name,
      });
    } catch (socketError) {
      console.error("Socket emission error:", socketError);
    }
    res.status(200).json({ message: "Order cancelled by restaurant", order });
  } catch (error) {
    logger.error("Failed to cancel order", { error: error.message });
    res.status(500).json({ message: error.message });
  }
};
exports.ownerDelayOrder = async (req, res) => {
  try {
    const { delayMinutes } = req.body;
    const order = await Order.findById(req.params.id);
    if (!order) return res.status(404).json({ message: "Order not found" });
    const restaurant = await Restaurant.findOne({ owner: req.user._id });
    if (
      !restaurant ||
      order.restaurant.toString() !== restaurant._id.toString()
    )
      return res.status(403).json({ message: "Access denied" });
    const newEta = order.estimatedDeliveryTime
      ? new Date(order.estimatedDeliveryTime.getTime() + delayMinutes * 60000)
      : new Date(Date.now() + delayMinutes * 60000);
    order.estimatedDeliveryTime = newEta;
    order.timeline.push({
      status: "preparation",
      timestamp: new Date(),
      note: `Delayed by ${delayMinutes} minutes`,
    });
    await order.save();
    await sendNotification(
      order.customer,
      "Order Delay",
      `Your order ${order._id} has been delayed by ${delayMinutes} minutes.`,
      { orderId: order._id, newEta },
    );
    res
      .status(200)
      .json({ message: `Order delayed by ${delayMinutes} minutes`, order });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};
exports.resendOTP = async (req, res) => {
  try {
    const { id: orderId } = req.params;
    const { otpType } = req.body; // 'pickup' or 'delivery'
    const userId = req.user._id;
    const userRole = req.user.role;
    if (!['pickup', 'delivery'].includes(otpType)) {
      return res.status(400).json({
        success: false,
        message: "Invalid OTP type. Must be 'pickup' or 'delivery'",
      });
    }
    const order = await Order.findById(orderId)
      .populate('restaurant', 'name phone owner')
      .populate('rider', 'user')
      .populate('rider.user', 'name mobile')
      .populate('customer', 'name phone');
    if (!order) {
      return res.status(404).json({
        success: false,
        message: "Order not found",
      });
    }
    if (!order.rider) {
      return res.status(400).json({
        success: false,
        message: "No rider assigned to this order yet",
      });
    }
    const riderUserId = order.rider?.user?.toString();
    if (otpType === 'pickup') {
      if (!['rider', 'restaurant_owner', 'admin'].includes(userRole)) {
        return res.status(403).json({
          success: false,
          message: "Only assigned rider, restaurant owner, or admin can resend pickup OTP.",
        });
      }
      if (userRole === 'rider' && riderUserId !== userId.toString()) {
        return res.status(403).json({
          success: false,
          message: "You are not assigned to this order",
        });
      }
      if (userRole === 'restaurant_owner' && order.restaurant?.owner?.toString() !== userId.toString()) {
        return res.status(403).json({
          success: false,
          message: "This order does not belong to your restaurant",
        });
      }
      if (!['assigned', 'reached_restaurant'].includes(order.status)) {
        return res.status(400).json({
          success: false,
          message: "Pickup OTP can only be resent before pickup",
          currentStatus: order.status,
        });
      }
    } else if (otpType === 'delivery') {
      if (!['rider', 'customer', 'admin'].includes(userRole)) {
        return res.status(403).json({
          success: false,
          message: "Only rider, customer, or admin can resend delivery OTP",
        });
      }
      if (userRole === 'rider' && riderUserId !== userId.toString()) {
        return res.status(403).json({
          success: false,
          message: "You are not assigned to this order",
        });
      }
      if (userRole === 'customer' && order.customer._id.toString() !== userId.toString()) {
        return res.status(403).json({
          success: false,
          message: "This is not your order",
        });
      }
      if (!['picked_up', 'delivery_arrived'].includes(order.status)) {
        return res.status(400).json({
          success: false,
          message: "Delivery OTP can only be resent after pickup",
          currentStatus: order.status,
        });
      }
    }
    const now = new Date();
    const otpExpiryField = otpType === 'pickup' ? 'pickupOtpExpiresAt' : 'deliveryOtpExpiresAt';
    const lastOtpTime = order[otpExpiryField];
    if (lastOtpTime) {
      const timeSinceLastOtp = now - (lastOtpTime.getTime() - 100 * 60 * 1000); // Original generation time
      if (timeSinceLastOtp < 60 * 1000) {
        const waitSeconds = Math.ceil((60 * 1000 - timeSinceLastOtp) / 1000);
        return res.status(429).json({
          success: false,
          message: `Please wait ${waitSeconds} seconds before requesting OTP again`,
          waitSeconds,
        });
      }
    }
    const newOtp = Math.floor(1000 + Math.random() * 9000).toString(); // 4-digit OTP
    const otpExpiry = 100 * 60 * 1000; // 100 minutes
    if (otpType === 'pickup') {
      order.pickupOtp = newOtp;
      order.pickupOtpExpiresAt = new Date(now.getTime() + otpExpiry);
      logOTP(orderId, 'pickup', 'resent', userId, userRole);
    } else {
      order.deliveryOtp = newOtp;
      order.deliveryOtpExpiresAt = new Date(now.getTime() + otpExpiry);
      logOTP(orderId, 'delivery', 'resent', userId, userRole);
    }
    await order.save();
    if (otpType === 'pickup') {
      if (order.restaurant?.owner) {
        await sendNotification(
          order.restaurant.owner,
          "New Pickup OTP",
          `New pickup OTP for order ${orderId}: ${newOtp}`,
          { orderId, otp: newOtp, otpType: 'pickup' }
        );
      }
      if (riderUserId) {
        await sendNotification(
          riderUserId,
          "New Pickup OTP",
          `Pickup OTP was resent to restaurant for order ${orderId}.`,
          { orderId, otpType: 'pickup' }
        );
      }
      try {
        if (order.restaurant?.owner) {
          const ownerUser = await User.findById(order.restaurant.owner).select('mobile');
          if (ownerUser?.mobile) {
            await sendOTP(ownerUser.mobile, newOtp);
          } else if (order.restaurant?.phone) {
            await sendOTP(order.restaurant.phone, newOtp);
          }
        } else if (order.restaurant?.phone) {
          await sendOTP(order.restaurant.phone, newOtp);
        }
      } catch (smsErr) {
        console.error('SMS Gateway failed (resend pickupOtp to restaurant):', smsErr.message);
      }
    } else {
      await sendNotification(
        order.customer._id,
        "New Delivery OTP",
        `New delivery OTP for order ${orderId}: ${newOtp}`,
        { orderId, otp: newOtp, otpType: 'delivery' }
      );
      if (riderUserId) {
        await sendNotification(
          riderUserId,
          "New Delivery OTP",
          `New delivery OTP for order ${orderId}`,
          { orderId, otpType: 'delivery' }
        );
      }
      try {
        const customerUser = await User.findById(order.customer._id).select('mobile');
        if (customerUser?.mobile) await sendOTP(customerUser.mobile, newOtp);
      } catch (smsErr) {
        console.error('SMS Gateway failed (resend deliveryOtp to customer):', smsErr.message);
      }
    }
    const otpSocketPayload = {
      orderId,
      otpType,
      expiresAt: order[otpExpiryField],
    };
    if (otpType === 'pickup') {
      socketService.emitToRestaurant(order.restaurant._id.toString(), 'order:otp_resent', otpSocketPayload);
    } else {
      socketService.emitToCustomer(order.customer._id.toString(), 'order:otp_resent', otpSocketPayload);
    }
    if (order.rider?._id) {
      socketService.emitToRider(order.rider._id.toString(), 'order:otp_resent', otpSocketPayload);
    }
    logger.info(`OTP resent for order ${orderId}`, {
      otpType,
      requestedBy: userRole,
      userId,
    });
    res.status(200).json({
      success: true,
      message: `${otpType === 'pickup' ? 'Pickup' : 'Delivery'} OTP has been resent`,
      data: {
        otpType,
        expiresAt: order[otpExpiryField],
        otp: (userRole === 'admin' || userRole === 'rider' ||
          (otpType === 'pickup' && userRole === 'restaurant_owner') ||
          (otpType === 'delivery' && userRole === 'customer')) ? newOtp : undefined
      }
    });
  } catch (error) {
    logger.error("Resend OTP failed:", { error: error.message });
    res.status(500).json({
      success: false,
      message: "Failed to resend OTP",
      error: error.message,
    });
  }
};
exports.resendPickupOTPByRestaurant = async (req, res) => {
  req.body = {
    ...(req.body || {}),
    otpType: 'pickup',
  };
  return exports.resendOTP(req, res);
};

// ─────────────────────────────────────────────────────────────────────────────
// Billing endpoints
// Billing records are generated by billingService after settlement on delivery.
// ─────────────────────────────────────────────────────────────────────────────
const CustomerBill   = require('../models/CustomerBill');
const RestaurantBill = require('../models/RestaurantBill');
const RiderBill      = require('../models/RiderBill');

const asAmount = (value) => {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? Number(numeric.toFixed(5)) : 0;
};

const splitGst = (value) => {
  const total = asAmount(value);
  const cgst = asAmount(total / 2);
  const sgst = asAmount(total - cgst);
  return { cgst, sgst, total };
};

const buildBillingSectionsFromOrder = (orderLike) => {
  const order = orderLike || {};
  const pb = order.paymentBreakdown || {};
  const rider = order.riderEarnings || {};

  const itemsTotal = asAmount(pb.itemTotal ?? order.itemTotal ?? 0);
  const restaurantDiscount = asAmount(pb.restaurantDiscount ?? 0);
  const platformDiscount = asAmount(pb.foodierDiscount ?? order.discount ?? 0);
  const subTotal = asAmount(Math.max(0, itemsTotal - restaurantDiscount));

  const gstOnFood = asAmount(pb.gstOnFood ?? 0);
  const cgstFood = asAmount(pb.cgstOnFood ?? (gstOnFood / 2));
  const sgstFood = asAmount(pb.sgstOnFood ?? (gstOnFood - cgstFood));
  const packagingCharge = asAmount(pb.packagingCharge ?? order.packaging ?? 0);
  const packagingGst = asAmount(pb.packagingGST ?? 0);
  const deliveryFee = asAmount(pb.deliveryCharge ?? order.deliveryFee ?? 0);
  const deliveryGst = asAmount(pb.deliveryGST ?? pb.deliveryGst ?? 0);
  const cgstDelivery = asAmount(pb.cgstDelivery ?? (deliveryGst / 2));
  const sgstDelivery = asAmount(pb.sgstDelivery ?? (deliveryGst - cgstDelivery));
  const platformFee = asAmount(order.platformFee ?? pb.platformFee ?? 0);
  const platformGst = asAmount(pb.platformGST ?? pb.gstOnPlatform ?? 0);
  const tip = asAmount(order.tip ?? 0);

  const totalCgstCustomer = asAmount((pb.cgstOnFood ?? (gstOnFood / 2)) + (pb.cgstOnPackaging ?? (packagingGst / 2)) + cgstDelivery + (pb.cgstPlatform ?? (platformGst / 2)));
  const totalSgstCustomer = asAmount((pb.sgstOnFood ?? (gstOnFood / 2)) + (pb.sgstOnPackaging ?? (packagingGst / 2)) + sgstDelivery + (pb.sgstPlatform ?? (platformGst / 2)));
  const totalGstCustomer = asAmount(totalCgstCustomer + totalSgstCustomer);

  const commissionAmount = asAmount(
    (pb.totalAdminCommissionDeduction ?? 0) - (pb.adminCommissionGst ?? 0),
  );
  const commissionBase = asAmount(pb.priceAfterRestaurantDiscount ?? pb.taxableAmountFood ?? (itemsTotal - restaurantDiscount));
  const commissionPercent = commissionBase > 0 ? asAmount((commissionAmount / commissionBase) * 100) : 0;
  const commissionGst = asAmount(pb.adminCommissionGst ?? 0);
  const commissionGstSplit = splitGst(commissionGst);

  const restaurantGross = asAmount(pb.restaurantGross ?? (commissionBase + packagingCharge));
  const netEarning = asAmount(pb.restaurantNet ?? 0);

  const riderDeliveryCharge = asAmount(rider.deliveryCharge ?? 0);
  const riderPlatformCredit = asAmount(rider.platformFee ?? 0);
  const riderIncentive = asAmount(rider.incentive ?? 0);
  const riderTip = asAmount(rider.tip ?? order.tip ?? 0);
  const riderIncentivePercent = asAmount(rider.incentivePercentAtCompletion ?? 0);
  const riderTotalEarning = asAmount(rider.totalRiderEarning ?? (riderDeliveryCharge + riderPlatformCredit + riderIncentive + riderTip));

  const totalCollectionFromCustomer = asAmount(
    pb.platformBillTotal
    ?? (deliveryFee + deliveryGst + platformFee + platformGst),
  );
  const sharedWithRider = asAmount(riderDeliveryCharge + riderPlatformCredit);
  const retainedByPlatform = asAmount(totalCollectionFromCustomer - sharedWithRider);

  const gstOnCommission = commissionGst;
  const gstOnPlatform = platformGst;
  const platformCgst = asAmount(pb.cgstPlatform ?? (gstOnPlatform / 2));
  const platformSgst = asAmount(pb.sgstPlatform ?? (gstOnPlatform - platformCgst));
  const totalCgstPlatform = asAmount(commissionGstSplit.cgst + platformCgst);
  const totalSgstPlatform = asAmount(commissionGstSplit.sgst + platformSgst);
  const totalGstPlatform = asAmount(totalCgstPlatform + totalSgstPlatform);
  const netPlatformEarning = asAmount(commissionAmount + retainedByPlatform);

  return {
    customerBill: {
      itemsTotal,
      restaurantDiscount,
      platformDiscount,
      subTotal,
      gstOnFood,
      cgstFood,
      sgstFood,
      packagingCharge,
      deliveryFee,
      deliveryGst,
      cgstDelivery,
      sgstDelivery,
      platformFee,
      tip,
      totalGstSummary: {
        totalCgst: totalCgstCustomer,
        totalSgst: totalSgstCustomer,
        totalGst: totalGstCustomer,
      },
      totalPayable: asAmount(order.totalAmount ?? 0),
      paymentMethod: order.paymentMethod || null,
      paymentStatus: order.paymentStatus || null,
      items: Array.isArray(order.items)
        ? order.items.map((item) => ({
          name: typeof item?.name === 'string' ? item.name : (item?.name?.en || item?.name?.de || item?.name?.ar || 'Item'),
          quantity: Number(item?.quantity || 0),
          price: asAmount(item?.price || 0),
          lineTotal: asAmount(item?.lineTotal || 0),
        }))
        : [],
    },
    restaurantBill: {
      itemsTotal,
      restaurantDiscount,
      packaging: packagingCharge,
      restaurantGross,
      gstCollected: {
        gstOnFood,
        cgstFood,
        sgstFood,
      },
      commission: {
        commissionPercent,
        commissionAmount,
      },
      commissionGst: {
        gstOnCommission,
        cgstOnCommission: commissionGstSplit.cgst,
        sgstOnCommission: commissionGstSplit.sgst,
      },
      netEarning,
    },
    riderBill: {
      deliveryCharge: riderDeliveryCharge,
      platformFeeCredit: riderPlatformCredit,
      incentive: {
        incentivePercent: riderIncentivePercent,
        incentiveAmount: riderIncentive,
      },
      earningsBreakdown: {
        deliveryCharge: riderDeliveryCharge,
        platformCredit: riderPlatformCredit,
        incentive: riderIncentive,
        tip: riderTip,
      },
      tip: riderTip,
      totalEarning: riderTotalEarning,
      walletCreditNote: 'Credited to rider wallet after delivery',
    },
    platformBill: {
      commission: {
        commissionPercent,
        commissionAmount,
      },
      commissionGst: {
        cgstCommission: commissionGstSplit.cgst,
        sgstCommission: commissionGstSplit.sgst,
        totalCommissionGst: commissionGstSplit.total,
      },
      platformFee,
      deliveryCharges: deliveryFee,
      customerTipPassedToRider: riderTip,
      totalCollectionFromCustomer,
      sharedWithRider,
      retainedByPlatform,
      gstBreakdown: {
        gstOnCommission,
        deliveryGst,
        cgstDelivery,
        sgstDelivery,
        gstOnPlatform,
        totalCgst: totalCgstPlatform,
        totalSgst: totalSgstPlatform,
        totalGst: totalGstPlatform,
      },
      netPlatformEarning,
    },
  };
};

/** GET /orders/:id/customer-bill — Customer fetches their receipt */
exports.getCustomerBill = async (req, res) => {
  try {
    if (!req.user || !isValidObjectId(req.user._id)) return sendError(res, 401, 'Unauthorized');
    const order = await Order.findById(req.params.id).lean();
    if (!order) return sendError(res, 404, 'Order not found');
    if (order.customer.toString() !== req.user._id.toString()) {
      return sendError(res, 403, 'Access denied');
    }
    const billing = buildBillingSectionsFromOrder(order);
    return res.status(200).json({ success: true, ...billing });
  } catch (err) {
    return sendError(res, 500, 'Failed to fetch customer bill', err.message);
  }
};

/** GET /orders/:id/restaurant-bill — Restaurant owner fetches their earnings record */
exports.getRestaurantBill = async (req, res) => {
  try {
    if (!req.user || !isValidObjectId(req.user._id)) return sendError(res, 401, 'Unauthorized');
    const restaurant = await Restaurant.findOne({ owner: req.user._id }).select('_id').lean();
    if (!restaurant) return sendError(res, 404, 'Restaurant not found');
    const order = await Order.findById(req.params.id).lean();
    if (!order) return sendError(res, 404, 'Order not found');
    if (order.restaurant.toString() !== restaurant._id.toString()) {
      return sendError(res, 403, 'Access denied');
    }
    const billing = buildBillingSectionsFromOrder(order);
    return res.status(200).json({ success: true, ...billing });
  } catch (err) {
    return sendError(res, 500, 'Failed to fetch restaurant bill', err.message);
  }
};

/** GET /orders/:id/rider-bill — Rider fetches their earnings record */
exports.getRiderBill = async (req, res) => {
  try {
    if (!req.user || !isValidObjectId(req.user._id)) return sendError(res, 401, 'Unauthorized');
    const riderProfile = await Rider.findOne({ user: req.user._id }).select('_id').lean();
    if (!riderProfile) return sendError(res, 404, 'Rider profile not found');
    const order = await Order.findById(req.params.id).lean();
    if (!order) return sendError(res, 404, 'Order not found');
    if (!order.rider || order.rider.toString() !== riderProfile._id.toString()) {
      return sendError(res, 403, 'Access denied');
    }
    const billing = buildBillingSectionsFromOrder(order);
    return res.status(200).json({ success: true, ...billing });
  } catch (err) {
    return sendError(res, 500, 'Failed to fetch rider bill', err.message);
  }
};

/** GET /orders/:id/bills — Admin sees all three bills for a single order */
exports.getAdminBills = async (req, res) => {
  try {
    if (!req.user || !isValidObjectId(req.user._id)) return sendError(res, 401, 'Unauthorized');
    const order = await Order.findById(req.params.id).lean();
    if (!order) return sendError(res, 404, 'Order not found');
    const billing = buildBillingSectionsFromOrder(order);
    return res.status(200).json({
      success: true,
      ...billing,
    });
  } catch (err) {
    return sendError(res, 500, 'Failed to fetch admin bills', err.message);
  }
};

/** GET /orders/billing/restaurant-history — Restaurant's paginated billing history */
exports.getRestaurantBillingHistory = async (req, res) => {
  try {
    if (!req.user || !isValidObjectId(req.user._id)) return sendError(res, 401, 'Unauthorized');
    const restaurant = await Restaurant.findOne({ owner: req.user._id }).select('_id').lean();
    if (!restaurant) return sendError(res, 404, 'Restaurant not found');
    const { page = 1, limit = 20 } = req.query;
    const { skip, take } = getPaginationParams(page, limit);
    const [bills, total] = await Promise.all([
      RestaurantBill.find({ restaurant: restaurant._id })
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(take)
        .populate('order', 'status createdAt totalAmount paymentMethod')
        .lean(),
      RestaurantBill.countDocuments({ restaurant: restaurant._id }),
    ]);
    return res.status(200).json({ success: true, bills, total, page: Number(page), limit: Number(limit) });
  } catch (err) {
    return sendError(res, 500, 'Failed to fetch billing history', err.message);
  }
};

/** GET /orders/billing/rider-history — Rider's paginated billing history */
exports.getRiderBillingHistory = async (req, res) => {
  try {
    if (!req.user || !isValidObjectId(req.user._id)) return sendError(res, 401, 'Unauthorized');
    const riderProfile = await Rider.findOne({ user: req.user._id }).select('_id').lean();
    if (!riderProfile) return sendError(res, 404, 'Rider profile not found');
    const { page = 1, limit = 20 } = req.query;
    const { skip, take } = getPaginationParams(page, limit);
    const [bills, total] = await Promise.all([
      RiderBill.find({ rider: riderProfile._id })
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(take)
        .populate('order', 'status createdAt totalAmount paymentMethod deliveredAt')
        .lean(),
      RiderBill.countDocuments({ rider: riderProfile._id }),
    ]);
    return res.status(200).json({ success: true, bills, total, page: Number(page), limit: Number(limit) });
  } catch (err) {
    return sendError(res, 500, 'Failed to fetch rider billing history', err.message);
  }
};

