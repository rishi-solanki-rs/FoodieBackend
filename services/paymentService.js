
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
  const hasFinalPayable = Number.isFinite(Number(paymentBreakdown.finalPayableToRestaurant));
  const commissionPercent = Number(restaurant?.adminCommission || DEFAULT_COMMISSION_PERCENT);
  const orderAmount = Number(order?.totalAmount || 0);

  const commissionAmount = Number.isFinite(Number(order?.adminCommission))
    ? Number(order.adminCommission)
    : (orderAmount * commissionPercent) / 100;
  const settlementDeliveryFee = Number.isFinite(Number(order?.deliveryFee))
    ? Number(order.deliveryFee)
    : Number(distanceInfo?.totalDeliveryFee || 0);

  const restaurantNet = hasFinalPayable
    ? Number(paymentBreakdown.finalPayableToRestaurant)
    : (orderAmount - commissionAmount - settlementDeliveryFee);

  return {
    orderAmount,
    commissionPercent,
    commissionAmount,
    settlementDeliveryFee,
    restaurantNet: Math.max(0, restaurantNet),
  };
}

async function processCODDelivery(orderId) {
  const order = await Order.findById(orderId)
    .populate('restaurant')
    .populate('rider');
  if (!order) throw new Error('Order not found');
  if (order.paymentMethod !== 'cod') throw new Error('Not a COD order');
  if (order.status !== 'delivered') throw new Error('Order not yet delivered');
  const restaurant = order.restaurant;
  const distanceInfo = calculateDeliveryCharges(order.deliveryDistanceKm || 0);
  let riderWallet = await RiderWallet.findOne({ rider: order.rider._id });
  if (!riderWallet) {
    riderWallet = await RiderWallet.create({ rider: order.rider._id });
  }
  let restaurantWallet = await RestaurantWallet.findOne({ restaurant: restaurant._id });
  if (!restaurantWallet) {
    restaurantWallet = await RestaurantWallet.create({ restaurant: restaurant._id });
  }
  const {
    orderAmount,
    commissionPercent,
    commissionAmount,
    settlementDeliveryFee,
    restaurantNet,
  } = getSettlementSnapshot(order, restaurant, distanceInfo);
  
  riderWallet.cashInHand += orderAmount;
  const wasFrozen = riderWallet.checkAndFreeze();
  riderWallet.totalEarnings += distanceInfo.riderEarning;
  riderWallet.availableBalance += distanceInfo.riderEarning;
  await riderWallet.save();
  
  // Update restaurant wallet
  restaurantWallet.balance += restaurantNet;
  restaurantWallet.totalEarnings += restaurantNet;
  restaurantWallet.pendingAmount += restaurantNet;
  await restaurantWallet.save();
  
  // Track admin commission
  const adminWallet = await AdminCommissionWallet.getInstance();
  adminWallet.balance += commissionAmount;
  adminWallet.totalCommission += commissionAmount;
  adminWallet.commissionFromRestaurants += commissionAmount;
  adminWallet.lastUpdated = new Date();
  await adminWallet.save();
  order.cashCollected = orderAmount;
  order.cashCollectedAt = new Date();
  order.riderEarning = distanceInfo.riderEarning;
  order.adminCommission = commissionAmount;
  order.restaurantCommission = restaurantNet;
  await order.save();
  await PaymentTransaction.create({
    order: order._id,
    rider: order.rider._id,
    restaurant: restaurant._id,
    user: order.customer,
    type: 'cod_collected',
    amount: orderAmount,
    deliveryDistanceKm: distanceInfo.distanceKm,
    isLongDistance: distanceInfo.isLongDistance,
    breakdown: {
      orderAmount,
      commissionPercent,
      commissionAmount,
      deliveryFee: settlementDeliveryFee,
      distanceSurcharge: distanceInfo.surcharge,
      restaurantNet,
      riderEarning: distanceInfo.riderEarning,
      platformEarning: commissionAmount + settlementDeliveryFee,
    },
    note: `COD collected. ${distanceInfo.isLongDistance ? `Long distance (${distanceInfo.distanceKm}km), surcharge ₹${distanceInfo.surcharge}` : ''}`,
    status: 'completed'
  });
  await PaymentTransaction.create({
    order: order._id,
    restaurant: restaurant._id,
    type: 'restaurant_commission',
    amount: restaurantNet,
    breakdown: {
      orderAmount,
      commissionPercent,
      commissionAmount,
      restaurantNet,
    },
    note: `Commission auto-credited for order #${order._id.toString().slice(-6)}`,
    status: 'completed'
  });
  return {
    success: true,
    riderFrozen: wasFrozen,
    riderWallet: {
      cashInHand: riderWallet.cashInHand,
      cashLimit: riderWallet.cashLimit,
      isFrozen: riderWallet.isFrozen,
      frozenReason: riderWallet.frozenReason,
      riderEarning: distanceInfo.riderEarning
    },
    restaurantWallet: {
      balance: restaurantWallet.balance,
      credited: restaurantNet
    },
    breakdown: {
      orderAmount,
      commissionAmount: commissionAmount.toFixed(2),
      deliveryFee: settlementDeliveryFee,
      distanceSurcharge: distanceInfo.surcharge,
      restaurantNet: restaurantNet.toFixed(2),
      riderEarning: distanceInfo.riderEarning,
    }
  };
}
async function processOnlineDelivery(orderId) {
  const order = await Order.findById(orderId).populate('restaurant').populate('rider');
  if (!order) throw new Error('Order not found');
  const restaurant = order.restaurant;
  const distanceInfo = calculateDeliveryCharges(order.deliveryDistanceKm || 0);
  let riderWallet = await RiderWallet.findOne({ rider: order.rider._id });
  if (!riderWallet) riderWallet = await RiderWallet.create({ rider: order.rider._id });
  let restaurantWallet = await RestaurantWallet.findOne({ restaurant: restaurant._id });
  if (!restaurantWallet) restaurantWallet = await RestaurantWallet.create({ restaurant: restaurant._id });
  const {
    orderAmount,
    commissionPercent,
    commissionAmount,
    settlementDeliveryFee,
    restaurantNet,
  } = getSettlementSnapshot(order, restaurant, distanceInfo);
  
  riderWallet.totalEarnings += distanceInfo.riderEarning;
  riderWallet.availableBalance += distanceInfo.riderEarning;
  await riderWallet.save();
  
  // Update restaurant wallet
  restaurantWallet.balance += restaurantNet;
  restaurantWallet.totalEarnings += restaurantNet;
  restaurantWallet.pendingAmount += restaurantNet;
  await restaurantWallet.save();
  
  // Track admin commission
  const adminWallet = await AdminCommissionWallet.getInstance();
  adminWallet.balance += commissionAmount;
  adminWallet.totalCommission += commissionAmount;
  adminWallet.commissionFromRestaurants += commissionAmount;
  adminWallet.lastUpdated = new Date();
  await adminWallet.save();
  order.riderEarning = distanceInfo.riderEarning;
  order.adminCommission = commissionAmount;
  order.restaurantCommission = restaurantNet;
  await order.save();
  await PaymentTransaction.create({
    order: order._id,
    rider: order.rider._id,
    restaurant: restaurant._id,
    user: order.customer,
    type: order.paymentMethod === 'wallet' ? 'wallet_payment' : 'online_payment',
    amount: orderAmount,
    deliveryDistanceKm: distanceInfo.distanceKm,
    isLongDistance: distanceInfo.isLongDistance,
    breakdown: {
      orderAmount,
      commissionPercent,
      commissionAmount,
      deliveryFee: settlementDeliveryFee,
      distanceSurcharge: distanceInfo.surcharge,
      restaurantNet,
      riderEarning: distanceInfo.riderEarning,
      platformEarning: commissionAmount + settlementDeliveryFee
    },
    status: 'completed'
  });
  return {
    success: true,
    breakdown: {
      orderAmount,
      commissionAmount,
      restaurantNet,
      riderEarning: distanceInfo.riderEarning,
      distanceSurcharge: distanceInfo.surcharge,
    }
  };
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