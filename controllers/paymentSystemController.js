
const {
  processCODDelivery,
  processOnlineDelivery,
  riderDepositCash,
  setRiderCashLimit,
  processWeeklyPayouts,
  calculateDeliveryCharges
} = require('../services/paymentService');
const RiderWallet = require('../models/RiderWallet');
const RestaurantWallet = require('../models/RestaurantWallet');
const PaymentTransaction = require('../models/PaymentTransaction');
const Order = require('../models/Order');
const Rider = require('../models/Rider');
const Restaurant = require('../models/Restaurant');
const Payout = require('../models/Payout');
exports.confirmCODCollection = async (req, res) => {
  try {
    const { orderId, amountCollected } = req.body;
    const riderId = req.user._id; // from auth middleware
    if (!orderId) return res.status(400).json({ success: false, message: 'orderId is required' });
    const order = await Order.findById(orderId).populate('rider');
    if (!order) return res.status(404).json({ success: false, message: 'Order not found' });
    if (!order.rider || order.rider.user.toString() !== riderId.toString()) {
      const rider = await Rider.findOne({ user: riderId });
      if (!rider || order.rider._id.toString() !== rider._id.toString()) {
        return res.status(403).json({ success: false, message: 'Not your order' });
      }
    }
    if (order.paymentMethod !== 'cod') {
      return res.status(400).json({ success: false, message: 'This is not a COD order' });
    }
    if (order.status !== 'delivered') {
      return res.status(400).json({ success: false, message: 'Order must be delivered first' });
    }
    const result = await processCODDelivery(orderId);
    if (result.riderFrozen) {
      return res.status(200).json({
        success: true,
        message: '⚠️ COD collected but your account is now FROZEN. Please deposit cash to activate your account.',
        data: result
      });
    }
    return res.status(200).json({
      success: true,
      message: 'COD collection confirmed',
      data: result
    });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};
exports.getRiderWallet = async (req, res) => {
  try {
    const rider = await Rider.findOne({ user: req.user._id });
    if (!rider) return res.status(404).json({ success: false, message: 'Rider not found' });
    let wallet = await RiderWallet.findOne({ rider: rider._id });
    if (!wallet) wallet = await RiderWallet.create({ rider: rider._id });
    const recentTransactions = await PaymentTransaction.find({ rider: rider._id })
      .sort({ createdAt: -1 })
      .limit(20);
    return res.status(200).json({
      success: true,
      data: {
        wallet: {
          cashInHand: wallet.cashInHand,
          cashLimit: wallet.cashLimit,
          availableBalance: wallet.availableBalance,
          totalEarnings: wallet.totalEarnings,
          isFrozen: wallet.isFrozen,
          frozenReason: wallet.frozenReason,
          frozenAt: wallet.frozenAt,
          lastPayoutAt: wallet.lastPayoutAt,
          lastDepositAt: wallet.lastDepositAt,
        },
        warning: wallet.isFrozen
          ? `🚫 Account frozen! You have ₹${wallet.cashInHand} cash. Please deposit to admin to re-activate.`
          : wallet.cashInHand >= wallet.cashLimit * 0.8
            ? `⚠️ You have ₹${wallet.cashInHand}/${wallet.cashLimit} cash. Near limit!`
            : null,
        recentTransactions
      }
    });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};
exports.getRiderWalletByAdmin = async (req, res) => {
  try {
    const { riderId } = req.params;
    let wallet = await RiderWallet.findOne({ rider: riderId }).populate('rider');
    if (!wallet) wallet = await RiderWallet.create({ rider: riderId });
    const transactions = await PaymentTransaction.find({ rider: riderId })
      .sort({ createdAt: -1 })
      .limit(50)
      .populate('order', 'totalAmount paymentMethod status');
    return res.status(200).json({ success: true, data: { wallet, transactions } });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};
exports.riderDepositCash = async (req, res) => {
  try {
    const { riderId, amount } = req.body;
    if (!riderId || !amount || amount <= 0) {
      return res.status(400).json({ success: false, message: 'riderId and positive amount required' });
    }
    const result = await riderDepositCash(riderId, parseFloat(amount), req.user._id);
    return res.status(200).json({
      success: true,
      message: result.unfrozen
        ? '✅ Cash deposited and rider account UNFROZEN'
        : `Cash deposited. Rider still has ₹${result.riderWallet.cashInHand} in hand (limit: ₹${result.riderWallet.cashLimit})`,
      data: result
    });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};
exports.setRiderCashLimit = async (req, res) => {
  try {
    const { riderId, cashLimit } = req.body;
    if (!riderId || !cashLimit || cashLimit <= 0) {
      return res.status(400).json({ success: false, message: 'riderId and cashLimit required' });
    }
    const result = await setRiderCashLimit(riderId, parseFloat(cashLimit), req.user._id);
    return res.status(200).json({ success: true, message: 'Cash limit updated', data: result });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};
exports.getFrozenRiders = async (req, res) => {
  try {
    const frozenWallets = await RiderWallet.find({ isFrozen: true })
      .populate({ path: 'rider', populate: { path: 'user', select: 'firstName lastName email mobile' } });
    return res.status(200).json({
      success: true,
      count: frozenWallets.length,
      data: frozenWallets.map(w => ({
        riderId: w.rider._id,
        riderName: w.rider.user ? `${w.rider.user.firstName} ${w.rider.user.lastName}` : 'N/A',
        cashInHand: w.cashInHand,
        cashLimit: w.cashLimit,
        frozenAt: w.frozenAt,
        frozenReason: w.frozenReason,
        walletId: w._id
      }))
    });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};
exports.getRestaurantWallet = async (req, res) => {
  try {
    const restaurant = await Restaurant.findOne({ owner: req.user._id });
    if (!restaurant) return res.status(404).json({ success: false, message: 'Restaurant not found' });
    let wallet = await RestaurantWallet.findOne({ restaurant: restaurant._id });
    if (!wallet) wallet = await RestaurantWallet.create({ restaurant: restaurant._id });
    const transactions = await PaymentTransaction.find({ restaurant: restaurant._id })
      .sort({ createdAt: -1 })
      .limit(30)
      .populate('order', 'totalAmount paymentMethod createdAt');
    return res.status(200).json({
      success: true,
      data: {
        wallet: {
          balance: wallet.balance,
          pendingAmount: wallet.pendingAmount,
          totalEarnings: wallet.totalEarnings,
          totalPaidOut: wallet.totalPaidOut,
          lastPayoutAt: wallet.lastPayoutAt,
          lastPayoutAmount: wallet.lastPayoutAmount,
          nextPayoutDate: wallet.nextPayoutDate,
        },
        transactions
      }
    });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};
exports.getRestaurantWalletByAdmin = async (req, res) => {
  try {
    const { restaurantId } = req.params;
    let wallet = await RestaurantWallet.findOne({ restaurant: restaurantId });
    if (!wallet) wallet = await RestaurantWallet.create({ restaurant: restaurantId });
    const transactions = await PaymentTransaction.find({ restaurant: restaurantId })
      .sort({ createdAt: -1 })
      .limit(50)
      .populate('order', 'totalAmount paymentMethod createdAt status');
    return res.status(200).json({ success: true, data: { wallet, transactions } });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};
exports.getAdminSummary = async (req, res) => {
  try {
    const [totalCOD, totalOnline, totalCommission, totalPaidOut, frozenCount, pendingPayouts] = await Promise.all([
      PaymentTransaction.aggregate([
        { $match: { type: 'cod_collected' } },
        { $group: { _id: null, total: { $sum: '$amount' } } }
      ]),
      PaymentTransaction.aggregate([
        { $match: { type: { $in: ['online_payment', 'wallet_payment'] } } },
        { $group: { _id: null, total: { $sum: '$amount' } } }
      ]),
      PaymentTransaction.aggregate([
        { $match: { type: 'restaurant_commission' } },
        { $group: { _id: null, total: { $sum: '$amount' } } }
      ]),
      PaymentTransaction.aggregate([
        { $match: { type: { $in: ['restaurant_weekly_payout', 'rider_weekly_payout'] } } },
        { $group: { _id: null, total: { $sum: '$amount' } } }
      ]),
      RiderWallet.countDocuments({ isFrozen: true }),
      RestaurantWallet.aggregate([{ $group: { _id: null, total: { $sum: '$balance' } } }]),
    ]);
    return res.status(200).json({
      success: true,
      data: {
        totalCODCollected: totalCOD[0]?.total || 0,
        totalOnlinePayments: totalOnline[0]?.total || 0,
        totalCommissionEarned: totalCommission[0]?.total || 0,
        totalPaidOut: totalPaidOut[0]?.total || 0,
        frozenRidersCount: frozenCount,
        pendingRestaurantPayouts: pendingPayouts[0]?.total || 0,
      }
    });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};
exports.triggerWeeklyPayout = async (req, res) => {
  try {
    const results = await processWeeklyPayouts();
    return res.status(200).json({
      success: true,
      message: `Payout complete: ${results.restaurants.length} restaurants, ${results.riders.length} riders`,
      data: results
    });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};
exports.calculateDeliveryFee = async (req, res) => {
  try {
    const { distanceKm } = req.body;
    if (distanceKm === undefined) {
      return res.status(400).json({ success: false, message: 'distanceKm is required' });
    }
    const result = calculateDeliveryCharges(parseFloat(distanceKm));
    return res.status(200).json({ success: true, data: result });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};
exports.getAllTransactions = async (req, res) => {
  try {
    const { page = 1, limit = 20, type } = req.query;
    const skip = (page - 1) * limit;
    const filter = type ? { type } : {};
    const [transactions, total] = await Promise.all([
      PaymentTransaction.find(filter)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(parseInt(limit))
        .populate('order', 'totalAmount paymentMethod status')
        .populate('rider', 'user')
        .populate('restaurant', 'name'),
      PaymentTransaction.countDocuments(filter)
    ]);
    return res.status(200).json({
      success: true,
      data: { transactions, total, page: parseInt(page), pages: Math.ceil(total / limit) }
    });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};
// ─── GET ALL RESTAURANT WALLETS ──────────────────────────────
exports.getAllRestaurantWallets = async (req, res) => {
  try {
    const restaurants = await Restaurant.find({ isActive: true })
      .select('name email phoneNumber')
      .lean();

    const restaurantWallets = await Promise.all(
      restaurants.map(async (restaurant) => {
        const wallet = await RestaurantWallet.findOne({ restaurant: restaurant._id }).lean();
        return {
          _id: restaurant._id,
          name: restaurant.name,
          email: restaurant.email,
          phoneNumber: restaurant.phoneNumber,
          wallet: wallet || { balance: 0, totalEarnings: 0 }
        };
      })
    );

    return res.status(200).json({
      success: true,
      data: restaurantWallets
    });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

// ─── GET ALL RIDER WALLETS ──────────────────────────────
exports.getAllRiderWallets = async (req, res) => {
  try {
    const riders = await Rider.find({ isActive: true })
      .populate('user', 'firstName lastName phoneNumber email')
      .select('user totalDeliveries averageRating')
      .lean();

    const riderWallets = await Promise.all(
      riders.map(async (rider) => {
        const wallet = await RiderWallet.findOne({ rider: rider._id }).lean();
        return {
          _id: rider._id,
          name: rider.user?.firstName + ' ' + (rider.user?.lastName || ''),
          phoneNumber: rider.user?.phoneNumber,
          email: rider.user?.email,
          totalDeliveries: rider.totalDeliveries || 0,
          averageRating: rider.averageRating || 0,
          wallet: wallet || { availableBalance: 0, totalEarnings: 0, cashInHand: 0 }
        };
      })
    );

    return res.status(200).json({
      success: true,
      data: riderWallets
    });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

exports.getRiderPayouts = async (req, res) => {
  try {
    const { riderId } = req.params;
    const [payouts, total] = await Promise.all([
      Payout.find({ rider: riderId }).sort({ createdAt: -1 }).limit(50).populate('processedBy', 'firstName lastName').lean(),
      Payout.countDocuments({ rider: riderId })
    ]);
    return res.status(200).json({ success: true, data: { payouts, total } });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

exports.getRestaurantPayouts = async (req, res) => {
  try {
    const { restaurantId } = req.params;
    const [payouts, total] = await Promise.all([
      Payout.find({ restaurant: restaurantId }).sort({ createdAt: -1 }).limit(50).populate('processedBy', 'firstName lastName').lean(),
      Payout.countDocuments({ restaurant: restaurantId })
    ]);
    return res.status(200).json({ success: true, data: { payouts, total } });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

exports.createRiderPayout = async (req, res) => {
  try {
    const { riderId, amount, paymentMethod = 'bank_transfer', notes } = req.body;
    const payoutAmount = Number(amount);
    if (!riderId || !Number.isFinite(payoutAmount) || payoutAmount <= 0) {
      return res.status(400).json({ success: false, message: 'riderId and valid positive amount are required' });
    }
    const rider = await Rider.findById(riderId);
    if (!rider) return res.status(404).json({ success: false, message: 'Rider not found' });
    const wallet = await RiderWallet.findOne({ rider: riderId });
    if (!wallet) return res.status(404).json({ success: false, message: 'Wallet not found' });
    if (wallet.availableBalance < payoutAmount) {
      return res.status(400).json({
        success: false,
        message: `Insufficient balance. Available: ₹${wallet.availableBalance}`
      });
    }
    const payout = await Payout.create({
      rider: riderId,
      amount: payoutAmount,
      paymentMethod,
      notes,
      status: 'pending',
      processedBy: req.user._id
    });
    wallet.availableBalance -= payoutAmount;
    wallet.totalPayouts += payoutAmount;
    wallet.lastPayoutAt = new Date();
    wallet.lastPayoutAmount = payoutAmount;
    await wallet.save();

    await PaymentTransaction.create({
      rider: riderId,
      type: 'rider_manual_payout',
      amount: payoutAmount,
      processedBy: req.user._id,
      note: notes || `Manual rider payout initiated via ${paymentMethod}`,
      status: 'pending'
    });

    return res.status(201).json({ success: true, message: 'Payout created successfully', data: payout });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

exports.createRestaurantPayout = async (req, res) => {
  try {
    const { restaurantId, amount, paymentMethod = 'bank_transfer', notes } = req.body;
    const payoutAmount = Number(amount);
    if (!restaurantId || !Number.isFinite(payoutAmount) || payoutAmount <= 0) {
      return res.status(400).json({ success: false, message: 'restaurantId and valid positive amount are required' });
    }
    const restaurant = await Restaurant.findById(restaurantId);
    if (!restaurant) return res.status(404).json({ success: false, message: 'Restaurant not found' });
    const wallet = await RestaurantWallet.findOne({ restaurant: restaurantId });
    if (!wallet) return res.status(404).json({ success: false, message: 'Wallet not found' });
    if (wallet.balance < payoutAmount) return res.status(400).json({ success: false, message: `Insufficient balance. Available: ₹${wallet.balance}` });
    const payout = await Payout.create({
      restaurant: restaurantId,
      amount: payoutAmount,
      paymentMethod,
      notes,
      status: 'pending',
      processedBy: req.user._id
    });
    wallet.balance -= payoutAmount;
    wallet.totalPaidOut += payoutAmount;
    wallet.lastPayoutAt = new Date();
    wallet.lastPayoutAmount = payoutAmount;
    await wallet.save();

    await PaymentTransaction.create({
      restaurant: restaurantId,
      type: 'restaurant_manual_payout',
      amount: payoutAmount,
      processedBy: req.user._id,
      note: notes || `Manual restaurant payout initiated via ${paymentMethod}`,
      status: 'pending'
    });

    return res.status(201).json({ success: true, message: 'Payout created successfully', data: payout });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};