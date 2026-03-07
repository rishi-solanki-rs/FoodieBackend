const User = require('../models/User');
const WalletTransaction = require('../models/WalletTransaction');
const { formatWalletTransaction } = require('../utils/responseFormatter');
exports.getWalletDetails = async (req, res) => {
    try {
        const user = await User.findById(req.user._id).select('walletBalance');
        if (!user) {
            return res.status(404).json({ message: "User not found" });
        }
        const transactions = await WalletTransaction.find({ user: req.user._id }).sort({ createdAt: -1 });
        const formattedTransactions = transactions.map(t => formatWalletTransaction(t));
        res.status(200).json({
            balance: user.walletBalance,
            history: formattedTransactions
        });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};
exports.getWalletDetailsByUserId = async (req, res) => {
    try {
        const { userId } = req.params;
        if (req.user._id.toString() !== userId && req.user.role !== 'admin') {
            return res.status(403).json({ message: "Not authorized to access this wallet" });
        }
        const user = await User.findById(userId).select('walletBalance firstName lastName email');
        if (!user) {
            return res.status(404).json({ message: "User not found" });
        }
        const transactions = await WalletTransaction.find({ user: userId }).sort({ createdAt: -1 });
        const formattedTransactions = transactions.map(t => formatWalletTransaction(t));
        res.status(200).json({
            user: { id: user._id, name: user.firstName + ' ' + user.lastName, email: user.email },
            balance: user.walletBalance,
            history: formattedTransactions
        });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};
exports.addMoneyToWallet = async (req, res) => {
    try {
        const { amount, transactionId } = req.body;
        if (!amount || amount <= 0) {
            return res.status(400).json({ message: "Invalid amount" });
        }
        const user = await User.findById(req.user._id);
        if (!user) {
            return res.status(404).json({ message: "User not found" });
        }
        user.walletBalance += Number(amount);
        await user.save();
        const transaction = await WalletTransaction.create({
            user: req.user._id,
            amount: amount,
            type: 'credit',
            description: 'Added money to wallet',
            transactionId: transactionId || 'TXN_' + Date.now()
        });
        res.status(201).json({
            message: "Money added successfully",
            balance: user.walletBalance,
            transaction: transaction
        });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};
exports.getAllWallets = async (req, res) => {
    try {
        const { page = 1, limit = 10 } = req.query;
        const skip = (page - 1) * limit;
        const wallets = await User.find()
            .select('_id firstName lastName email walletBalance role')
            .limit(limit * 1)
            .skip(skip)
            .sort({ walletBalance: -1 });
        const total = await User.countDocuments();
        res.status(200).json({
            total,
            pages: Math.ceil(total / limit),
            currentPage: page,
            wallets
        });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};
exports.createWallet = async (req, res) => {
    try {
        const { userId, initialBalance } = req.body;
        if (!userId || initialBalance === undefined) {
            return res.status(400).json({ message: "userId and initialBalance are required" });
        }
        const user = await User.findById(userId);
        if (!user) {
            return res.status(404).json({ message: "User not found" });
        }
        user.walletBalance = initialBalance;
        await user.save();
        if (initialBalance > 0) {
            await WalletTransaction.create({
                user: userId,
                amount: initialBalance,
                type: 'credit',
                description: 'Admin wallet initialization',
                adminAction: true
            });
        }
        res.status(201).json({
            message: "Wallet created/initialized",
            wallet: { userId: user._id, balance: user.walletBalance }
        });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};
exports.updateWalletBalance = async (req, res) => {
    try {
        const { userId, amount, description, type } = req.body;
        if (!userId || amount === undefined || !type) {
            return res.status(400).json({ message: "userId, amount, and type are required" });
        }
        if (!['credit', 'debit'].includes(type)) {
            return res.status(400).json({ message: "Type must be 'credit' or 'debit'" });
        }
        const user = await User.findById(userId);
        if (!user) {
            return res.status(404).json({ message: "User not found" });
        }
        const newBalance = type === 'credit'
            ? user.walletBalance + Number(amount)
            : user.walletBalance - Number(amount);
        if (newBalance < 0) {
            return res.status(400).json({ message: "Insufficient wallet balance" });
        }
        user.walletBalance = newBalance;
        await user.save();
        const transaction = await WalletTransaction.create({
            user: userId,
            amount: amount,
            type: type,
            description: description || `Admin ${type} transaction`,
            adminAction: true,
            adminId: req.user._id
        });
        res.status(200).json({
            message: "Wallet updated successfully",
            wallet: { userId: user._id, balance: user.walletBalance },
            transaction
        });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};
exports.deleteTransaction = async (req, res) => {
    try {
        const { transactionId } = req.params;
        const transaction = await WalletTransaction.findById(transactionId);
        if (!transaction) {
            return res.status(404).json({ message: "Transaction not found" });
        }
        const user = await User.findById(transaction.user);
        if (transaction.type === 'credit') {
            user.walletBalance -= transaction.amount;
        } else {
            user.walletBalance += transaction.amount;
        }
        await user.save();
        await WalletTransaction.findByIdAndDelete(transactionId);
        res.status(200).json({ message: "Transaction deleted and wallet reversed" });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};
exports.getTransactionHistory = async (req, res) => {
    try {
        const { userId } = req.params;
        const { page = 1, limit = 20 } = req.query;
        const skip = (page - 1) * limit;
        if (req.user._id.toString() !== userId && req.user.role !== 'admin') {
            return res.status(403).json({ message: "Not authorized to view this history" });
        }
        const transactions = await WalletTransaction.find({ user: userId })
            .limit(limit * 1)
            .skip(skip)
            .sort({ createdAt: -1 });
        const total = await WalletTransaction.countDocuments({ user: userId });
        res.status(200).json({
            total,
            pages: Math.ceil(total / limit),
            currentPage: page,
            transactions
        });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};
exports.getRiderWallet = async (req, res) => {
    try {
        const { riderId } = req.params;
        const RiderWallet = require('../models/RiderWallet');
        const Rider = require('../models/Rider');
        const rider = await Rider.findById(riderId)
            .select('_id isOnline isAvailable verificationStatus vehicle currentLocation')
            .populate('user', 'name email mobile profilePic');
        if (!rider) return res.status(404).json({ message: "Rider not found" });
        const riderWallet = await RiderWallet.findOne({ rider: riderId });
        if (!riderWallet) return res.status(404).json({ message: "Rider wallet not found" });
        const transactions = await WalletTransaction.find({ user: rider.user?._id })
            .limit(20)
            .sort({ createdAt: -1 });
        res.status(200).json({
            rider: {
                id: rider._id,
                name: rider.user?.name,
                email: rider.user?.email,
                mobile: rider.user?.mobile,
                profilePic: rider.user?.profilePic,
                vehicle: rider.vehicle,
                verificationStatus: rider.verificationStatus,
            },
            wallet: {
                cashInHand: riderWallet.cashInHand,
                cashLimit: riderWallet.cashLimit,
                totalEarnings: riderWallet.totalEarnings,
                availableBalance: riderWallet.availableBalance,
                isFrozen: riderWallet.isFrozen,
                frozenAt: riderWallet.frozenAt,
                frozenReason: riderWallet.frozenReason,
                lastDepositAt: riderWallet.lastDepositAt,
                lastDepositAmount: riderWallet.lastDepositAmount,
                lastPayoutAt: riderWallet.lastPayoutAt,
                lastPayoutAmount: riderWallet.lastPayoutAmount,
                totalPayouts: riderWallet.totalPayouts,
            },
            recentTransactions: transactions,
        });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};
exports.getAllRidersWallets = async (req, res) => {
    try {
        const { page = 1, limit = 10 } = req.query;
        const skip = (page - 1) * limit;
        const RiderWallet = require('../models/RiderWallet');
        const [ridersWallets, total] = await Promise.all([
            RiderWallet.find()
                .populate({ path: 'rider', populate: { path: 'user', select: 'name email mobile' } })
                .limit(Number(limit))
                .skip(skip)
                .sort({ totalEarnings: -1 }),
            RiderWallet.countDocuments(),
        ]);
        res.status(200).json({
            total,
            pages: Math.ceil(total / limit),
            currentPage: Number(page),
            ridersWallets: ridersWallets.map(rw => ({
                riderId: rw.rider?._id,
                riderName: rw.rider?.user?.name,
                email: rw.rider?.user?.email,
                mobile: rw.rider?.user?.mobile,
                cashInHand: rw.cashInHand,
                cashLimit: rw.cashLimit,
                totalEarnings: rw.totalEarnings,
                availableBalance: rw.availableBalance,
                isFrozen: rw.isFrozen,
                totalPayouts: rw.totalPayouts,
            })),
        });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};
exports.getRestaurantWallet = async (req, res) => {
    try {
        const { restaurantId } = req.params;
        const RestaurantWallet = require('../models/RestaurantWallet');
        const Restaurant = require('../models/Restaurant');
        const restaurant = await Restaurant.findById(restaurantId)
            .select('_id name email contactNumber city owner');
        if (!restaurant) return res.status(404).json({ message: "Restaurant not found" });
        const restaurantWallet = await RestaurantWallet.findOne({ restaurant: restaurantId });
        if (!restaurantWallet) return res.status(404).json({ message: "Restaurant wallet not found" });
        const nextPayoutDate = restaurantWallet.nextPayoutDate || new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
        res.status(200).json({
            restaurant: {
                id: restaurant._id,
                name: restaurant.name,
                email: restaurant.email,
                phone: restaurant.contactNumber,
                city: restaurant.city,
                owner: restaurant.owner,
            },
            wallet: {
                balance: restaurantWallet.balance,
                totalEarnings: restaurantWallet.totalEarnings,
                totalPaidOut: restaurantWallet.totalPaidOut,
                pendingAmount: restaurantWallet.pendingAmount,
                lastPayoutAt: restaurantWallet.lastPayoutAt,
                lastPayoutAmount: restaurantWallet.lastPayoutAmount,
                nextPayoutDate,
            },
        });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};
exports.getAllRestaurantsWallets = async (req, res) => {
    try {
        const { page = 1, limit = 10 } = req.query;
        const skip = (page - 1) * limit;
        const RestaurantWallet = require('../models/RestaurantWallet');
        const [restaurantsWallets, total] = await Promise.all([
            RestaurantWallet.find()
                .populate('restaurant', 'name email contactNumber city owner')
                .limit(Number(limit))
                .skip(skip)
                .sort({ totalEarnings: -1 }),
            RestaurantWallet.countDocuments(),
        ]);
        res.status(200).json({
            total,
            pages: Math.ceil(total / limit),
            currentPage: Number(page),
            restaurantsWallets: restaurantsWallets.map(rw => ({
                restaurantId: rw.restaurant?._id,
                restaurantName: rw.restaurant?.name,
                email: rw.restaurant?.email,
                phone: rw.restaurant?.contactNumber,
                city: rw.restaurant?.city,
                balance: rw.balance,
                totalEarnings: rw.totalEarnings,
                totalPaidOut: rw.totalPaidOut,
                pendingAmount: rw.pendingAmount,
                lastPayoutAt: rw.lastPayoutAt,
                nextPayoutDate: rw.nextPayoutDate,
            })),
        });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};
