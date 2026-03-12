/**
 * RIDER EARNINGS BREAKDOWN SERVICE
 * 
 * Calculates and manages rider earnings for each delivery consisting of:
 * 1. Delivery Charge - Base charge + distance bonus
 * 2. Platform Fee - Share of platform fee given to rider
 * 3. Incentive - Percentage-based bonus on order value
 * 
 * Total = deliveryCharge + platformFee + incentive
 */

const Order = require('../models/Order');
const Rider = require('../models/Rider');
const RiderWallet = require('../models/RiderWallet');
const AdminSetting = require('../models/AdminSetting');
const PaymentTransaction = require('../models/PaymentTransaction');

/**
 * CALCULATE RIDER DELIVERY CHARGE
 * 
 * Formula:
 * baseDeliveryCharge = admin's configured baseEarningPerDelivery
 * distanceBonus = (deliveryDistance - baseDistance) × riderPerKmRate (if distance > baseDistance)
 * totalDeliveryCharge = baseDeliveryCharge + distanceBonus
 * 
 * Example:
 * - Base: ₹30
 * - Distance: 8 km
 * - Base distance: 3 km
 * - Per KM rate: ₹5
 * - Distance bonus: (8 - 3) × 5 = ₹25
 * - Total delivery charge: ₹30 + ₹25 = ₹55
 * 
 * @param {number} deliveryDistanceKm - Delivery distance in kilometers
 * @param {object} settings - Admin settings with payout config
 * @returns {object} - { baseDeliveryCharge, distanceBonus, totalDeliveryCharge }
 */
const calculateDeliveryCharge = (deliveryDistanceKm, settings) => {
  const distance = Math.max(0, deliveryDistanceKm || 0);
  const payoutConfig = settings?.payoutConfig || {};
  
  const baseDeliveryCharge = payoutConfig.riderBaseEarningPerDelivery || 30;
  const baseDistance = payoutConfig.riderBaseDistanceKm || 3;
  const perKmRate = payoutConfig.riderPerKmRate || 5;
  
  let distanceBonus = 0;
  if (distance > baseDistance) {
    const extraKm = distance - baseDistance;
    distanceBonus = Math.ceil(extraKm) * perKmRate;
  }
  
  return {
    baseDeliveryCharge,
    distanceBonus,
    totalDeliveryCharge: baseDeliveryCharge + distanceBonus,
    distanceKm: distance,
    baseDistanceKm: baseDistance,
  };
};

/**
 * CALCULATE RIDER PLATFORM FEE SHARE
 * 
 * Formula:
 * riderPlatformFeeShare = platformFee from order
 * (or a percentage of it if admin configures platform fee sharing)
 * 
 * Currently: rider gets 100% of the platform fee
 * This can be modified to split with admin if needed
 * 
 * @param {number} platformFeeFromOrder - Platform fee in the order
 * @returns {number} - Amount of platform fee credited to rider
 */
const calculatePlatformFeeShare = (platformFeeFromOrder) => {
  // Currently: rider gets the full platform fee
  // Can be changed to: platformFeeFromOrder * 0.5 (50% to rider) etc.
  return Math.max(0, platformFeeFromOrder || 0);
};

/**
 * CALCULATE RIDER INCENTIVE
 * 
 * Formula:
 * riderIncentive = itemTotal (before GST) × incentivePercent / 100
 * 
 * Example:
 * - Order item total: ₹1000 (before tax)
 * - Incentive percent: 5%
 * - Rider incentive: 1000 × 5 / 100 = ₹50
 * 
 * @param {number} itemTotal - Order item total before GST
 * @param {number} incentivePercent - Incentive percentage from admin settings
 * @returns {number} - Calculated incentive amount
 */
const calculateIncentive = (itemTotal, incentivePercent) => {
  const total = Math.max(0, itemTotal || 0);
  const percent = Math.max(0, incentivePercent || 0);
  
  return (total * percent) / 100;
};

/**
 * CALCULATE TOTAL RIDER EARNINGS FOR AN ORDER
 * 
 * Comprehensive calculation of all three components:
 * totalRiderEarning = deliveryCharge + platformFee + incentive
 * 
 * @param {object} order - Order object with deliveryDistanceKm, deliveryFee, platformFee, itemTotal
 * @param {object} settings - Admin settings
 * @returns {object} - Complete breakdown: { deliveryCharge, platformFee, incentive, totalRiderEarning }
 */
const calculateRiderEarnings = (order, settings) => {
  if (!order) throw new Error('Order is required');
  
  const deliveryInfo = calculateDeliveryCharge(order.deliveryDistanceKm, settings);
  const platformFeeShare = calculatePlatformFeeShare(order.platformFee);
  
  const payoutConfig = settings?.payoutConfig || {};
  const incentivePercent = payoutConfig.riderIncentivePercent || 5;
  
  // Item total should be before GST/tax
  const itemTotal = order.itemTotal || 0;
  const incentive = calculateIncentive(itemTotal, incentivePercent);
  
  const totalRiderEarning = deliveryInfo.totalDeliveryCharge + platformFeeShare + incentive;
  
  return {
    deliveryCharge: deliveryInfo.totalDeliveryCharge,
    deliveryChargeBreakdown: {
      base: deliveryInfo.baseDeliveryCharge,
      distanceBonus: deliveryInfo.distanceBonus,
      distanceKm: deliveryInfo.distanceKm
    },
    platformFee: platformFeeShare,
    incentive: incentive,
    incentivePercent: incentivePercent,
    totalRiderEarning: totalRiderEarning,
    earnedAt: new Date()
  };
};

/**
 * GET ADMIN SETTINGS FOR EARNING CALCULATION
 * 
 * Retrieves the latest admin settings for payout configuration
 * 
 * @returns {object} - Admin settings
 */
const getAdminSettings = async () => {
  let settings = await AdminSetting.findOne();
  
  if (!settings) {
    // Create default settings if none exist
    settings = await AdminSetting.create({});
  }
  
  return settings;
};

/**
 * CREDIT RIDER EARNINGS TO WALLET
 * 
 * After order is delivered:
 * 1. Calculate earnings breakdown
 * 2. Add to rider wallet (totalEarnings and availableBalance)
 * 3. Create payment transaction record
 * 
 * @param {string} orderId - Order ID
 * @returns {object} - Result with wallet updates and transaction record
 */
const creditRiderEarnings = async (orderId) => {
  try {
    // Fetch order with populated rider
    const order = await Order.findById(orderId).populate('rider').populate('restaurant');
    if (!order) throw new Error('Order not found');
    if (!order.rider) throw new Error('Rider not assigned to this order');
    
    // Use snapshot fixed at order creation time (System A).
    // deliveryCharge  = delivery fee charged to customer (slab-based)
    // platformFee     = full platform fee
    // incentive       = % of itemTotal
    // The snapshot is always set in placeOrder; if missing, earnings cannot be determined.
    let earningsBreakdown;
    if (order.riderEarnings && order.riderEarnings.totalRiderEarning > 0) {
      earningsBreakdown = {
        deliveryCharge: order.riderEarnings.deliveryCharge,
        platformFee: order.riderEarnings.platformFee,
        incentive: order.riderEarnings.incentive,
        incentivePercent: order.riderEarnings.incentivePercentAtCompletion,
        totalRiderEarning: order.riderEarnings.totalRiderEarning,
        earnedAt: new Date(),
      };
    } else {
      throw new Error(`Rider earnings snapshot missing for order ${orderId}. Cannot credit earnings without a valid snapshot.`);
    }
    
    // Get or create rider wallet
    let riderWallet = await RiderWallet.findOne({ rider: order.rider._id });
    if (!riderWallet) {
      riderWallet = await RiderWallet.create({ rider: order.rider._id });
    }
    
    // Update wallet: add to total earnings and available balance
    riderWallet.totalEarnings += earningsBreakdown.totalRiderEarning;
    riderWallet.availableBalance += earningsBreakdown.totalRiderEarning;
    
    // Save wallet
    await riderWallet.save();
    
    // Create payment transaction record for audit
    await PaymentTransaction.create({
      order: order._id,
      rider: order.rider._id,
      restaurant: order.restaurant._id,
      user: order.customer,
      type: 'rider_earning_credit',
      amount: earningsBreakdown.totalRiderEarning,
      breakdown: {
        deliveryCharge: earningsBreakdown.deliveryCharge,
        platformFee: earningsBreakdown.platformFee,
        incentive: earningsBreakdown.incentive,
        totalRiderEarning: earningsBreakdown.totalRiderEarning,
        riderIncentivePercent: earningsBreakdown.incentivePercent,
      },
      deliveryDistanceKm: order.deliveryDistanceKm,
      status: 'completed',
      note: `Earnings credited for delivery. Delivery: ₹${earningsBreakdown.deliveryCharge}, Platform Fee: ₹${earningsBreakdown.platformFee}, Incentive: ₹${earningsBreakdown.incentive}`
    });
    
    // Save order
    await order.save();
    
    return {
      success: true,
      orderId: order._id,
      riderEarnings: earningsBreakdown,
      walletUpdated: {
        totalEarnings: riderWallet.totalEarnings,
        availableBalance: riderWallet.availableBalance,
      },
      message: `✅ Earnings credited: ₹${earningsBreakdown.totalRiderEarning}`
    };
  } catch (error) {
    console.error('Error crediting rider earnings:', error);
    return {
      success: false,
      orderId,
      error: error.message
    };
  }
};

/**
 * GET RIDER EARNINGS SUMMARY
 * 
 * Aggregate earnings data for a specific rider
 * Shows total and breakdown across all completed deliveries
 * 
 * @param {string} riderId - Rider ID
 * @param {object} filters - Optional filters { startDate, endDate, limit }
 * @returns {object} - Aggregated earnings summary
 */
const getRiderEarningsSummary = async (riderId, filters = {}) => {
  try {
    const { startDate, endDate, limit = 100 } = filters;
    
    // Build query for completed orders
    const query = {
      rider: riderId,
      status: 'delivered',
      'riderEarnings.earnedAt': { $exists: true }
    };
    
    // Add date filters if provided
    if (startDate || endDate) {
      query['riderEarnings.earnedAt'] = {};
      if (startDate) query['riderEarnings.earnedAt'].$gte = new Date(startDate);
      if (endDate) query['riderEarnings.earnedAt'].$lte = new Date(endDate);
    }
    
    // Get all orders matching query
    const orders = await Order.find(query)
      .select('_id totalAmount itemTotal deliveryDistanceKm riderEarnings createdAt deliveredAt')
      .sort({ deliveredAt: -1 })
      .limit(limit);
    
    // Calculate aggregates
    let totalDeliveryCharges = 0;
    let totalPlatformFees = 0;
    let totalIncentives = 0;
    let totalEarnings = 0;
    let totalOrders = 0;
    
    const detailedOrders = orders.map(order => {
      const earnings = order.riderEarnings || {};
      totalDeliveryCharges += earnings.deliveryCharge || 0;
      totalPlatformFees += earnings.platformFee || 0;
      totalIncentives += earnings.incentive || 0;
      totalEarnings += earnings.totalRiderEarning || 0;
      totalOrders++;
      
      return {
        orderId: order._id,
        orderAmount: order.totalAmount,
        distance: order.deliveryDistanceKm,
        deliveryCharge: earnings.deliveryCharge,
        platformFee: earnings.platformFee,
        incentive: earnings.incentive,
        totalEarning: earnings.totalRiderEarning,
        earnedAt: earnings.earnedAt,
        deliveredAt: order.deliveredAt
      };
    });
    
    const avgEarningPerDelivery = totalOrders > 0 ? totalEarnings / totalOrders : 0;
    
    return {
      success: true,
      rider: riderId,
      summary: {
        totalOrders,
        totalDeliveryCharges: Math.round(totalDeliveryCharges * 100) / 100,
        totalPlatformFees: Math.round(totalPlatformFees * 100) / 100,
        totalIncentives: Math.round(totalIncentives * 100) / 100,
        totalEarnings: Math.round(totalEarnings * 100) / 100,
        averageEarningPerDelivery: Math.round(avgEarningPerDelivery * 100) / 100
      },
      breakdownPercentages: {
        deliveryChargePercent: totalEarnings > 0 ? Math.round((totalDeliveryCharges / totalEarnings) * 100) : 0,
        platformFeePercent: totalEarnings > 0 ? Math.round((totalPlatformFees / totalEarnings) * 100) : 0,
        incentivePercent: totalEarnings > 0 ? Math.round((totalIncentives / totalEarnings) * 100) : 0
      },
      orders: detailedOrders,
      filters: {
        startDate: filters.startDate,
        endDate: filters.endDate,
        limit
      }
    };
  } catch (error) {
    console.error('Error fetching rider earnings summary:', error);
    return {
      success: false,
      error: error.message
    };
  }
};

/**
 * GET RIDER WALLET WITH EARNINGS DETAILS
 * 
 * @param {string} riderId - Rider ID
 * @returns {object} - Wallet info with recent earnings breakdown
 */
const getRiderWalletWithEarnings = async (riderId) => {
  try {
    let wallet = await RiderWallet.findOne({ rider: riderId });
    if (!wallet) {
      wallet = await RiderWallet.create({ rider: riderId });
    }
    
    // Get recent deliveries for context
    const recentDeliveries = await Order.find({
      rider: riderId,
      status: 'delivered'
    })
    .select('_id totalAmount riderEarnings deliveredAt')
    .sort({ deliveredAt: -1 })
    .limit(5);
    
    // Get earnings summary
    const summary = await getRiderEarningsSummary(riderId, { limit: 1000 });
    
    return {
      success: true,
      wallet: {
        availableBalance: wallet.availableBalance,
        totalEarnings: wallet.totalEarnings,
        lastPayoutAt: wallet.lastPayoutAt,
        lastPayoutAmount: wallet.lastPayoutAmount
      },
      earningsSummary: summary.summary,
      recentDeliveries: recentDeliveries.map(d => ({
        orderId: d._id,
        orderAmount: d.totalAmount,
        deliveryCharge: d.riderEarnings?.deliveryCharge,
        platformFee: d.riderEarnings?.platformFee,
        incentive: d.riderEarnings?.incentive,
        totalEarning: d.riderEarnings?.totalRiderEarning,
        deliveredAt: d.deliveredAt
      }))
    };
  } catch (error) {
    console.error('Error fetching rider wallet with earnings:', error);
    return {
      success: false,
      error: error.message
    };
  }
};

module.exports = {
  calculateDeliveryCharge,
  calculatePlatformFeeShare,
  calculateIncentive,
  calculateRiderEarnings,
  getAdminSettings,
  creditRiderEarnings,
  getRiderEarningsSummary,
  getRiderWalletWithEarnings
};
