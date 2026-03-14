
// const Order = require('../models/Order');
// const Rider = require('../models/Rider');
// const Restaurant = require('../models/Restaurant');
// const RiderWallet = require('../models/RiderWallet');
// const RestaurantWallet = require('../models/RestaurantWallet');
// const PaymentTransaction = require('../models/PaymentTransaction');
// const BASE_DELIVERY_FEE = 30;          // ₹30 base delivery fee
// const BASE_DELIVERY_DISTANCE_KM = 2;   // Free up to 2km
// const EXTRA_FEE_PER_KM = 10;           // ₹10/km beyond 2km
// const RIDER_DISTANCE_BONUS_PER_KM = 5; // ₹5/km extra for rider beyond 2km
// const DEFAULT_COMMISSION_PERCENT = 10; // 10% platform commission on restaurant
// const DEFAULT_RIDER_EARNING = 25;      // ₹25 flat per delivery
// function calculateDeliveryCharges(distanceKm) {
//   const distance = parseFloat(distanceKm) || 0;
//   let surcharge = 0;
//   let riderBonus = 0;
//   if (distance > BASE_DELIVERY_DISTANCE_KM) {
//     const extraKm = distance - BASE_DELIVERY_DISTANCE_KM;
//     surcharge = Math.ceil(extraKm) * EXTRA_FEE_PER_KM;
//     riderBonus = Math.ceil(extraKm) * RIDER_DISTANCE_BONUS_PER_KM;
//   }
//   return {
//     baseDeliveryFee: BASE_DELIVERY_FEE,
//     surcharge,
//     totalDeliveryFee: BASE_DELIVERY_FEE + surcharge,
//     riderBonus,
//     riderEarning: DEFAULT_RIDER_EARNING + riderBonus,
//     isLongDistance: distance > BASE_DELIVERY_DISTANCE_KM,
//     distanceKm: distance
//   };
// }
// async function processCODDelivery(orderId) {
//   const order = await Order.findById(orderId)
//     .populate('restaurant')
//     .populate('rider');
//   if (!order) throw new Error('Order not found');
//   if (order.paymentMethod !== 'cod') throw new Error('Not a COD order');
//   if (order.status !== 'delivered') throw new Error('Order not yet delivered');
//   const restaurant = order.restaurant;
//   const distanceInfo = calculateDeliveryCharges(order.deliveryDistanceKm || 0);
//   let riderWallet = await RiderWallet.findOne({ rider: order.rider._id });
//   if (!riderWallet) {
//     riderWallet = await RiderWallet.create({ rider: order.rider._id });
//   }
//   let restaurantWallet = await RestaurantWallet.findOne({ restaurant: restaurant._id });
//   if (!restaurantWallet) {
//     restaurantWallet = await RestaurantWallet.create({ restaurant: restaurant._id });
//   }
//   const commissionPercent = restaurant.adminCommission || DEFAULT_COMMISSION_PERCENT;
//   const orderAmount = order.totalAmount;
//   const commissionAmount = (orderAmount * commissionPercent) / 100;
//   const restaurantNet = orderAmount - commissionAmount - distanceInfo.totalDeliveryFee;
//   riderWallet.cashInHand += orderAmount;
//   const wasFrozen = riderWallet.checkAndFreeze();
//   riderWallet.totalEarnings += distanceInfo.riderEarning;
//   riderWallet.availableBalance += distanceInfo.riderEarning;
//   await riderWallet.save();
//   restaurantWallet.balance += Math.max(0, restaurantNet);
//   restaurantWallet.totalEarnings += Math.max(0, restaurantNet);
//   restaurantWallet.pendingAmount += Math.max(0, restaurantNet);
//   await restaurantWallet.save();
//   order.cashCollected = orderAmount;
//   order.cashCollectedAt = new Date();
//   order.riderEarning = distanceInfo.riderEarning;
//   order.adminCommission = commissionAmount;
//   order.restaurantCommission = Math.max(0, restaurantNet);
//   await order.save();
//   await PaymentTransaction.create({
//     order: order._id,
//     rider: order.rider._id,
//     restaurant: restaurant._id,
//     user: order.customer,
//     type: 'cod_collected',
//     amount: orderAmount,
//     deliveryDistanceKm: distanceInfo.distanceKm,
//     isLongDistance: distanceInfo.isLongDistance,
//     breakdown: {
//       orderAmount,
//       commissionPercent,
//       commissionAmount,
//       deliveryFee: distanceInfo.totalDeliveryFee,
//       distanceSurcharge: distanceInfo.surcharge,
//       restaurantNet: Math.max(0, restaurantNet),
//       riderEarning: distanceInfo.riderEarning,
//       platformEarning: commissionAmount + distanceInfo.totalDeliveryFee,
//     },
//     note: `COD collected. ${distanceInfo.isLongDistance ? `Long distance (${distanceInfo.distanceKm}km), surcharge ₹${distanceInfo.surcharge}` : ''}`,
//     status: 'completed'
//   });
//   await PaymentTransaction.create({
//     order: order._id,
//     restaurant: restaurant._id,
//     type: 'restaurant_commission',
//     amount: Math.max(0, restaurantNet),
//     breakdown: {
//       orderAmount,
//       commissionPercent,
//       commissionAmount,
//       restaurantNet: Math.max(0, restaurantNet),
//     },
//     note: `Commission auto-credited for order #${order._id.toString().slice(-6)}`,
//     status: 'completed'
//   });
//   return {
//     success: true,
//     riderFrozen: wasFrozen,
//     riderWallet: {
//       cashInHand: riderWallet.cashInHand,
//       cashLimit: riderWallet.cashLimit,
//       isFrozen: riderWallet.isFrozen,
//       frozenReason: riderWallet.frozenReason,
//       riderEarning: distanceInfo.riderEarning
//     },
//     restaurantWallet: {
//       balance: restaurantWallet.balance,
//       credited: Math.max(0, restaurantNet)
//     },
//     breakdown: {
//       orderAmount,
//       commissionAmount: commissionAmount.toFixed(2),
//       deliveryFee: distanceInfo.totalDeliveryFee,
//       distanceSurcharge: distanceInfo.surcharge,
//       restaurantNet: Math.max(0, restaurantNet).toFixed(2),
//       riderEarning: distanceInfo.riderEarning,
//     }
//   };
// }
// async function processOnlineDelivery(orderId) {
//   const order = await Order.findById(orderId).populate('restaurant').populate('rider');
//   if (!order) throw new Error('Order not found');
//   const restaurant = order.restaurant;
//   const distanceInfo = calculateDeliveryCharges(order.deliveryDistanceKm || 0);
//   let riderWallet = await RiderWallet.findOne({ rider: order.rider._id });
//   if (!riderWallet) riderWallet = await RiderWallet.create({ rider: order.rider._id });
//   let restaurantWallet = await RestaurantWallet.findOne({ restaurant: restaurant._id });
//   if (!restaurantWallet) restaurantWallet = await RestaurantWallet.create({ restaurant: restaurant._id });
//   const commissionPercent = restaurant.adminCommission || DEFAULT_COMMISSION_PERCENT;
//   const orderAmount = order.totalAmount;
//   const commissionAmount = (orderAmount * commissionPercent) / 100;
//   const restaurantNet = orderAmount - commissionAmount - distanceInfo.totalDeliveryFee;
//   riderWallet.totalEarnings += distanceInfo.riderEarning;
//   riderWallet.availableBalance += distanceInfo.riderEarning;
//   await riderWallet.save();
//   restaurantWallet.balance += Math.max(0, restaurantNet);
//   restaurantWallet.totalEarnings += Math.max(0, restaurantNet);
//   restaurantWallet.pendingAmount += Math.max(0, restaurantNet);
//   await restaurantWallet.save();
//   order.riderEarning = distanceInfo.riderEarning;
//   order.adminCommission = commissionAmount;
//   order.restaurantCommission = Math.max(0, restaurantNet);
//   await order.save();
//   await PaymentTransaction.create({
//     order: order._id,
//     rider: order.rider._id,
//     restaurant: restaurant._id,
//     user: order.customer,
//     type: order.paymentMethod === 'wallet' ? 'wallet_payment' : 'online_payment',
//     amount: orderAmount,
//     deliveryDistanceKm: distanceInfo.distanceKm,
//     isLongDistance: distanceInfo.isLongDistance,
//     breakdown: {
//       orderAmount,
//       commissionPercent,
//       commissionAmount,
//       deliveryFee: distanceInfo.totalDeliveryFee,
//       distanceSurcharge: distanceInfo.surcharge,
//       restaurantNet: Math.max(0, restaurantNet),
//       riderEarning: distanceInfo.riderEarning,
//       platformEarning: commissionAmount + distanceInfo.totalDeliveryFee
//     },
//     status: 'completed'
//   });
//   return {
//     success: true,
//     breakdown: {
//       orderAmount,
//       commissionAmount,
//       restaurantNet: Math.max(0, restaurantNet),
//       riderEarning: distanceInfo.riderEarning,
//       distanceSurcharge: distanceInfo.surcharge,
//     }
//   };
// }
// async function riderDepositCash(riderId, depositAmount, adminUserId) {
//   const riderWallet = await RiderWallet.findOne({ rider: riderId });
//   if (!riderWallet) throw new Error('Rider wallet not found');
//   const prevCash = riderWallet.cashInHand;
//   riderWallet.depositCash(depositAmount);
//   await riderWallet.save();
//   await PaymentTransaction.create({
//     rider: riderId,
//     type: 'cod_deposit',
//     amount: depositAmount,
//     processedBy: adminUserId,
//     note: `Rider deposited ₹${depositAmount}. Previous cashInHand: ₹${prevCash}. New: ₹${riderWallet.cashInHand}`,
//     status: 'completed'
//   });
//   if (!riderWallet.isFrozen) {
//     await PaymentTransaction.create({
//       rider: riderId,
//       type: 'rider_unfreeze',
//       amount: 0,
//       processedBy: adminUserId,
//       note: `Account unfrozen after deposit of ₹${depositAmount}`,
//       status: 'completed'
//     });
//   }
//   return {
//     success: true,
//     unfrozen: !riderWallet.isFrozen,
//     riderWallet: {
//       cashInHand: riderWallet.cashInHand,
//       cashLimit: riderWallet.cashLimit,
//       isFrozen: riderWallet.isFrozen,
//       availableBalance: riderWallet.availableBalance,
//     }
//   };
// }
// async function setRiderCashLimit(riderId, newLimit, adminUserId) {
//   let riderWallet = await RiderWallet.findOne({ rider: riderId });
//   if (!riderWallet) riderWallet = await RiderWallet.create({ rider: riderId });
//   riderWallet.cashLimit = newLimit;
//   if (!riderWallet.isFrozen) {
//     riderWallet.checkAndFreeze();
//   } else if (riderWallet.cashInHand < newLimit) {
//     riderWallet.isFrozen = false;
//     riderWallet.frozenAt = null;
//     riderWallet.frozenReason = null;
//   }
//   await riderWallet.save();
//   return { success: true, cashLimit: riderWallet.cashLimit, isFrozen: riderWallet.isFrozen };
// }
// async function processWeeklyPayouts() {
//   const results = { restaurants: [], riders: [], errors: [] };
//   const restaurantWallets = await RestaurantWallet.find({ balance: { $gt: 0 } });
//   for (const wallet of restaurantWallets) {
//     try {
//       const payoutAmount = wallet.balance;
//       wallet.totalPaidOut += payoutAmount;
//       wallet.lastPayoutAmount = payoutAmount;
//       wallet.lastPayoutAt = new Date();
//       wallet.balance = 0;
//       wallet.pendingAmount = 0;
//       const nextSunday = new Date();
//       nextSunday.setDate(nextSunday.getDate() + (7 - nextSunday.getDay()));
//       wallet.nextPayoutDate = nextSunday;
//       await wallet.save();
//       await PaymentTransaction.create({
//         restaurant: wallet.restaurant,
//         type: 'restaurant_weekly_payout',
//         amount: payoutAmount,
//         note: `Weekly payout of ₹${payoutAmount}`,
//         status: 'completed'
//       });
//       results.restaurants.push({ restaurantId: wallet.restaurant, amount: payoutAmount });
//     } catch (err) {
//       results.errors.push({ type: 'restaurant', id: wallet.restaurant, error: err.message });
//     }
//   }
//   const riderWallets = await RiderWallet.find({ availableBalance: { $gt: 0 } });
//   for (const wallet of riderWallets) {
//     try {
//       const payoutAmount = wallet.availableBalance;
//       wallet.totalPayouts += payoutAmount;
//       wallet.lastPayoutAmount = payoutAmount;
//       wallet.lastPayoutAt = new Date();
//       wallet.availableBalance = 0;
//       await wallet.save();
//       await PaymentTransaction.create({
//         rider: wallet.rider,
//         type: 'rider_weekly_payout',
//         amount: payoutAmount,
//         note: `Weekly earning payout of ₹${payoutAmount}`,
//         status: 'completed'
//       });
//       results.riders.push({ riderId: wallet.rider, amount: payoutAmount });
//     } catch (err) {
//       results.errors.push({ type: 'rider', id: wallet.rider, error: err.message });
//     }
//   }
//   return results;
// }
// module.exports = {
//   calculateDeliveryCharges,
//   processCODDelivery,
//   processOnlineDelivery,
//   riderDepositCash,
//   setRiderCashLimit,
//   processWeeklyPayouts,
// };

const Order = require('../models/Order');
const Rider = require('../models/Rider');
const Restaurant = require('../models/Restaurant');
const RiderWallet = require('../models/RiderWallet');
const RestaurantWallet = require('../models/RestaurantWallet');
const AdminCommissionWallet = require('../models/AdminCommissionWallet');
const PaymentTransaction = require('../models/PaymentTransaction');
const { generateBills } = require('./billingService');
const mongoose = require('mongoose');
const BASE_DELIVERY_FEE = 30;          // ₹30 base delivery fee
const BASE_DELIVERY_DISTANCE_KM = 2;   // Free up to 2km
const EXTRA_FEE_PER_KM = 10;           // ₹10/km beyond 2km
const RIDER_DISTANCE_BONUS_PER_KM = 5; // ₹5/km extra for rider beyond 2km
const DEFAULT_COMMISSION_PERCENT = 10; // 10% platform commission on restaurant
const DEFAULT_RIDER_EARNING = 25;      // ₹25 flat per delivery
function calculateDeliveryCharges(distanceKm) {
  const distance = parseFloat(distanceKm) || 0;
  let surcharge = 0;
  let riderBonus = 0;
  if (distance > BASE_DELIVERY_DISTANCE_KM) {
    const extraKm = distance - BASE_DELIVERY_DISTANCE_KM;
    surcharge = Math.ceil(extraKm) * EXTRA_FEE_PER_KM;
    riderBonus = Math.ceil(extraKm) * RIDER_DISTANCE_BONUS_PER_KM;
  }
  return {
    baseDeliveryFee: BASE_DELIVERY_FEE,
    surcharge,
    totalDeliveryFee: BASE_DELIVERY_FEE + surcharge,
    riderBonus,
    riderEarning: DEFAULT_RIDER_EARNING + riderBonus,
    isLongDistance: distance > BASE_DELIVERY_DISTANCE_KM,
    distanceKm: distance
  };
}

function getSettlementSnapshot(order, restaurant, distanceInfo) {
  const paymentBreakdown = order?.paymentBreakdown || {};

  // ── Item total & packaging ────────────────────────────────────────────────
  const itemTotal = Number.isFinite(Number(paymentBreakdown.itemTotal))
    ? Number(paymentBreakdown.itemTotal)
    : Number(order?.itemTotal || 0);
  const packagingCharge = Number.isFinite(Number(paymentBreakdown.packagingCharge))
    ? Number(paymentBreakdown.packagingCharge)
    : Number(order?.packaging || 0);

  // ── Admin commission ──────────────────────────────────────────────────────
  // Canonical source is paymentBreakdown total deduction minus commission GST.
  const commissionPercent = Number(
    order?.items?.[0]?.commissionPercent
    || DEFAULT_COMMISSION_PERCENT,
  );
  const commissionAmount = Number.isFinite(Number(paymentBreakdown?.totalAdminCommissionDeduction))
    ? Number(paymentBreakdown.totalAdminCommissionDeduction) - Number(paymentBreakdown.adminCommissionGst || 0)
    : Math.round((Math.max(0, Number(paymentBreakdown?.priceAfterRestaurantDiscount ?? paymentBreakdown?.taxableAmountFood ?? itemTotal)) * (Math.max(0, commissionPercent) / 100)) * 100) / 100;

  // ── Restaurant net earning ────────────────────────────────────────────────
  // Formula: (discountedFoodBase + packaging) - adminCommission - adminCommissionGst
  // GST, deliveryFee, and platformFee are NOT restaurant earnings
  const taxableFoodBase = Number(paymentBreakdown?.priceAfterRestaurantDiscount ?? paymentBreakdown?.taxableAmountFood ?? itemTotal);
  const restaurantGross = taxableFoodBase + packagingCharge;
  const restaurantNet = Number.isFinite(Number(paymentBreakdown?.restaurantNet))
    ? Number(paymentBreakdown.restaurantNet)
    : Math.max(0, Math.round((restaurantGross - commissionAmount - Number(paymentBreakdown?.adminCommissionGst || 0)) * 100) / 100);

  // ── Delivery fee ──────────────────────────────────────────────────────────
  const settlementDeliveryFee = Number.isFinite(Number(order?.deliveryFee))
    ? Number(order.deliveryFee)
    : Number(distanceInfo?.totalDeliveryFee || 0);

  // ── Rider incentive ───────────────────────────────────────────────────────
  // Structured riderEarnings object is the canonical source
  const riderIncentive = Number.isFinite(Number(order?.riderEarnings?.incentive))
    ? Number(order.riderEarnings.incentive)
    : 0;

  // ── Platform fee distribution ─────────────────────────────────────────────
  // By default rider receives 100% of the platform fee.
  // Admin receives none (it comes from the commission instead).
  const platformFee = Math.max(0, Number(order?.platformFee || 0));
  const riderPlatformFeeShare = platformFee;
  const adminPlatformFeeShare = 0;

  // ── Rider earning formula ─────────────────────────────────────────────────
  // totalRiderEarning = deliveryFee + platformFeeShare + incentive + tip
  const riderTip = Math.max(0, Number((order?.riderEarnings?.tip ?? order?.tip) || 0));
  const riderEarning = Math.max(0, Math.round((settlementDeliveryFee + riderPlatformFeeShare + riderIncentive + riderTip) * 100) / 100);

  return {
    orderAmount: Number(order?.totalAmount || 0),
    itemTotal: Math.max(0, itemTotal),
    packagingCharge: Math.max(0, packagingCharge),
    restaurantGross: Math.max(0, restaurantGross),
    commissionPercent,
    commissionAmount: Math.max(0, commissionAmount),
    settlementDeliveryFee: Math.max(0, settlementDeliveryFee),
    riderIncentive: Math.max(0, riderIncentive),
    riderTip: Math.max(0, riderTip),
    riderPlatformFeeShare: Math.max(0, riderPlatformFeeShare),
    adminPlatformFeeShare: Math.max(0, adminPlatformFeeShare),
    riderEarning,
    restaurantNet,
    tax: Math.max(0, Number(order?.tax || 0)),
    platformFee,
    discount: Math.max(0, Number(order?.discount || 0)),
  };
}

async function findExistingSettlementTransaction(orderId) {
  return PaymentTransaction.findOne({
    order: orderId,
    // Use settlement marker transaction types only.
    // Do not use raw payment transactions here, otherwise delivery settlement
    // can be skipped before rider/restaurant wallets are credited.
    type: { $in: ['cod_collected', 'restaurant_commission'] },
    status: { $in: ['completed', 'pending'] },
  }).select('_id type status amount').lean();
}

async function acquireSettlementLock(orderId) {
  const lockResult = await Order.updateOne(
    {
      _id: orderId,
      $or: [
        { settlementStatus: 'pending' },
        { settlementStatus: { $exists: false } },
      ],
    },
    { $set: { settlementStatus: 'processing' } },
  );

  return lockResult.modifiedCount === 1;
}

async function resetSettlementLock(orderId) {
  await Order.updateOne(
    { _id: orderId, settlementStatus: 'processing' },
    { $set: { settlementStatus: 'pending' } },
  );
}

async function processCODDelivery(orderId) {
  const order = await Order.findById(orderId).select('paymentMethod status rider settlementStatus settlementProcessedAt');
  if (!order) throw new Error('Order not found');
  if (order.paymentMethod !== 'cod') throw new Error('Not a COD order');
  if (order.status !== 'delivered') throw new Error('Order not yet delivered');
  if (!order.rider) throw new Error('Rider not assigned to this order');

  const existingSettlement = await findExistingSettlementTransaction(order._id);
  if (existingSettlement || order.settlementStatus === 'processed') {
    return {
      success: true,
      alreadyProcessed: true,
      message: 'Settlement already processed for this order',
      settlementTransaction: existingSettlement || null,
    };
  }

  const lockAcquired = await acquireSettlementLock(order._id);
  if (!lockAcquired) {
    const latestOrder = await Order.findById(order._id).select('settlementStatus settlementProcessedAt').lean();
    return {
      success: true,
      alreadyProcessed: latestOrder?.settlementStatus === 'processed',
      message: latestOrder?.settlementStatus === 'processed'
        ? 'Settlement already processed for this order'
        : 'Settlement is already being processed for this order',
      settlementStatus: latestOrder?.settlementStatus || null,
      settlementProcessedAt: latestOrder?.settlementProcessedAt || null,
    };
  }

  try {
    const session = await mongoose.startSession();
    session.startTransaction();
    try {
      const fullOrder = await Order.findById(orderId)
        .populate('restaurant')
        .populate('rider')
        .session(session);
      if (!fullOrder) throw new Error('Order not found');
      if (fullOrder.settlementStatus === 'processed') {
        await session.abortTransaction();
        return {
          success: true,
          alreadyProcessed: true,
          message: 'Settlement already processed for this order',
        };
      }

      const restaurant = fullOrder.restaurant;
      const distanceInfo = calculateDeliveryCharges(fullOrder.deliveryDistanceKm || 0);
      let riderWallet = await RiderWallet.findOne({ rider: fullOrder.rider._id }).session(session);
      if (!riderWallet) {
        riderWallet = await RiderWallet.create([{ rider: fullOrder.rider._id }], { session }).then((docs) => docs[0]);
      }
      let restaurantWallet = await RestaurantWallet.findOne({ restaurant: restaurant._id }).session(session);
      if (!restaurantWallet) {
        restaurantWallet = await RestaurantWallet.create([{ restaurant: restaurant._id }], { session }).then((docs) => docs[0]);
      }

      const settlement = getSettlementSnapshot(fullOrder, restaurant, distanceInfo);
      const {
        orderAmount,
        itemTotal,
        packagingCharge,
        commissionPercent,
        commissionAmount,
        settlementDeliveryFee,
        riderIncentive,
        riderPlatformFeeShare,
        adminPlatformFeeShare,
        riderEarning,
        restaurantNet,
        tax,
        platformFee,
        discount,
      } = settlement;

      const tipAmount = Math.max(0, Number((fullOrder.riderEarnings?.tip ?? fullOrder.tip) || 0));
      const riderTotalCredit = Math.round(riderEarning * 100) / 100;

      riderWallet.cashInHand += orderAmount;
      const wasFrozen = riderWallet.checkAndFreeze();
      riderWallet.totalEarnings += riderTotalCredit;
      riderWallet.availableBalance += riderTotalCredit;
      await riderWallet.save({ session });

      await Rider.updateOne(
        { _id: fullOrder.rider._id },
        {
          $inc: {
            totalEarnings: riderTotalCredit,
            currentBalance: riderTotalCredit,
          },
        },
        { session },
      );

      restaurantWallet.balance += restaurantNet;
      restaurantWallet.totalEarnings += restaurantNet;
      restaurantWallet.pendingAmount += restaurantNet;
      await restaurantWallet.save({ session });

      await Restaurant.updateOne(
        { _id: restaurant._id },
        {
          $inc: {
            totalEarnings: restaurantNet,
          },
        },
        { session },
      );

      let adminWallet = await AdminCommissionWallet.findOne().session(session);
      if (!adminWallet) {
        adminWallet = await AdminCommissionWallet.create([{}], { session }).then((docs) => docs[0]);
      }
      adminWallet.balance += commissionAmount + adminPlatformFeeShare;
      adminWallet.totalCommission += commissionAmount + adminPlatformFeeShare;
      adminWallet.commissionFromRestaurants += commissionAmount;
      adminWallet.commissionFromDelivery += adminPlatformFeeShare;
      adminWallet.lastUpdated = new Date();
      await adminWallet.save({ session });

      fullOrder.cashCollected = orderAmount;
      fullOrder.cashCollectedAt = new Date();
      // Update structured riderEarnings object with settlement-confirmed values
      fullOrder.riderEarnings = {
        deliveryCharge: settlementDeliveryFee,
        platformFee: riderPlatformFeeShare,
        incentive: riderIncentive,
        tip: tipAmount,
        totalRiderEarning: riderEarning,
        incentivePercentAtCompletion: fullOrder.riderEarnings?.incentivePercentAtCompletion || 0,
        earnedAt: new Date(),
      };
      fullOrder.settlementStatus = 'processed';
      fullOrder.settlementProcessedAt = new Date();
      await fullOrder.save({ session });

      await PaymentTransaction.create([
        {
          order: fullOrder._id,
          rider: fullOrder.rider._id,
          restaurant: restaurant._id,
          user: fullOrder.customer,
          type: 'cod_collected',
          amount: orderAmount,
          deliveryDistanceKm: distanceInfo.distanceKm,
          isLongDistance: distanceInfo.isLongDistance,
          breakdown: {
            orderAmount,
            itemTotal,
            packagingCharge,
            commissionPercent,
            commissionAmount,
            deliveryFee: settlementDeliveryFee,
            distanceSurcharge: distanceInfo.surcharge,
            restaurantNet,
            riderEarning: riderTotalCredit,
            platformEarning: commissionAmount + adminPlatformFeeShare,
            tax,
            discount,
          },
          note: `COD collected for delivered order`,
          status: 'completed'
        },
        {
          order: fullOrder._id,
          rider: fullOrder.rider._id,
          restaurant: restaurant._id,
          user: fullOrder.customer,
          type: 'rider_earning_credit',
          amount: riderTotalCredit,
          breakdown: {
            deliveryCharge: settlementDeliveryFee,
            platformFeeShare: riderPlatformFeeShare,
            incentive: riderIncentive,
            tip: tipAmount,
            riderBaseEarning: riderEarning,
            riderTotalCredit,
          },
          note: `Rider earning credited for delivered order`,
          status: 'completed',
        },
        {
          order: fullOrder._id,
          restaurant: restaurant._id,
          type: 'restaurant_commission',
          amount: restaurantNet,
          breakdown: {
            itemTotal,
            packagingCharge,
            commissionPercent,
            commissionAmount,
            restaurantNet,
          },
          note: `Restaurant earning credited for delivered order`,
          status: 'completed'
        },
      ], { session });

      await session.commitTransaction();
      session.endSession();

      // Generate billing records outside the Mongo transaction (audit/receipt
      // only — wallet credits are already committed above).
      try {
        await generateBills(fullOrder._id);
      } catch (billErr) {
        console.error('[paymentService] billingService.generateBills failed for COD order', fullOrder._id, billErr.message);
      }

      return {
        success: true,
        riderFrozen: wasFrozen,
        riderWallet: {
          cashInHand: riderWallet.cashInHand,
          cashLimit: riderWallet.cashLimit,
          isFrozen: riderWallet.isFrozen,
          frozenReason: riderWallet.frozenReason,
          riderEarning: riderTotalCredit,
        },
        restaurantWallet: {
          balance: restaurantWallet.balance,
          credited: restaurantNet
        },
        breakdown: {
          orderAmount,
          itemTotal,
          packagingCharge,
          commissionAmount: commissionAmount.toFixed(2),
          deliveryFee: settlementDeliveryFee,
          riderPlatformFeeShare,
          riderIncentive,
          tipAmount,
          restaurantNet: restaurantNet.toFixed(2),
          riderEarning,
          riderTotalCredit,
        }
      };
    } catch (txnError) {
      await session.abortTransaction();
      session.endSession();
      throw txnError;
    }
  } catch (error) {
    await resetSettlementLock(order._id);
    throw error;
  }
}
async function processOnlineDelivery(orderId) {
  const order = await Order.findById(orderId).select('paymentMethod status rider settlementStatus settlementProcessedAt');
  if (!order) throw new Error('Order not found');
  if (order.status !== 'delivered') throw new Error('Order not yet delivered');
  if (!order.rider) throw new Error('Rider not assigned to this order');

  const existingSettlement = await findExistingSettlementTransaction(order._id);
  if (existingSettlement || order.settlementStatus === 'processed') {
    return {
      success: true,
      alreadyProcessed: true,
      message: 'Settlement already processed for this order',
      settlementTransaction: existingSettlement || null,
    };
  }

  const lockAcquired = await acquireSettlementLock(order._id);
  if (!lockAcquired) {
    const latestOrder = await Order.findById(order._id).select('settlementStatus settlementProcessedAt').lean();
    return {
      success: true,
      alreadyProcessed: latestOrder?.settlementStatus === 'processed',
      message: latestOrder?.settlementStatus === 'processed'
        ? 'Settlement already processed for this order'
        : 'Settlement is already being processed for this order',
      settlementStatus: latestOrder?.settlementStatus || null,
      settlementProcessedAt: latestOrder?.settlementProcessedAt || null,
    };
  }

  try {
    const session = await mongoose.startSession();
    session.startTransaction();
    try {
      const fullOrder = await Order.findById(orderId)
        .populate('restaurant')
        .populate('rider')
        .session(session);
      if (!fullOrder) throw new Error('Order not found');
      if (fullOrder.settlementStatus === 'processed') {
        await session.abortTransaction();
        return {
          success: true,
          alreadyProcessed: true,
          message: 'Settlement already processed for this order',
        };
      }

      const restaurant = fullOrder.restaurant;
      const distanceInfo = calculateDeliveryCharges(fullOrder.deliveryDistanceKm || 0);
      let riderWallet = await RiderWallet.findOne({ rider: fullOrder.rider._id }).session(session);
      if (!riderWallet) riderWallet = await RiderWallet.create([{ rider: fullOrder.rider._id }], { session }).then((docs) => docs[0]);
      let restaurantWallet = await RestaurantWallet.findOne({ restaurant: restaurant._id }).session(session);
      if (!restaurantWallet) restaurantWallet = await RestaurantWallet.create([{ restaurant: restaurant._id }], { session }).then((docs) => docs[0]);

      const settlement = getSettlementSnapshot(fullOrder, restaurant, distanceInfo);
      const {
        orderAmount,
        itemTotal,
        packagingCharge,
        commissionPercent,
        commissionAmount,
        settlementDeliveryFee,
        riderIncentive,
        riderPlatformFeeShare,
        adminPlatformFeeShare,
        riderEarning,
        restaurantNet,
        tax,
        platformFee,
        discount,
      } = settlement;

      const tipAmount = Math.max(0, Number((fullOrder.riderEarnings?.tip ?? fullOrder.tip) || 0));
      const riderTotalCredit = Math.round(riderEarning * 100) / 100;

      riderWallet.totalEarnings += riderTotalCredit;
      riderWallet.availableBalance += riderTotalCredit;
      await riderWallet.save({ session });

      await Rider.updateOne(
        { _id: fullOrder.rider._id },
        {
          $inc: {
            totalEarnings: riderTotalCredit,
            currentBalance: riderTotalCredit,
          },
        },
        { session },
      );

      restaurantWallet.balance += restaurantNet;
      restaurantWallet.totalEarnings += restaurantNet;
      restaurantWallet.pendingAmount += restaurantNet;
      await restaurantWallet.save({ session });

      await Restaurant.updateOne(
        { _id: restaurant._id },
        {
          $inc: {
            totalEarnings: restaurantNet,
          },
        },
        { session },
      );

      let adminWallet = await AdminCommissionWallet.findOne().session(session);
      if (!adminWallet) {
        adminWallet = await AdminCommissionWallet.create([{}], { session }).then((docs) => docs[0]);
      }
      adminWallet.balance += commissionAmount + adminPlatformFeeShare;
      adminWallet.totalCommission += commissionAmount + adminPlatformFeeShare;
      adminWallet.commissionFromRestaurants += commissionAmount;
      adminWallet.commissionFromDelivery += adminPlatformFeeShare;
      adminWallet.lastUpdated = new Date();
      await adminWallet.save({ session });

      // Update structured riderEarnings object with settlement-confirmed values
      fullOrder.riderEarnings = {
        deliveryCharge: settlementDeliveryFee,
        platformFee: riderPlatformFeeShare,
        incentive: riderIncentive,
        tip: tipAmount,
        totalRiderEarning: riderEarning,
        incentivePercentAtCompletion: fullOrder.riderEarnings?.incentivePercentAtCompletion || 0,
        earnedAt: new Date(),
      };
      fullOrder.settlementStatus = 'processed';
      fullOrder.settlementProcessedAt = new Date();
      await fullOrder.save({ session });

      await PaymentTransaction.create([
        {
          order: fullOrder._id,
          rider: fullOrder.rider._id,
          restaurant: restaurant._id,
          user: fullOrder.customer,
          type: fullOrder.paymentMethod === 'wallet' ? 'wallet_payment' : 'online_payment',
          amount: orderAmount,
          deliveryDistanceKm: distanceInfo.distanceKm,
          isLongDistance: distanceInfo.isLongDistance,
          breakdown: {
            orderAmount,
            itemTotal,
            packagingCharge,
            commissionPercent,
            commissionAmount,
            deliveryFee: settlementDeliveryFee,
            distanceSurcharge: distanceInfo.surcharge,
            restaurantNet,
            riderEarning: riderTotalCredit,
            platformEarning: commissionAmount + adminPlatformFeeShare,
            tax,
            discount,
          },
          status: 'completed'
        },
        {
          order: fullOrder._id,
          rider: fullOrder.rider._id,
          restaurant: restaurant._id,
          user: fullOrder.customer,
          type: 'rider_earning_credit',
          amount: riderTotalCredit,
          breakdown: {
            deliveryCharge: settlementDeliveryFee,
            platformFeeShare: riderPlatformFeeShare,
            incentive: riderIncentive,
            tip: tipAmount,
            riderBaseEarning: riderEarning,
            riderTotalCredit,
          },
          note: `Rider earning credited for delivered order`,
          status: 'completed',
        },
        {
          order: fullOrder._id,
          restaurant: restaurant._id,
          type: 'restaurant_commission',
          amount: restaurantNet,
          breakdown: {
            itemTotal,
            packagingCharge,
            commissionPercent,
            commissionAmount,
            restaurantNet,
          },
          note: `Restaurant earning credited for delivered order`,
          status: 'completed'
        },
      ], { session });

      await session.commitTransaction();
      session.endSession();

      // Generate billing records outside the Mongo transaction.
      try {
        await generateBills(fullOrder._id);
      } catch (billErr) {
        console.error('[paymentService] billingService.generateBills failed for online order', fullOrder._id, billErr.message);
      }

      return {
        success: true,
        breakdown: {
          orderAmount,
          itemTotal,
          packagingCharge,
          commissionAmount,
          restaurantNet,
          riderPlatformFeeShare,
          riderIncentive,
          tipAmount,
          riderEarning,
          riderTotalCredit,
        }
      };
    } catch (txnError) {
      await session.abortTransaction();
      session.endSession();
      throw txnError;
    }
  } catch (error) {
    await resetSettlementLock(order._id);
    throw error;
  }
}
async function riderDepositCash(riderId, depositAmount, adminUserId) {
  const riderWallet = await RiderWallet.findOne({ rider: riderId });
  if (!riderWallet) throw new Error('Rider wallet not found');
  const prevCash = riderWallet.cashInHand;
  riderWallet.depositCash(depositAmount);
  await riderWallet.save();
  await PaymentTransaction.create({
    rider: riderId,
    type: 'cod_deposit',
    amount: depositAmount,
    processedBy: adminUserId,
    note: `Rider deposited ₹${depositAmount}. Previous cashInHand: ₹${prevCash}. New: ₹${riderWallet.cashInHand}`,
    status: 'completed'
  });
  if (!riderWallet.isFrozen) {
    await PaymentTransaction.create({
      rider: riderId,
      type: 'rider_unfreeze',
      amount: 0,
      processedBy: adminUserId,
      note: `Account unfrozen after deposit of ₹${depositAmount}`,
      status: 'completed'
    });
  }
  return {
    success: true,
    unfrozen: !riderWallet.isFrozen,
    riderWallet: {
      cashInHand: riderWallet.cashInHand,
      cashLimit: riderWallet.cashLimit,
      isFrozen: riderWallet.isFrozen,
      availableBalance: riderWallet.availableBalance,
    }
  };
}
async function setRiderCashLimit(riderId, newLimit, adminUserId) {
  let riderWallet = await RiderWallet.findOne({ rider: riderId });
  if (!riderWallet) riderWallet = await RiderWallet.create({ rider: riderId });
  riderWallet.cashLimit = newLimit;
  if (!riderWallet.isFrozen) {
    riderWallet.checkAndFreeze();
  } else if (riderWallet.cashInHand < newLimit) {
    riderWallet.isFrozen = false;
    riderWallet.frozenAt = null;
    riderWallet.frozenReason = null;
  }
  await riderWallet.save();
  return { success: true, cashLimit: riderWallet.cashLimit, isFrozen: riderWallet.isFrozen };
}
async function processWeeklyPayouts() {
  const results = { restaurants: [], riders: [], admin: null, errors: [] };
  
  // Process Restaurant Payouts
  const restaurantWallets = await RestaurantWallet.find({ balance: { $gt: 0 } });
  for (const wallet of restaurantWallets) {
    try {
      const payoutAmount = wallet.balance;
      wallet.totalPaidOut += payoutAmount;
      wallet.lastPayoutAmount = payoutAmount;
      wallet.lastPayoutAt = new Date();
      wallet.balance = 0;
      wallet.pendingAmount = 0;
      const nextSunday = new Date();
      nextSunday.setDate(nextSunday.getDate() + (7 - nextSunday.getDay()));
      wallet.nextPayoutDate = nextSunday;
      await wallet.save();
      await PaymentTransaction.create({
        restaurant: wallet.restaurant,
        type: 'restaurant_weekly_payout',
        amount: payoutAmount,
        note: `Weekly payout of ₹${payoutAmount}`,
        status: 'completed'
      });
      results.restaurants.push({ restaurantId: wallet.restaurant, amount: payoutAmount });
    } catch (err) {
      results.errors.push({ type: 'restaurant', id: wallet.restaurant, error: err.message });
    }
  }
  
  // Process Rider Payouts
  const riderWallets = await RiderWallet.find({ availableBalance: { $gt: 0 } });
  for (const wallet of riderWallets) {
    try {
      const payoutAmount = wallet.availableBalance;
      wallet.totalPayouts += payoutAmount;
      wallet.lastPayoutAmount = payoutAmount;
      wallet.lastPayoutAt = new Date();
      wallet.availableBalance = 0;
      await wallet.save();
      await PaymentTransaction.create({
        rider: wallet.rider,
        type: 'rider_weekly_payout',
        amount: payoutAmount,
        note: `Weekly earning payout of ₹${payoutAmount}`,
        status: 'completed'
      });
      results.riders.push({ riderId: wallet.rider, amount: payoutAmount });
    } catch (err) {
      results.errors.push({ type: 'rider', id: wallet.rider, error: err.message });
    }
  }
  
  // Process Admin Commission Payout
  try {
    const adminWallet = await AdminCommissionWallet.getInstance();
    if (adminWallet.balance > 0) {
      const payoutAmount = adminWallet.balance;
      adminWallet.totalPaidOut += payoutAmount;
      adminWallet.lastPayoutAmount = payoutAmount;
      adminWallet.lastPayoutAt = new Date();
      adminWallet.balance = 0;
      const nextSunday = new Date();
      nextSunday.setDate(nextSunday.getDate() + (7 - nextSunday.getDay()));
      adminWallet.nextPayoutDate = nextSunday;
      await adminWallet.save();
      
      await PaymentTransaction.create({
        type: 'admin_commission_payout',
        amount: payoutAmount,
        note: `Weekly admin commission payout of ₹${payoutAmount}`,
        status: 'completed'
      });
      
      results.admin = { amount: payoutAmount, paidOut: adminWallet.totalPaidOut };
    }
  } catch (err) {
    results.errors.push({ type: 'admin', error: err.message });
  }
  
  return results;
}
module.exports = {
  calculateDeliveryCharges,
  processCODDelivery,
  processOnlineDelivery,
  riderDepositCash,
  setRiderCashLimit,
  processWeeklyPayouts,
};