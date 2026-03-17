const Order = require("../models/Order");
const User = require("../models/User");
const Restaurant = require("../models/Restaurant");
const Rider = require("../models/Rider");
exports.getOverview = async (req, res) => {
  try {
    const [totalUsers, totalRiders, totalRestaurants, totalOrdersAllTime] = await Promise.all([
      User.countDocuments({ isDeleted: { $ne: true } }),
      Rider.countDocuments({}),
      Restaurant.countDocuments({}),
      Order.countDocuments({}),
    ]);
    const deliveredMatch = { status: "delivered" };
    const earningsAgg = await Order.aggregate([
      { $match: deliveredMatch },
      {
        $group: {
          _id: null,
          totalEarnings: { $sum: { $ifNull: ["$totalAmount", 0] } },
          totalCommission: {
            $sum: {
              $subtract: [
                { $ifNull: ["$paymentBreakdown.totalAdminCommissionDeduction", 0] },
                { $ifNull: ["$paymentBreakdown.adminCommissionGst", 0] },
              ],
            },
          },
          totalRestaurantCommission: {
            $sum: { $ifNull: ["$paymentBreakdown.restaurantNet", 0] },
          },
          totalDeliveryCommission: {
            $sum: {
              $ifNull: ["$riderEarnings.totalRiderEarning", 0],
            },
          },
        },
      },
    ]);
    const totalsRow = earningsAgg[0] || {};
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    const end = new Date();
    end.setHours(23, 59, 59, 999);
    const todayAgg = await Order.aggregate([
      { $match: { ...deliveredMatch, deliveredAt: { $gte: start, $lte: end } } },
      { $group: { _id: null, total: { $sum: { $ifNull: ["$totalAmount", 0] } } } },
    ]);
    const todayEarnings = todayAgg[0]?.total || 0;

    const [todayOrders, todayOrderValueAgg] = await Promise.all([
      Order.countDocuments({ createdAt: { $gte: start, $lte: end } }),
      Order.aggregate([
        { $match: { createdAt: { $gte: start, $lte: end }, status: { $ne: "cancelled" } } },
        { $group: { _id: null, total: { $sum: { $ifNull: ["$totalAmount", 0] } } } },
      ]),
    ]);
    const todayOrderValue = Number(todayOrderValueAgg?.[0]?.total || 0);
    const statusAgg = await Order.aggregate([
      { $match: { createdAt: { $gte: start, $lte: end } } },
      {
        $group: {
          _id: "$status",
          count: { $sum: 1 },
        },
      },
    ]);
    const statusMap = statusAgg.reduce((acc, r) => {
      acc[r._id] = r.count;
      return acc;
    }, {});
    const ordersDelivered = statusMap["delivered"] || 0;
    const ordersCancelled = statusMap["cancelled"] || 0;
    const ordersFailed = statusMap["failed"] || 0;
    const monthsBack = 12;
    const monthStart = new Date();
    monthStart.setMonth(monthStart.getMonth() - (monthsBack - 1));
    monthStart.setDate(1);
    monthStart.setHours(0, 0, 0, 0);
    const monthlyAgg = await Order.aggregate([
      { $match: { createdAt: { $gte: monthStart } } },
      {
        $group: {
          _id: { $dateToString: { format: "%Y-%m", date: "$createdAt" } },
          orders: { $sum: 1 },
        },
      },
      { $sort: { _id: 1 } },
    ]);
    const monthNames = [
      "Jan",
      "Feb",
      "Mar",
      "Apr",
      "May",
      "Jun",
      "Jul",
      "Aug",
      "Sep",
      "Oct",
      "Nov",
      "Dec",
    ];
    const salesSeries = [];
    for (let i = 0; i < monthsBack; i++) {
      const d = new Date(monthStart);
      d.setMonth(monthStart.getMonth() + i);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      const label = monthNames[d.getMonth()];
      const row = monthlyAgg.find((m) => m._id === key);
      salesSeries.push({ month: label, orders: row ? row.orders : 0 });
    }
    const recentOrdersDocs = await Order.find({})
      .select("_id orderNumber status totalAmount createdAt timeline customer restaurant rider")
      .populate('customer', 'name')
      .populate('restaurant', 'name')
      .populate({ path: 'rider', select: 'user name', populate: { path: 'user', select: 'name' } })
      .sort({ createdAt: -1 })
      .limit(15)
      .lean();

    const toDisplayName = (value) => {
      if (!value) return null;
      if (typeof value === 'string') return value;
      if (typeof value === 'object') {
        if (value.en) return value.en;
        if (value.name) return toDisplayName(value.name);
      }
      return null;
    };

    const recentOrders = recentOrdersDocs.map((o) => ({
      id: String(o._id),
      orderNumber: o.orderNumber || null,
      status: o.status,
      amount: Number(o.totalAmount || 0).toFixed(2),
      customerName: toDisplayName(o.customer?.name) || 'Customer',
      restaurantName: toDisplayName(o.restaurant?.name) || 'Restaurant',
      riderName: toDisplayName(o.rider?.user?.name) || toDisplayName(o.rider?.name) || null,
      timeline: Array.isArray(o.timeline)
        ? o.timeline.map((entry) => ({
            status: entry?.status,
            label: entry?.label || null,
            timestamp: entry?.timestamp || null,
            description: entry?.description || null,
          }))
        : [],
    }));
    const topRestaurantsAgg = await Order.aggregate([
      { $match: deliveredMatch },
      { $group: { _id: "$restaurant", orders: { $sum: 1 }, amount: { $sum: { $ifNull: ["$totalAmount", 0] } } } },
      { $sort: { orders: -1, amount: -1 } },
      { $limit: 5 },
      {
        $lookup: {
          from: "restaurants",
          localField: "_id",
          foreignField: "_id",
          as: "restaurant",
        },
      },
      { $unwind: { path: "$restaurant", preserveNullAndEmptyArrays: true } },
      {
        $project: {
          name: { $ifNull: ["$restaurant.name.en", "$restaurant.name"] },
          orders: 1,
          amount: 1,
        },
      },
    ]);
    const topRestaurants = topRestaurantsAgg.map((r) => ({
      name: r.name || "Unknown",
      orders: r.orders || 0,
      amount: Number(r.amount || 0).toFixed(2),
    }));
    const topUsersAgg = await Order.aggregate([
      { $match: deliveredMatch },
      { $group: { _id: "$customer", orders: { $sum: 1 }, amount: { $sum: { $ifNull: ["$totalAmount", 0] } } } },
      { $sort: { orders: -1, amount: -1 } },
      { $limit: 5 },
      {
        $lookup: {
          from: "users",
          localField: "_id",
          foreignField: "_id",
          as: "user",
        },
      },
      { $unwind: { path: "$user", preserveNullAndEmptyArrays: true } },
      { $project: { name: "$user.name", orders: 1, amount: 1 } },
    ]);
    const topUsers = topUsersAgg.map((u) => ({
      name: u.name || "",
      orders: u.orders || 0,
      amount: Number(u.amount || 0).toFixed(2),
    }));
    res.status(200).json({
      totalUsers,
      totalRiders,
      totalRestaurants,
      totalOrdersAllTime,
      todayOrders,
      todayOrderValue,
      totalEarnings: Number(totalsRow.totalEarnings || 0),
      todayEarnings,
      totalCommission: Number(totalsRow.totalCommission || 0),
      totalRestaurantCommission: Number(totalsRow.totalRestaurantCommission || 0),
      totalDeliveryCommission: Number(totalsRow.totalDeliveryCommission || 0),
      ordersDelivered,
      ordersCancelled,
      ordersFailed,
      salesSeries,
      recentOrders,
      topRestaurants,
      topUsers,
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};
