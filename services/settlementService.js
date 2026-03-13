'use strict';

const mongoose = require('mongoose');
const Order = require('../models/Order');
const Rider = require('../models/Rider');
const RiderWallet = require('../models/RiderWallet');
const Restaurant = require('../models/Restaurant');
const RestaurantWallet = require('../models/RestaurantWallet');
const AdminCommissionWallet = require('../models/AdminCommissionWallet');
const PaymentTransaction = require('../models/PaymentTransaction');
const { generateBills } = require('./billingService');
const { validateOrderFinancialIntegrity } = require('./financialIntegrityService');
const { logger } = require('../utils/logger');

const r2 = (n) => Math.round((Number(n) || 0) * 100) / 100;

async function acquireSettlementLock(orderId) {
  const lock = await Order.updateOne(
    {
      _id: orderId,
      $or: [
        { settlementStatus: 'pending' },
        { settlementStatus: { $exists: false } },
      ],
    },
    { $set: { settlementStatus: 'processing' } },
  );

  return lock.modifiedCount === 1;
}

async function releaseSettlementLock(orderId) {
  await Order.updateOne(
    { _id: orderId, settlementStatus: 'processing' },
    { $set: { settlementStatus: 'pending' } },
  );
}

async function processSettlement(orderId, options = {}) {
  const trigger = options.trigger || 'system';

  const preOrder = await Order.findById(orderId).select('status settlementStatus settlementProcessedAt rider paymentMethod');
  if (!preOrder) throw new Error('Order not found');
  if (preOrder.status !== 'delivered') throw new Error('Order not delivered');
  if (!preOrder.rider) throw new Error('Rider not assigned to this order');

  if (preOrder.settlementStatus === 'processed') {
    return {
      success: true,
      alreadyProcessed: true,
      message: 'Settlement already processed for this order',
    };
  }

  const lockAcquired = await acquireSettlementLock(orderId);
  if (!lockAcquired) {
    const latest = await Order.findById(orderId).select('settlementStatus settlementProcessedAt').lean();
    return {
      success: true,
      alreadyProcessed: latest?.settlementStatus === 'processed',
      message: latest?.settlementStatus === 'processed'
        ? 'Settlement already processed for this order'
        : 'Settlement is already being processed for this order',
      settlementStatus: latest?.settlementStatus,
      settlementProcessedAt: latest?.settlementProcessedAt,
    };
  }

  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const order = await Order.findById(orderId)
      .populate('restaurant')
      .populate('rider')
      .session(session);

    if (!order) throw new Error('Order not found');
    if (order.settlementStatus === 'processed') {
      await session.abortTransaction();
      session.endSession();
      return {
        success: true,
        alreadyProcessed: true,
        message: 'Settlement already processed for this order',
      };
    }

    const paymentBreakdown = order.paymentBreakdown || {};

    // Canonical order-level financial fields only
    const restaurantEarning = r2(order.restaurantEarning || 0);
    const adminCommission = r2(order.adminCommission || 0);
    const adminCommissionGst = r2(paymentBreakdown.adminCommissionGst || 0);
    const gstOnPlatform = r2(paymentBreakdown.gstOnPlatform || 0);

    const riderDeliveryCharge = r2(order.riderEarnings?.deliveryCharge || 0);
    const riderPlatformFee = r2(order.riderEarnings?.platformFee || 0);
    const riderIncentive = r2(order.riderEarnings?.incentive || 0);
    const riderTotalEarning = r2(order.riderEarnings?.totalRiderEarning || 0);

    const integrity = validateOrderFinancialIntegrity(order);
    if (!integrity.valid) {
      logger.error('Settlement blocked by financial integrity validation', {
        event: 'SETTLEMENT_VALIDATION_FAILED',
        orderId: String(order._id),
        issues: integrity.issues,
      });
      throw new Error(`Financial integrity validation failed: ${integrity.issues.join('; ')}`);
    }

    let riderWallet = await RiderWallet.findOne({ rider: order.rider._id }).session(session);
    if (!riderWallet) {
      riderWallet = await RiderWallet.create([{ rider: order.rider._id }], { session }).then((docs) => docs[0]);
    }

    let restaurantWallet = await RestaurantWallet.findOne({ restaurant: order.restaurant._id }).session(session);
    if (!restaurantWallet) {
      restaurantWallet = await RestaurantWallet.create([{ restaurant: order.restaurant._id }], { session }).then((docs) => docs[0]);
    }

    let adminWallet = await AdminCommissionWallet.findOne().session(session);
    if (!adminWallet) {
      adminWallet = await AdminCommissionWallet.create([{}], { session }).then((docs) => docs[0]);
    }

    // Rider credit (canonical structured object only)
    riderWallet.totalEarnings += riderTotalEarning;
    riderWallet.availableBalance += riderTotalEarning;
    await riderWallet.save({ session });

    await Rider.updateOne(
      { _id: order.rider._id },
      {
        $inc: {
          totalEarnings: riderTotalEarning,
          currentBalance: riderTotalEarning,
        },
      },
      { session },
    );

    // Restaurant credit
    if (restaurantEarning > 0) {
      restaurantWallet.balance += restaurantEarning;
      restaurantWallet.totalEarnings += restaurantEarning;
      restaurantWallet.pendingAmount += restaurantEarning;
      await restaurantWallet.save({ session });

      await Restaurant.updateOne(
        { _id: order.restaurant._id },
        { $inc: { totalEarnings: restaurantEarning } },
        { session },
      );
    }

    // Admin commission recording (GST liabilities tracked in transaction breakdown)
    adminWallet.balance += adminCommission;
    adminWallet.totalCommission += adminCommission;
    adminWallet.commissionFromRestaurants += adminCommission;
    adminWallet.lastUpdated = new Date();
    await adminWallet.save({ session });

    // Preserve deprecated fields as mirrors only; no calculations from them.
    order.riderEarnings = {
      deliveryCharge: riderDeliveryCharge,
      platformFee: riderPlatformFee,
      incentive: riderIncentive,
      totalRiderEarning: riderTotalEarning,
      incentivePercentAtCompletion: r2(order.riderEarnings?.incentivePercentAtCompletion || 0),
      earnedAt: new Date(),
    };
    order.riderEarning = riderTotalEarning;
    order.riderIncentive = riderIncentive;
    order.riderIncentivePercent = r2(order.riderEarnings?.incentivePercentAtCompletion || 0);
    order.restaurantCommission = restaurantEarning;
    order.adminCommissionAtOrder = adminCommission;

    order.settlementStatus = 'processed';
    order.settlementProcessedAt = new Date();
    await order.save({ session });

    await PaymentTransaction.create([
      {
        order: order._id,
        rider: order.rider._id,
        restaurant: order.restaurant._id,
        user: order.customer,
        type: 'rider_earning_credit',
        amount: riderTotalEarning,
        breakdown: {
          deliveryCharge: riderDeliveryCharge,
          platformFee: riderPlatformFee,
          incentive: riderIncentive,
          riderEarning: riderTotalEarning,
          adminCommission,
          adminCommissionGst,
          gstOnPlatform,
        },
        note: `Settlement rider credit (${trigger})`,
        status: 'completed',
      },
      {
        order: order._id,
        restaurant: order.restaurant._id,
        user: order.customer,
        type: 'restaurant_commission',
        amount: restaurantEarning,
        breakdown: {
          restaurantNet: restaurantEarning,
          adminCommission,
          adminCommissionGst,
          gstOnPlatform,
        },
        note: `Settlement restaurant credit (${trigger})`,
        status: 'completed',
      },
      {
        order: order._id,
        restaurant: order.restaurant._id,
        rider: order.rider._id,
        user: order.customer,
        type: order.paymentMethod === 'wallet' ? 'wallet_payment' : 'online_payment',
        amount: r2(order.totalAmount || 0),
        breakdown: {
          orderAmount: r2(order.totalAmount || 0),
          commissionAmount: adminCommission,
          restaurantNet: restaurantEarning,
          riderEarning: riderTotalEarning,
          adminCommissionGst,
          gstOnPlatform,
          adminGstLiability: r2(adminCommissionGst + gstOnPlatform),
        },
        note: `Settlement ledger snapshot (${trigger})`,
        status: 'completed',
      },
    ], { session });

    await session.commitTransaction();
    session.endSession();

    try {
      await generateBills(order._id);
    } catch (billErr) {
      logger.error('billingService.generateBills failed after settlement', {
        orderId: String(order._id),
        error: billErr.message,
      });
    }

    return {
      success: true,
      alreadyProcessed: false,
      orderId: order._id,
      paymentMethod: order.paymentMethod,
      settlementStatus: 'processed',
      rider: {
        deliveryCharge: riderDeliveryCharge,
        platformFee: riderPlatformFee,
        incentive: riderIncentive,
        totalRiderEarning: riderTotalEarning,
      },
      restaurant: {
        restaurantEarning,
      },
      admin: {
        adminCommission,
        adminCommissionGst,
        gstOnPlatform,
        adminGstLiability: r2(adminCommissionGst + gstOnPlatform),
      },
    };
  } catch (error) {
    await session.abortTransaction();
    session.endSession();
    await releaseSettlementLock(orderId);
    throw error;
  }
}

module.exports = {
  processSettlement,
};
