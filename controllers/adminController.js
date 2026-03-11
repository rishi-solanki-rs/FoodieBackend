const Order = require("../models/Order");
const User = require("../models/User");
const Restaurant = require("../models/Restaurant");
const Rider = require("../models/Rider");
const Product = require("../models/Product");
const WalletTransaction = require("../models/WalletTransaction");
const { sendNotification } = require("../utils/notificationService");
const { getPaginationParams } = require('../utils/pagination');
const normalizeTranslation = (value) => {
  if (!value) return null;
  if (typeof value === "string") return { en: value };
  if (typeof value === "object") {
    if (value.en) return value;
    const fallback = value.de || value.ar;
    if (fallback) return { ...value, en: fallback };
  }
  return null;
};
const ensureNameEn = (value, fallback) => {
  const normalized = normalizeTranslation(value);
  if (normalized && normalized.en) return { value: normalized, usedFallback: false };
  if (fallback) return { value: { en: fallback }, usedFallback: true };
  return { value: null, usedFallback: false };
};
const normalizeNamedList = (list) => {
  if (!Array.isArray(list)) return list;
  return list.map((item) => {
    if (!item) return item;
    if (typeof item.name === "string") {
      return { ...item, name: { en: item.name } };
    }
    if (item.name && typeof item.name === "object" && !item.name.en) {
      const fallback = item.name.de || item.name.ar;
      if (fallback) return { ...item, name: { ...item.name, en: fallback } };
    }
    return item;
  });
};
const normalizeCommissionPercent = (value) => {
  if (value === undefined || value === null || value === "") return null;
  const num = Number(value);
  if (!Number.isFinite(num)) return null;
  return Math.max(0, Math.min(100, num));
};

exports.getDashboard = async (req, res) => {
  try {
    const totalOrders = await Order.countDocuments({});
    const inProgressStatuses = [
      "placed",
      "accepted",
      "accepted_by_rider",
      "preparation",
      "ready",
      "assigned",
      "picked_up",
      "arrived_restaurant",
      "arrived_customer",
    ];
    const liveOrders = await Order.countDocuments({
      status: { $in: inProgressStatuses },
    });
    const totalUsers = await User.countDocuments({ isDeleted: { $ne: true } });
    const totalRestaurants = await Restaurant.countDocuments({});
    const totalRiders = await Rider.countDocuments({});
    const revenueAgg = await Order.aggregate([
      { $match: { status: { $ne: "cancelled" } } },
      {
        $group: {
          _id: null,
          totalRevenue: { $sum: { $ifNull: ["$totalAmount", 0] } },
        },
      },
    ]);
    const totalEarnings =
      revenueAgg[0] && revenueAgg[0].totalRevenue
        ? revenueAgg[0].totalRevenue
        : 0;
    const commissionAgg = await Order.aggregate([
      { $match: { status: { $ne: "cancelled" } } },
      {
        $lookup: {
          from: "restaurants",
          localField: "restaurant",
          foreignField: "_id",
          as: "restaurant",
        },
      },
      { $unwind: { path: "$restaurant", preserveNullAndEmptyArrays: true } },
      {
        $project: {
          totalAmount: { $ifNull: ["$totalAmount", 0] },
          adminCommission: { $ifNull: ["$restaurant.adminCommission", 0] },
        },
      },
      {
        $project: {
          commission: {
            $multiply: ["$totalAmount", { $divide: ["$adminCommission", 100] }],
          },
        },
      },
      { $group: { _id: null, totalCommission: { $sum: "$commission" } } },
    ]);
    const totalCommission = commissionAgg[0]
      ? commissionAgg[0].totalCommission
      : 0;
    const heatAgg = await Order.aggregate([
      { $match: { status: { $in: inProgressStatuses } } },
      {
        $lookup: {
          from: "restaurants",
          localField: "restaurant",
          foreignField: "_id",
          as: "restaurant",
        },
      },
      { $unwind: { path: "$restaurant", preserveNullAndEmptyArrays: true } },
      { $group: { _id: "$restaurant.city", count: { $sum: 1 } } },
      { $sort: { count: -1 } },
      { $limit: 100 },
    ]);
    const heatmap = heatAgg.map((h) => ({
      area: h._id || "Unknown",
      activeOrders: h.count,
    }));
    const today = new Date();
    const start = new Date();
    start.setDate(today.getDate() - 29);
    start.setHours(0, 0, 0, 0);
    const salesAgg = await Order.aggregate([
      { $match: { status: { $ne: "cancelled" }, createdAt: { $gte: start } } },
      {
        $group: {
          _id: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt" } },
          revenue: { $sum: { $ifNull: ["$totalAmount", 0] } },
          orders: { $sum: 1 },
        },
      },
      { $sort: { _id: 1 } },
    ]);
    const salesSeries = [];
    for (let i = 0; i < 30; i++) {
      const d = new Date(start);
      d.setDate(start.getDate() + i);
      const key = d.toISOString().split("T")[0];
      const row = salesAgg.find((s) => s._id === key);
      salesSeries.push({
        date: key,
        revenue: row ? row.revenue : 0,
        orders: row ? row.orders : 0,
      });
    }
    res.status(200).json({
      totals: {
        totalOrders,
        liveOrders,
        totalUsers,
        totalRestaurants,
        totalRiders,
        totalEarnings,
        totalCommission,
      },
      heatmap,
      salesSeries,
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};
exports.getOrdersDashboard = async (req, res) => {
  try {
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    const end = new Date();
    end.setHours(23, 59, 59, 999);
    const totalOrdersInDB = await Order.countDocuments({});
    console.log('🗄️ Total orders in database:', totalOrdersInDB);
    const totalToday = await Order.countDocuments({ createdAt: { $gte: start, $lte: end } });
    const completedToday = await Order.countDocuments({
      status: 'delivered',
      createdAt: { $gte: start, $lte: end }
    });
    const cancelledToday = await Order.countDocuments({ status: 'cancelled', createdAt: { $gte: start, $lte: end } });
    const processingStatuses = [
      'placed',
      'accepted',
      'accepted_by_rider',
      'preparation',
      'ready',
      'assigned',
      'picked_up',
      'arrived_restaurant',
      'arrived_customer',
    ];
    const processingToday = await Order.countDocuments({ status: { $in: processingStatuses }, createdAt: { $gte: start, $lte: end } });
    const limit = parseInt(req.query.limit) || 10;
    const recentOrders = await Order.find({})
      .populate('customer', 'name mobile')
      .populate('restaurant', 'name')
      .populate('rider', 'name mobile')
      .sort({ createdAt: -1 })
      .limit(limit)
      .lean();
    const newOrdersToday = await Order.countDocuments({ status: 'placed', createdAt: { $gte: start, $lte: end } });
    const stats = [
      { label: 'Today Orders', value: totalToday, type: 'today' },
      { label: 'Today Completed Orders', value: completedToday, type: 'completed' },
      { label: 'Today Cancelled Orders', value: cancelledToday, type: 'cancelled' },
      { label: 'Today Processing Orders', value: processingToday, type: 'processing' }
    ];
    const todayOrders = {
      total: totalToday,
      completedPercent: totalToday > 0 ? Math.round((completedToday / totalToday) * 100) : 0,
      breakdown: [
        { label: 'New Orders', value: newOrdersToday },
        { label: 'Processing Orders', value: processingToday },
        { label: 'Cancelled Orders', value: cancelledToday }
      ]
    };
    const formattedRecentOrders = recentOrders.map(order => {
      const statusType = order.status === 'cancelled' ? 'failed' :
        order.status === 'delivered' ? 'completed' : 'processing';
      const color = statusType === 'failed' ? 'text-red-500' :
        statusType === 'completed' ? 'text-green-500' : 'text-yellow-500';
      return {
        _id: order._id,
        id: `#${order._id.toString().slice(-6).toUpperCase()}`,
        status: order.status.charAt(0).toUpperCase() + order.status.slice(1).replace(/_/g, ' '),
        statusType,
        color,
        amount: `$${Number(order.totalAmount || 0).toFixed(2)}`,
        customer: order.customer,
        restaurant: order.restaurant,
        rider: order.rider,
        createdAt: order.createdAt
      };
    });
    const response = {
      stats,
      todayOrders,
      recentOrders: formattedRecentOrders
    };
    res.status(200).json(response);
  } catch (error) {
    console.error('Orders Dashboard error:', error);
    res.status(500).json({ message: error.message });
  }
};
exports.getRestaurantMenuAdmin = async (req, res) => {
  try {
    const { restaurantId } = req.params;
    const { status } = req.query;
    const filter = { restaurant: restaurantId };
    if (status === "pending") {
      filter.$or = [
        { isApproved: { $ne: true } },
        { pendingUpdate: { $exists: true, $ne: null } },
      ];
    } else if (status === "approved") {
      filter.isApproved = true;
      filter.pendingUpdate = { $exists: false };
    }
    const products = await Product.find(filter)
      .select("_id name description basePrice isApproved approvalNotes approvedAt pendingUpdate pendingUpdateAt restaurant category available isVeg image seasonal seasonTag variations addOns createdAt quantity hsnCode gstPercent adminCommissionPercent")
      .populate('category', 'name description image isActive')
      .sort({ createdAt: -1 })
      .lean();
    res.status(200).json(products);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};
exports.approveRestaurantMenu = async (req, res) => {
  try {
    const targetId = req.params.id;
    const { approved = true, notes, commissionPercent, itemCommissions } = req.body;
    const approvalState =
      typeof approved === "string" ? approved === "true" || approved === "1" : !!approved;
    const defaultCommissionPercent = normalizeCommissionPercent(commissionPercent);
    const commissionMap = itemCommissions && typeof itemCommissions === "object" ? itemCommissions : {};

    const resolveCommissionPercent = (productId, existingPercent, fallbackPercent) => {
      const specific = normalizeCommissionPercent(commissionMap[String(productId)]);
      if (specific !== null) return specific;
      if (defaultCommissionPercent !== null) return defaultCommissionPercent;
      const current = normalizeCommissionPercent(existingPercent);
      if (current !== null) return current;
      return normalizeCommissionPercent(fallbackPercent) ?? 0;
    };
    const product = await Product.findById(targetId);
    if (product) {
      if (product.pendingUpdate) {
        if (approvalState) {
          const pending = product.pendingUpdate;
          if (pending.name !== undefined) {
            product.name = normalizeTranslation(pending.name);
          }
          if (pending.description !== undefined) {
            product.description = normalizeTranslation(pending.description);
          }
          if (pending.image !== undefined) product.image = pending.image;
          if (pending.basePrice !== undefined) product.basePrice = pending.basePrice;
          if (pending.isVeg !== undefined) product.isVeg = pending.isVeg;
          if (pending.seasonal !== undefined) product.seasonal = pending.seasonal;
          if (pending.seasonTag !== undefined) product.seasonTag = pending.seasonTag;
          if (pending.category !== undefined) product.category = pending.category;
          if (pending.variations !== undefined) {
            let normalized = normalizeNamedList(pending.variations) || [];
            if (Array.isArray(normalized)) {
              normalized = normalized.filter((v) => {
                if (!v || !v.name) return false;
                const name = v.name;
                if (typeof name === 'string' && !name.trim()) return false;
                if (typeof name === 'object' && !name.en && !name.de && !name.ar) return false;
                if (typeof v.price !== 'number' || v.price < 0) return false;
                return true;
              });
            }
            product.variations = normalized;
          }
          if (pending.addOns !== undefined) {
            let normalized = normalizeNamedList(pending.addOns) || [];
            if (Array.isArray(normalized)) {
              normalized = normalized.filter((a) => {
                if (!a || !a.name) return false;
                const name = a.name;
                if (typeof name === 'string' && !name.trim()) return false;
                if (typeof name === 'object' && !name.en && !name.de && !name.ar) return false;
                if (typeof a.price !== 'number' || a.price < 0) return false;
                return true;
              });
            }
            product.addOns = normalized;
          }
          product.isApproved = true;
          product.approvedAt = new Date();
          product.adminCommissionPercent = resolveCommissionPercent(
            product._id,
            product.adminCommissionPercent,
            null
          );
        }
        product.pendingUpdate = undefined;
        product.pendingUpdateAt = undefined;
        product.approvalNotes = notes || product.approvalNotes;
      } else {
        product.isApproved = approvalState;
        product.approvalNotes = notes || product.approvalNotes;
        product.approvedAt = approvalState ? new Date() : undefined;
        if (approvalState) {
          product.adminCommissionPercent = resolveCommissionPercent(
            product._id,
            product.adminCommissionPercent,
            null
          );
        }
      }
      if (approvalState) {
        const nameResult = ensureNameEn(product.name, null);
        if (!nameResult.value || !nameResult.value.en) {
          return res.status(400).json({
            message: "Cannot approve product without a valid name.en",
            productId: product._id
          });
        }
        product.name = nameResult.value;
      }
      await product.save();
      return res.status(200).json({
        message: `Menu item ${approvalState ? "approved" : "updated"}`,
        product,
      });
    }
    const restaurant = await Restaurant.findById(targetId);
    if (!restaurant) {
      return res
        .status(404)
        .json({ message: "Restaurant or menu item not found" });
    }
    const products = await Product.find({ restaurant: restaurant._id });
    let modifiedCount = 0;
    for (const item of products) {
      if (item.pendingUpdate) {
        if (approvalState) {
          const pending = item.pendingUpdate;
          if (pending.name !== undefined) {
            item.name = normalizeTranslation(pending.name);
          }
          if (pending.description !== undefined) {
            item.description = normalizeTranslation(pending.description);
          }
          if (pending.image !== undefined) item.image = pending.image;
          if (pending.basePrice !== undefined) item.basePrice = pending.basePrice;
          if (pending.isVeg !== undefined) item.isVeg = pending.isVeg;
          if (pending.seasonal !== undefined) item.seasonal = pending.seasonal;
          if (pending.seasonTag !== undefined) item.seasonTag = pending.seasonTag;
          if (pending.category !== undefined) item.category = pending.category;
          if (pending.variations !== undefined) {
            let normalized = normalizeNamedList(pending.variations) || [];
            if (Array.isArray(normalized)) {
              normalized = normalized.filter((v) => {
                if (!v || !v.name) return false;
                const name = v.name;
                if (typeof name === 'string' && !name.trim()) return false;
                if (typeof name === 'object' && !name.en && !name.de && !name.ar) return false;
                if (typeof v.price !== 'number' || v.price < 0) return false;
                return true;
              });
            }
            item.variations = normalized;
          }
          if (pending.addOns !== undefined) {
            let normalized = normalizeNamedList(pending.addOns) || [];
            if (Array.isArray(normalized)) {
              normalized = normalized.filter((a) => {
                if (!a || !a.name) return false;
                const name = a.name;
                if (typeof name === 'string' && !name.trim()) return false;
                if (typeof name === 'object' && !name.en && !name.de && !name.ar) return false;
                if (typeof a.price !== 'number' || a.price < 0) return false;
                return true;
              });
            }
            item.addOns = normalized;
          }
          item.isApproved = true;
          item.approvedAt = new Date();
          item.adminCommissionPercent = resolveCommissionPercent(
            item._id,
            item.adminCommissionPercent,
            restaurant.adminCommission
          );
        }
        if (approvalState) {
          const nameResult = ensureNameEn(item.name, null);
          if (!nameResult.value || !nameResult.value.en) {
            console.warn(`Skipping approval for product ${item._id} - missing name.en`);
            continue;
          }
          item.name = nameResult.value;
        }
        item.pendingUpdate = undefined;
        item.pendingUpdateAt = undefined;
        item.approvalNotes = notes || item.approvalNotes;
        await item.save();
        modifiedCount += 1;
        continue;
      }
      if (!item.isApproved && approvalState) {
        const nameResult = ensureNameEn(item.name, null);
        if (!nameResult.value || !nameResult.value.en) {
          console.warn(`Skipping approval for product ${item._id} - missing name.en`);
          continue;
        }
        item.name = nameResult.value;
        item.isApproved = true;
        item.approvedAt = new Date();
        item.approvalNotes = notes || item.approvalNotes;
        item.adminCommissionPercent = resolveCommissionPercent(
          item._id,
          item.adminCommissionPercent,
          restaurant.adminCommission
        );
        await item.save();
        modifiedCount += 1;
      } else if (!item.isApproved && !approvalState && notes) {
        item.approvalNotes = notes || item.approvalNotes;
        await item.save();
        modifiedCount += 1;
      }
    }
    restaurant.menuApproved = approvalState;
    restaurant.menuApprovedAt = approvalState ? new Date() : undefined;
    restaurant.menuApprovalNotes = notes || restaurant.menuApprovalNotes;
    await restaurant.save();
    res.status(200).json({
      message: `Restaurant menu ${approvalState ? "approved" : "updated"}`,
      modifiedCount,
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};
exports.approveProduct = async (req, res) => {
  try {
    const productId = req.params.id;
    const { approved = true, notes, commissionPercent } = req.body;
    const approvalState =
      typeof approved === "string" ? approved === "true" || approved === "1" : !!approved;
    const normalizedCommission = normalizeCommissionPercent(commissionPercent);
    const product = await Product.findById(productId);
    if (!product) return res.status(404).json({ message: "Product not found" });
    if (product.pendingUpdate) {
      if (approvalState) {
        const pending = product.pendingUpdate;
        if (pending.name !== undefined) {
          product.name = normalizeTranslation(pending.name);
        }
        if (pending.description !== undefined) {
          product.description = normalizeTranslation(pending.description);
        }
        if (pending.image !== undefined) product.image = pending.image;
        if (pending.basePrice !== undefined) product.basePrice = pending.basePrice;
        if (pending.isVeg !== undefined) product.isVeg = pending.isVeg;
        if (pending.seasonal !== undefined) product.seasonal = pending.seasonal;
        if (pending.seasonTag !== undefined) product.seasonTag = pending.seasonTag;
        if (pending.category !== undefined) product.category = pending.category;
        if (pending.variations !== undefined) {
          product.variations = normalizeNamedList(pending.variations);
        }
        if (pending.addOns !== undefined) {
          product.addOns = normalizeNamedList(pending.addOns);
        }
        product.isApproved = true;
        product.approvedAt = new Date();
        if (normalizedCommission !== null) {
          product.adminCommissionPercent = normalizedCommission;
        } else if (product.adminCommissionPercent === null || product.adminCommissionPercent === undefined) {
          const restaurant = await Restaurant.findById(product.restaurant).select('adminCommission').lean();
          product.adminCommissionPercent = normalizeCommissionPercent(restaurant?.adminCommission) ?? 0;
        }
      }
      product.pendingUpdate = undefined;
      product.pendingUpdateAt = undefined;
      product.approvalNotes = notes || product.approvalNotes;
    } else {
      product.isApproved = approvalState;
      product.approvalNotes = notes || product.approvalNotes;
      product.approvedAt = approvalState ? new Date() : undefined;
      if (approvalState) {
        if (normalizedCommission !== null) {
          product.adminCommissionPercent = normalizedCommission;
        } else if (product.adminCommissionPercent === null || product.adminCommissionPercent === undefined) {
          const restaurant = await Restaurant.findById(product.restaurant).select('adminCommission').lean();
          product.adminCommissionPercent = normalizeCommissionPercent(restaurant?.adminCommission) ?? 0;
        }
      }
    }
    if (approvalState) {
      const nameResult = ensureNameEn(product.name, null);
      if (!nameResult.value || !nameResult.value.en) {
        return res.status(400).json({
          message: "Cannot approve product without a valid name.en",
          productId: product._id
        });
      }
      product.name = nameResult.value;
    }
    await product.save();
    res.status(200).json({ message: `Product ${approvalState ? "approved" : "updated"}`, product });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};
exports.rejectProduct = async (req, res) => {
  try {
    const productId = req.params.id;
    const { notes } = req.body;
    const product = await Product.findById(productId);
    if (!product) return res.status(404).json({ message: "Product not found" });
    product.isRejected = true;
    product.rejectedAt = new Date();
    product.isApproved = false;
    product.approvalNotes = notes || product.approvalNotes;
    if (product.pendingUpdate) {
      product.pendingUpdate = undefined;
      product.pendingUpdateAt = undefined;
    }
    await product.save();
    res.status(200).json({ message: "Product rejected", product });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

/**
 * PUT /api/admin/products/:id/discount
 * Admin only — set or remove a discount on a specific product.
 *
 * Body:
 *   { type: "percent"|"flat", value: 10, reason: "Festival offer", active: true }
 *   To remove: { value: 0 } or { active: false }
 */
exports.setProductDiscount = async (req, res) => {
  try {
    const { id } = req.params;
    const { type, value, reason, active } = req.body;

    const product = await Product.findById(id);
    if (!product) return res.status(404).json({ success: false, message: "Product not found" });

    // Validate type
    const discountType = type === 'flat' ? 'flat' : 'percent';

    // Validate value
    const discountValue = Number(value ?? 0);
    if (isNaN(discountValue) || discountValue < 0) {
      return res.status(400).json({ success: false, message: "Discount value must be a non-negative number" });
    }
    if (discountType === 'percent' && discountValue > 100) {
      return res.status(400).json({ success: false, message: "Percent discount cannot exceed 100%" });
    }

    // Setting value to 0 = effectively removing the discount
    const isActive = active !== undefined ? (active === true || active === 'true') : discountValue > 0;

    product.discount = {
      type: discountType,
      value: discountValue,
      reason: reason ? String(reason).trim() : (product.discount?.reason || ''),
      active: isActive,
      setAt: new Date(),
      setBy: req.user._id,
    };

    await product.save();
    return res.status(200).json({
      success: true,
      message: discountValue > 0 && isActive ? `Discount of ${discountValue}${discountType === 'percent' ? '%' : '₹'} set on product` : 'Discount removed',
      productId: product._id,
      productName: product.name?.en || product.name,
      discount: product.discount,
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * PUT /api/admin/products/:id/commission
 * Admin only — set commission percent on a specific product.
 * Body: { commissionPercent: number }
 */
exports.setProductCommission = async (req, res) => {
  try {
    const { id } = req.params;
    const { commissionPercent } = req.body;

    const normalized = normalizeCommissionPercent(commissionPercent);
    if (normalized === null) {
      return res.status(400).json({ success: false, message: "commissionPercent must be a number between 0 and 100" });
    }

    const product = await Product.findById(id);
    if (!product) {
      return res.status(404).json({ success: false, message: "Product not found" });
    }

    product.adminCommissionPercent = normalized;
    await product.save();

    return res.status(200).json({
      success: true,
      message: "Product commission updated",
      productId: product._id,
      adminCommissionPercent: product.adminCommissionPercent,
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.updateMenuItemAdmin = async (req, res) => {
  try {
    const productId = req.params.id;
    const updates = { ...req.body };
    if (req.file) {
      updates.image = require("../utils/upload").getFileUrl(req.file);
    }
    const product = await Product.findById(productId);
    if (!product) return res.status(404).json({ message: "Product not found" });
    if (updates.name !== undefined) {
      product.name =
        typeof updates.name === "string"
          ? { ...product.name, en: updates.name }
          : updates.name;
    }
    if (updates.description !== undefined) {
      product.description =
        typeof updates.description === "string"
          ? { ...product.description, en: updates.description }
          : updates.description;
    }
    if (updates.basePrice !== undefined)
      product.basePrice = Number(updates.basePrice);
    if (updates.quantity !== undefined)
      product.quantity = String(updates.quantity).trim();
    if (updates.hsnCode !== undefined)
      product.hsnCode = String(updates.hsnCode).trim();
    if (updates.gstPercent !== undefined) {
      const gst = Number(updates.gstPercent);
      if ([0, 5, 12, 18].includes(gst)) product.gstPercent = gst;
    }
    if (updates.available !== undefined)
      product.available =
        updates.available === "true"
          ? true
          : updates.available === "false"
            ? false
            : !!updates.available;
    if (updates.seasonal !== undefined)
      product.seasonal =
        updates.seasonal === "true"
          ? true
          : updates.seasonal === "false"
            ? false
            : !!updates.seasonal;
    if (updates.seasonTag !== undefined) product.seasonTag = updates.seasonTag;
    if (updates.variations !== undefined) product.variations = updates.variations;
    if (updates.addOns !== undefined) product.addOns = updates.addOns;
    if (updates.category !== undefined) product.category = updates.category;
    if (updates.isApproved !== undefined) {
      const approvalState =
        typeof updates.isApproved === "string"
          ? updates.isApproved === "true" || updates.isApproved === "1"
          : !!updates.isApproved;
      product.isApproved = approvalState;
      product.approvedAt = approvalState ? new Date() : undefined;
    }
    if (updates.approvalNotes !== undefined) {
      product.approvalNotes = updates.approvalNotes;
    }
    if (product.pendingUpdate) {
      product.pendingUpdate = undefined;
      product.pendingUpdateAt = undefined;
    }
    await product.save();
    res.status(200).json({ message: "Menu item updated", product });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

exports.deleteMenuItemAdmin = async (req, res) => {
  try {
    const deleted = await Product.findByIdAndDelete(req.params.id);
    if (!deleted) {
      return res.status(404).json({ message: "Menu item not found" });
    }
    const Restaurant = require("../models/Restaurant");
    await Restaurant.findByIdAndUpdate(
      deleted.restaurant,
      { $pull: { product: deleted._id } },
      { new: true }
    );
    res.status(200).json({ message: "Menu item deleted" });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

/**
 * POST /api/admin/restaurants/:restaurantId/menu
 * Admin only — create a menu item for a specific restaurant
 */
exports.createMenuItemForRestaurant = async (req, res) => {
  try {
    const { restaurantId } = req.params;
    const FoodCategory = require("../models/FoodCategory");
    
    // Check if restaurant exists
    const restaurant = await Restaurant.findById(restaurantId);
    if (!restaurant) {
      return res.status(404).json({ message: "Restaurant not found" });
    }

    const {
      categoryId,
      name,
      description,
      basePrice,
      gstPercent,
      quantity,
      hsnCode,
      isVeg,
      seasonal,
      seasonTag,
      variations,
      addOns,
      image,
      adminCommissionPercent,
      restaurantCommissionPercent,
      packagingCharge,
      packagingGstPercent,
    } = req.body;

    // Validate category
    const category = await FoodCategory.findOne({ _id: categoryId, isActive: true });
    if (!category) {
      return res.status(404).json({ message: "Category not found. Please select a valid category." });
    }

    // Normalize name (required)
    const normalizedName = normalizeTranslation(name);
    if (!normalizedName || !normalizedName.en) {
      return res.status(400).json({ message: "Product name is required" });
    }

    // Normalize variations
    let normalizedVariations = normalizeNamedList(variations) || [];
    if (Array.isArray(normalizedVariations)) {
      normalizedVariations = normalizedVariations.filter((variation) => {
        if (!variation) return false;
        const varName = variation.name;
        if (!varName) return false;
        if (typeof varName === 'string' && !varName.trim()) return false;
        if (typeof varName === 'object' && !varName.en && !varName.de && !varName.ar) return false;
        if (typeof variation.price !== 'number' || variation.price < 0) return false;
        return true;
      });
    }

    // Normalize addOns
    let normalizedAddOns = normalizeNamedList(addOns) || [];
    if (Array.isArray(normalizedAddOns)) {
      normalizedAddOns = normalizedAddOns.filter((addOn) => {
        if (!addOn) return false;
        const addOnName = addOn.name;
        if (!addOnName) return false;
        if (typeof addOnName === 'string' && !addOnName.trim()) return false;
        if (typeof addOnName === 'object' && !addOnName.en && !addOnName.de && !addOnName.ar) return false;
        if (typeof addOn.price !== 'number' || addOn.price < 0) return false;
        return true;
      });
    }

    // Validate GST
    const gstSlabs = [0, 5, 12, 18];
    const parsedGst = Number(gstPercent);
    const finalGst = gstSlabs.includes(parsedGst) ? parsedGst : 5;

    // Validate packaging GST
    const parsedPackagingGst = packagingGstPercent !== undefined ? Number(packagingGstPercent) : 0;
    const finalPackagingGst = gstSlabs.includes(parsedPackagingGst) ? parsedPackagingGst : 0;

    // Create product with payment fields
    const productData = {
      restaurant: restaurantId,
      category: categoryId,
      name: normalizedName,
      description: normalizeTranslation(description),
      basePrice: Number(basePrice),
      gstPercent: finalGst,
      quantity: quantity ? String(quantity).trim() : '',
      hsnCode: hsnCode ? String(hsnCode).trim() : '',
      image: image || undefined,
      variations: normalizedVariations,
      addOns: normalizedAddOns,
      isVeg: isVeg !== undefined ? !!isVeg : true,
      seasonal: seasonal !== undefined ? !!seasonal : false,
      seasonTag: seasonal && seasonTag ? String(seasonTag).trim() : '',
      isApproved: false, // Admin-created items still need approval
    };

    // Add payment fields if provided
    if (adminCommissionPercent !== undefined && adminCommissionPercent !== null && adminCommissionPercent !== '') {
      const commission = Number(adminCommissionPercent);
      if (commission >= 0 && commission <= 100) {
        productData.adminCommissionPercent = commission;
      }
    }

    if (restaurantCommissionPercent !== undefined && restaurantCommissionPercent !== null && restaurantCommissionPercent !== '') {
      const commission = Number(restaurantCommissionPercent);
      if (commission >= 0 && commission <= 100) {
        productData.restaurantCommissionPercent = commission;
      }
    }

    if (packagingCharge !== undefined && packagingCharge !== null && packagingCharge !== '') {
      const charge = Number(packagingCharge);
      if (charge >= 0) {
        productData.packagingCharge = charge;
        productData.packagingGstPercent = finalPackagingGst;
      }
    }

    const product = await Product.create(productData);

    // Add product to restaurant's product array
    await Restaurant.findByIdAndUpdate(
      restaurantId,
      { $addToSet: { product: product._id } },
      { new: true }
    );

    res.status(201).json({
      message: "Menu item created successfully. Awaiting approval.",
      product,
      status: "pending_approval"
    });
  } catch (error) {
    console.error("Error creating menu item:", error);
    res.status(400).json({ message: error.message });
  }
};

exports.getAllPendingMenuItems = async (req, res) => {
  try {
    const { page = 1, limit = 20, restaurantId, sortBy = "createdAt" } = req.query;
    const skip = (parseInt(page) - 1) * parseInt(limit);
    const filter = {
      isRejected: { $ne: true }, // Keep rejected out of pending
      $or: [
        { isApproved: { $ne: true } },
        { pendingUpdate: { $exists: true, $ne: null } },
      ],
    };
    if (restaurantId) filter.restaurant = restaurantId;
    const total = await Product.countDocuments(filter);
    const products = await Product.find(filter)
      .populate("restaurant", "name city owner")
      .populate("category", "name description image")
      .select("_id name description basePrice isApproved approvalNotes pendingUpdate pendingUpdateAt restaurant category available isVeg image variations addOns createdAt quantity hsnCode gstPercent")
      .sort({ [sortBy]: -1 })
      .skip(skip)
      .limit(parseInt(limit))
      .lean();
    const formatted = products.map((p) => ({
      _id: p._id,
      name: p.name?.en || p.name,
      description: p.description,
      price: p.basePrice,
      isApproved: !!p.isApproved,
      approvalNotes: p.approvalNotes || "",
      pendingUpdate: p.pendingUpdate || null,
      pendingUpdateAt: p.pendingUpdateAt || null,
      restaurant: {
        _id: p.restaurant?._id,
        name: p.restaurant?.name?.en || p.restaurant?.name || "Unknown",
        city: p.restaurant?.city,
        owner: p.restaurant?.owner,
      },
      category: {
        _id: p.category?._id,
        name: p.category?.name || "Uncategorized",
      },
      available: p.available,
      isVeg: p.isVeg,
      image: p.image,
      variations: p.variations || [],
      addOns: p.addOns || [],
      createdAt: p.createdAt,
    }));
    res.status(200).json({
      items: formatted,
      total,
      page: parseInt(page),
      limit: parseInt(limit),
      pages: Math.ceil(total / parseInt(limit)),
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};
exports.getPendingMenusByRestaurant = async (req, res) => {
  try {
    const { status = "pending" } = req.query;
    const filter = status === "pending"
      ? {
        isRejected: { $ne: true }, // Keep rejected out of pending
        $or: [
          { isApproved: { $ne: true } },
          { pendingUpdate: { $exists: true, $ne: null } },
        ],
      }
      : { isApproved: true, pendingUpdate: { $exists: false } };
    const pendingByRestaurant = await Product.aggregate([
      { $match: filter },
      {
        $lookup: {
          from: "restaurants",
          localField: "restaurant",
          foreignField: "_id",
          as: "restaurantData",
        },
      },
      { $unwind: { path: "$restaurantData", preserveNullAndEmptyArrays: true } },
      {
        $lookup: {
          from: "foodcategories",
          localField: "category",
          foreignField: "_id",
          as: "categoryData",
        },
      },
      { $unwind: { path: "$categoryData", preserveNullAndEmptyArrays: true } },
      {
        $group: {
          _id: "$restaurant",
          restaurantName: { $first: "$restaurantData.name" },
          restaurantCity: { $first: "$restaurantData.city" },
          restaurant_owner: { $first: "$restaurantData.owner" },
          pendingCount: { $sum: 1 },
          totalCount: { $sum: 1 },
          items: {
            $push: {
              _id: "$_id",
              name: "$name",
              description: "$description",
              price: "$basePrice",
              isApproved: "$isApproved",
              isVeg: "$isVeg",
              image: "$image",
              category: {
                _id: "$categoryData._id",
                name: "$categoryData.name",
              },
              quantity: "$quantity",
              hsnCode: "$hsnCode",
              gstPercent: "$gstPercent",
              variations: "$variations",
              addOns: "$addOns",
              pendingUpdate: "$pendingUpdate",
              pendingUpdateAt: "$pendingUpdateAt",
              createdAt: "$createdAt",
            },
          },
        },
      },
      { $sort: { pendingCount: -1 } },
    ]);
    const formatted = pendingByRestaurant.map((group) => ({
      _id: group._id,
      restaurantName: group.restaurantName?.en || group.restaurantName || "Unknown",
      restaurantCity: group.restaurantCity,
      restaurant_owner: group.restaurant_owner,
      pendingCount: group.pendingCount,
      items: group.items.map((item) => ({
        ...item,
        name: item.name?.en || item.name,
      })),
    }));
    res.status(200).json({
      restaurants: formatted,
      total: formatted.length,
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};
exports.getMenuApprovalStats = async (req, res) => {
  try {
    const totalPending = await Product.countDocuments({
      isRejected: { $ne: true },
      $or: [
        { isApproved: { $ne: true } },
        { pendingUpdate: { $exists: true, $ne: null } },
      ],
    });
    const totalApproved = await Product.countDocuments({
      isApproved: true,
      $or: [
        { pendingUpdate: { $exists: false } },
        { pendingUpdate: null },
      ],
    });
    const totalMenu = totalPending + totalApproved;
    const restaurantsWithPending = await Product.distinct("restaurant", {
      isApproved: { $ne: true },
      isRejected: { $ne: true }
    });
    const restaurantsApprovedAll = await Restaurant.find({
      menuApproved: true,
    }).select("_id name");
    res.status(200).json({
      totalMenuItems: totalMenu,
      pendingApproval: totalPending,
      approved: totalApproved,
      pendingPercentage: totalMenu > 0 ? Math.round((totalPending / totalMenu) * 100) : 0,
      restaurantsWithPending: restaurantsWithPending.length,
      restaurantsFullyApproved: restaurantsApprovedAll.length,
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};
exports.getAllUsers = async (req, res) => {
  try {
    const { page, limit, skip } = getPaginationParams(req, 20);
    const role = req.query.role || "customer";
    const search = req.query.search || "";
    const query = { role };
    if (search) {
      query.$or = [
        { name: { $regex: search, $options: "i" } },
        { email: { $regex: search, $options: "i" } },
        { mobile: { $regex: search, $options: "i" } },
      ];
    }
    const total = await User.countDocuments(query);
    const users = await User.find(query)
      .select("-password")
      .skip(skip)
      .limit(limit)
      .sort({ createdAt: -1 });
    res.status(200).json({
      users,
      total,
      page,
      limit,
      pages: Math.ceil(total / limit)
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};
exports.getUserById = async (req, res) => {
  try {
    const user = await User.findById(req.params.id).select("-password");
    if (!user) return res.status(404).json({ message: "User not found" });
    res.status(200).json(user);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};
exports.blockUser = async (req, res) => {
  try {
    const { action, reason } = req.body; // action = 'block' | 'unblock'
    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ message: "User not found" });
    if (action === "block") {
      user.isBlocked = true;
      user.blockedAt = new Date();
      user.blockReason = reason || "";
      await user.save();
      return res.status(200).json({ message: "User blocked", user });
    } else if (action === "unblock") {
      user.isBlocked = false;
      user.blockedAt = undefined;
      user.blockReason = "";
      await user.save();
      return res.status(200).json({ message: "User unblocked", user });
    } else {
      return res.status(400).json({ message: "Invalid action" });
    }
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};
exports.toggleUserCOD = async (req, res) => {
  try {
    const { active } = req.body;
    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ message: 'User not found' });
    user.codActive = !!active;
    await user.save();
    res.status(200).json({ message: `COD ${user.codActive ? 'enabled' : 'disabled'}`, user });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};
exports.adjustWallet = async (req, res) => {
  try {
    const { amount, type, note } = req.body;
    if (!amount || !["credit", "debit"].includes(type))
      return res.status(400).json({ message: "Invalid payload" });
    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ message: "User not found" });
    const amt = Number(amount);
    if (type === "debit" && user.walletBalance < amt)
      return res
        .status(400)
        .json({ message: "Insufficient user wallet balance" });
    user.walletBalance =
      type === "credit" ? user.walletBalance + amt : user.walletBalance - amt;
    await user.save();
    await WalletTransaction.create({
      user: user._id,
      amount: type === "credit" ? amt : -amt,
      type: type === "credit" ? "credit" : "debit",
      description: note || `Admin ${type} adjustment`,
    });
    try {
      await sendNotification(
        user._id,
        "Wallet Updated",
        `Your wallet has been ${type === "credit" ? "credited" : "debited"
        } by ${amt}`
      );
    } catch (e) { }
    res
      .status(200)
      .json({ message: "Wallet updated", balance: user.walletBalance });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};
exports.getRevenueReport = async (req, res) => {
  try {
    const { period = "day", from, to, format = "json" } = req.query;
    const match = { status: { $ne: "cancelled" } };
    if (from) match.createdAt = { $gte: new Date(from) };
    if (to)
      match.createdAt = match.createdAt
        ? { ...match.createdAt, $lte: new Date(to) }
        : { $lte: new Date(to) };
    let groupId = null;
    if (period === "month")
      groupId = { $dateToString: { format: "%Y-%m", date: "$createdAt" } };
    else if (period === "week")
      groupId = { $dateToString: { format: "%Y-%U", date: "$createdAt" } };
    else
      groupId = { $dateToString: { format: "%Y-%m-%d", date: "$createdAt" } };
    const agg = await Order.aggregate([
      { $match: match },
      {
        $group: {
          _id: groupId,
          revenue: { $sum: { $ifNull: ["$totalAmount", 0] } },
          orders: { $sum: 1 },
        },
      },
      { $sort: { _id: 1 } },
    ]);
    if (format === "csv") {
      let csv = "period,revenue,orders\n";
      agg.forEach((r) => {
        csv += `${r._id},${(r.revenue || 0).toFixed(2)},${r.orders}\n`;
      });
      res.header("Content-Type", "text/csv");
      return res.send(csv);
    }
    res.status(200).json({ aggregation: agg });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};
exports.getCommissionReport = async (req, res) => {
  try {
    const {
      period = "day",
      restaurantId,
      from,
      to,
      format = "json",
    } = req.query;
    const match = { status: { $ne: "cancelled" } };
    if (restaurantId)
      match.restaurant = require("mongoose").Types.ObjectId(restaurantId);
    if (from) match.createdAt = { $gte: new Date(from) };
    if (to)
      match.createdAt = match.createdAt
        ? { ...match.createdAt, $lte: new Date(to) }
        : { $lte: new Date(to) };
    let groupId = null;
    if (period === "month")
      groupId = { $dateToString: { format: "%Y-%m", date: "$createdAt" } };
    else if (period === "week")
      groupId = { $dateToString: { format: "%Y-%U", date: "$createdAt" } };
    else
      groupId = { $dateToString: { format: "%Y-%m-%d", date: "$createdAt" } };
    const agg = await Order.aggregate([
      { $match: match },
      {
        $lookup: {
          from: "restaurants",
          localField: "restaurant",
          foreignField: "_id",
          as: "restaurant",
        },
      },
      { $unwind: { path: "$restaurant", preserveNullAndEmptyArrays: true } },
      {
        $project: {
          amount: { $ifNull: ["$totalAmount", 0] },
          commissionRate: { $ifNull: ["$restaurant.adminCommission", 0] },
          createdAt: 1,
        },
      },
      {
        $project: {
          commission: {
            $multiply: ["$amount", { $divide: ["$commissionRate", 100] }],
          },
          amount: 1,
          createdAt: 1,
        },
      },
      {
        $group: {
          _id: groupId,
          totalCommission: { $sum: { $ifNull: ["$commission", 0] } },
          revenue: { $sum: { $ifNull: ["$amount", 0] } },
          orders: { $sum: 1 },
        },
      },
      { $sort: { _id: 1 } },
    ]);
    if (format === "csv") {
      let csv = "period,totalCommission,revenue,orders\n";
      agg.forEach((r) => {
        csv += `${r._id},${(r.totalCommission || 0).toFixed(2)},${(
          r.revenue || 0
        ).toFixed(2)},${r.orders}\n`;
      });
      res.header("Content-Type", "text/csv");
      return res.send(csv);
    }
    res.status(200).json({ aggregation: agg });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};
exports.getCancellationReport = async (req, res) => {
  try {
    const {
      from,
      to,
      groupBy = "reason",
      format = "json",
      limit = 100,
    } = req.query;
    const match = { status: "cancelled" };
    if (from) match.updatedAt = { $gte: new Date(from) };
    if (to)
      match.updatedAt = match.updatedAt
        ? { ...match.updatedAt, $lte: new Date(to) }
        : { $lte: new Date(to) };
    const totalCancels = await Order.countDocuments(match);
    let agg = [];
    if (groupBy === "reason") {
      agg = await Order.aggregate([
        { $match: match },
        {
          $group: {
            _id: { $ifNull: ["$cancellationReason", "Unknown"] },
            count: { $sum: 1 },
          },
        },
        { $sort: { count: -1 } },
        { $limit: Number(limit) },
      ]);
      agg = agg.map((r) => ({
        reason: r._id,
        count: r.count,
        percent: totalCancels
          ? ((r.count / totalCancels) * 100).toFixed(2)
          : "0.00",
      }));
      if (format === "csv") {
        let csv = "reason,count,percent\n";
        agg.forEach((r) => {
          csv += `${r.reason},${r.count},${r.percent}\n`;
        });
        res.header("Content-Type", "text/csv");
        return res.send(csv);
      }
      return res.status(200).json({ totalCancels, breakdown: agg });
    }
    if (groupBy === "restaurant") {
      agg = await Order.aggregate([
        { $match: match },
        { $group: { _id: "$restaurant", count: { $sum: 1 } } },
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
            restaurantId: "$_id",
            name: { $ifNull: ["$restaurant.name.en", "$restaurant.name"] },
            count: 1,
          },
        },
        { $sort: { count: -1 } },
        { $limit: Number(limit) },
      ]);
      agg = agg.map((r) => ({
        restaurantId: r.restaurantId,
        name: r.name || "Unknown",
        count: r.count,
        percent: totalCancels
          ? ((r.count / totalCancels) * 100).toFixed(2)
          : "0.00",
      }));
      if (format === "csv") {
        let csv = "restaurantId,name,count,percent\n";
        agg.forEach((r) => {
          csv += `${r.restaurantId},"${(r.name || "").replace(/"/g, '""')}",${r.count
            },${r.percent}\n`;
        });
        res.header("Content-Type", "text/csv");
        return res.send(csv);
      }
      return res.status(200).json({ totalCancels, breakdown: agg });
    }
    if (groupBy === "rider") {
      agg = await Order.aggregate([
        { $match: match },
        { $group: { _id: "$rider", count: { $sum: 1 } } },
        {
          $lookup: {
            from: "users",
            localField: "_id",
            foreignField: "_id",
            as: "rider",
          },
        },
        { $unwind: { path: "$rider", preserveNullAndEmptyArrays: true } },
        {
          $project: {
            riderId: "$_id",
            name: "$rider.name",
            mobile: "$rider.mobile",
            count: 1,
          },
        },
        { $sort: { count: -1 } },
        { $limit: Number(limit) },
      ]);
      agg = agg.map((r) => ({
        riderId: r.riderId,
        name: r.name || "",
        mobile: r.mobile || "",
        count: r.count,
        percent: totalCancels
          ? ((r.count / totalCancels) * 100).toFixed(2)
          : "0.00",
      }));
      if (format === "csv") {
        let csv = "riderId,name,mobile,count,percent\n";
        agg.forEach((r) => {
          csv += `${r.riderId},"${(r.name || "").replace(/"/g, '""')}",${r.mobile || ""
            },${r.count},${r.percent}\n`;
        });
        res.header("Content-Type", "text/csv");
        return res.send(csv);
      }
      return res.status(200).json({ totalCancels, breakdown: agg });
    }
    if (groupBy === "day") {
      agg = await Order.aggregate([
        { $match: match },
        {
          $group: {
            _id: { $dateToString: { format: "%Y-%m-%d", date: "$updatedAt" } },
            count: { $sum: 1 },
          },
        },
        { $sort: { _id: 1 } },
      ]);
      if (format === "csv") {
        let csv = "date,count,percent\n";
        agg.forEach((r) => {
          csv += `${r._id},${r.count},${totalCancels ? ((r.count / totalCancels) * 100).toFixed(2) : "0.00"
            }\n`;
        });
        res.header("Content-Type", "text/csv");
        return res.send(csv);
      }
      return res
        .status(200)
        .json({
          totalCancels,
          breakdown: agg.map((r) => ({
            date: r._id,
            count: r.count,
            percent: totalCancels
              ? ((r.count / totalCancels) * 100).toFixed(2)
              : "0.00",
          })),
        });
    }
    return res.status(400).json({ message: "Invalid groupBy parameter" });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};
exports.getOrderSuccessRatio = async (req, res) => {
  try {
    const {
      from,
      to,
      period = "day",
      restaurantId,
      riderId,
      format = "json",
    } = req.query;
    const match = {};
    if (restaurantId)
      match.restaurant = require("mongoose").Types.ObjectId(restaurantId);
    if (riderId) match.rider = require("mongoose").Types.ObjectId(riderId);
    if (from) match.createdAt = { $gte: new Date(from) };
    if (to)
      match.createdAt = match.createdAt
        ? { ...match.createdAt, $lte: new Date(to) }
        : { $lte: new Date(to) };
    let groupId = null;
    if (period === "month")
      groupId = { $dateToString: { format: "%Y-%m", date: "$createdAt" } };
    else if (period === "week")
      groupId = { $dateToString: { format: "%Y-%U", date: "$createdAt" } };
    else
      groupId = { $dateToString: { format: "%Y-%m-%d", date: "$createdAt" } };
    const agg = await Order.aggregate([
      { $match: match },
      {
        $group: {
          _id: groupId,
          totalOrders: { $sum: 1 },
          delivered: {
            $sum: { $cond: [{ $eq: ["$status", "delivered"] }, 1, 0] },
          },
        },
      },
      { $sort: { _id: 1 } },
    ]);
    const result = agg.map((r) => ({
      period: r._id,
      totalOrders: r.totalOrders,
      delivered: r.delivered,
      successRatio: r.totalOrders
        ? ((r.delivered / r.totalOrders) * 100).toFixed(2)
        : "0.00",
    }));
    if (format === "csv") {
      let csv = "period,totalOrders,delivered,successRatio\n";
      result.forEach((r) => {
        csv += `${r.period},${r.totalOrders},${r.delivered},${r.successRatio}\n`;
      });
      res.header("Content-Type", "text/csv");
      return res.send(csv);
    }
    res.status(200).json({ aggregation: result });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};
exports.getPendingVerificationRestaurants = async (req, res) => {
  try {
    const { page, limit, skip } = getPaginationParams(req, 10);
    const query = { verificationStatus: 'pending' };
    const total = await Restaurant.countDocuments(query);
    const restaurants = await Restaurant.find(query)
      .select('_id name email mobile address city owner createdAt documents verificationStatus')
      .populate('owner', 'name email mobile')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean();
    const formatted = restaurants.map((r) => ({
      _id: r._id,
      name: r.name?.en || r.name || 'N/A',
      email: r.email,
      mobile: r.mobile,
      address: r.address?.en || r.address || 'N/A',
      city: r.city,
      owner: r.owner,
      createdAt: r.createdAt,
      documents: r.documents || {},
      verificationStatus: r.verificationStatus,
    }));
    res.status(200).json({
      restaurants: formatted,
      total,
      page,
      limit,
      pages: Math.ceil(total / limit),
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};
// Get Admin Commission Details
exports.getAdminCommissionDetails = async (req, res) => {
  try {
    const AdminCommissionWallet = require('../models/AdminCommissionWallet');
    const wallet = await AdminCommissionWallet.getInstance();

    res.status(200).json({
      success: true,
      commission: {
        currentBalance: wallet.balance,
        totalCommission: wallet.totalCommission,
        totalPaidOut: wallet.totalPaidOut,
        lastPayoutAt: wallet.lastPayoutAt,
        lastPayoutAmount: wallet.lastPayoutAmount,
        nextPayoutDate: wallet.nextPayoutDate,
        commissionFromRestaurants: wallet.commissionFromRestaurants,
        commissionFromDelivery: wallet.commissionFromDelivery,
        lastUpdated: wallet.lastUpdated
      }
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Manual Admin Payout (Triggered by Admin, not automatic)
exports.processAdminPayout = async (req, res) => {
  try {
    const AdminCommissionWallet = require('../models/AdminCommissionWallet');
    const PaymentTransaction = require('../models/PaymentTransaction');
    const paymentService = require('../services/paymentService');

    const wallet = await AdminCommissionWallet.getInstance();

    if (!wallet.balance || wallet.balance === 0) {
      return res.status(400).json({
        success: false,
        message: 'No pending commission to payout'
      });
    }

    const payoutAmount = wallet.balance;

    // Process the payout (same logic as automatic Sunday payout)
    wallet.totalPaidOut += payoutAmount;
    wallet.lastPayoutAmount = payoutAmount;
    wallet.lastPayoutAt = new Date();
    wallet.balance = 0;

    // Set next payout target date (optional, can be next week or manual)
    const nextDate = new Date();
    nextDate.setDate(nextDate.getDate() + 7);
    wallet.nextPayoutDate = nextDate;

    await wallet.save();

    // Create audit trail
    await PaymentTransaction.create({
      type: 'admin_commission_payout',
      amount: payoutAmount,
      note: `Manual admin commission payout of ₹${payoutAmount}`,
      status: 'completed',
      processedBy: req.user._id,
      processedAt: new Date()
    });

    res.status(200).json({
      success: true,
      message: `Admin payout of ₹${payoutAmount} processed successfully`,
      payout: {
        amount: payoutAmount,
        paidOutAmount: wallet.totalPaidOut,
        remainingBalance: wallet.balance,
        payoutAt: wallet.lastPayoutAt,
        nextPayoutDate: wallet.nextPayoutDate
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

// Manual Restaurant Payout (Individual)
exports.processRestaurantPayout = async (req, res) => {
  try {
    const { restaurantId } = req.params;
    const RestaurantWallet = require('../models/RestaurantWallet');
    const PaymentTransaction = require('../models/PaymentTransaction');

    const wallet = await RestaurantWallet.findOne({ restaurant: restaurantId });

    if (!wallet) {
      return res.status(404).json({
        success: false,
        message: 'Restaurant wallet not found'
      });
    }

    if (!wallet.balance || wallet.balance === 0) {
      return res.status(400).json({
        success: false,
        message: 'No pending balance to payout'
      });
    }

    const payoutAmount = wallet.balance;

    // Process payout
    wallet.totalPaidOut += payoutAmount;
    wallet.lastPayoutAmount = payoutAmount;
    wallet.lastPayoutAt = new Date();
    wallet.balance = 0;

    const nextDate = new Date();
    nextDate.setDate(nextDate.getDate() + 7);
    wallet.nextPayoutDate = nextDate;

    await wallet.save();

    // Create transaction record
    await PaymentTransaction.create({
      type: 'restaurant_manual_payout',
      restaurant: restaurantId,
      amount: payoutAmount,
      note: `Manual restaurant payout of ₹${payoutAmount}`,
      status: 'completed',
      processedBy: req.user._id,
      processedAt: new Date()
    });

    res.status(200).json({
      success: true,
      message: `Restaurant payout of ₹${payoutAmount} processed successfully`,
      payout: {
        amount: payoutAmount,
        totalPaidOut: wallet.totalPaidOut,
        remainingBalance: 0,
        payoutAt: wallet.lastPayoutAt
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

/**
 * GET /api/admin/riders/transactions
 * Admin: Get rider transaction history with pagination and filters
 */
exports.getRiderTransactions = async (req, res) => {
  try {
    const { page = 1, limit = 20, riderId, type, status, from, to } = req.query;
    const skip = (parseInt(page) - 1) * parseInt(limit);

    const PaymentTransaction = require('../models/PaymentTransaction');

    // Build filter - Only show rider-related transactions
    const riderTypes = [
      'cod_collected',
      'cod_deposit',
      'rider_earning_credit',
      'rider_weekly_payout',
      'rider_manual_payout',
      'rider_freeze',
      'rider_unfreeze'
    ];

    const filter = {
      type: { $in: riderTypes } // Only rider transaction types
    };

    if (riderId) filter.rider = riderId;
    if (type) filter.type = type; // Override with specific type if provided
    if (status) filter.status = status;
    if (from || to) {
      filter.createdAt = {};
      if (from) filter.createdAt.$gte = new Date(from);
      if (to) filter.createdAt.$lte = new Date(to);
    }

    // Get transactions with pagination
    const [transactions, total] = await Promise.all([
      PaymentTransaction.find(filter)
        .populate({
          path: 'rider',
          select: 'user',
          populate: { path: 'user', select: 'name email mobile' }
        })
        .populate('order', 'orderId totalAmount')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(parseInt(limit))
        .lean(),
      PaymentTransaction.countDocuments(filter)
    ]);

    // Format response
    const formattedTransactions = transactions.map(txn => ({
      _id: txn._id,
      riderId: txn.rider?._id,
      riderName: txn.rider?.user?.name || 'Unknown',
      riderEmail: txn.rider?.user?.email || '',
      riderMobile: txn.rider?.user?.mobile || '',
      type: txn.type,
      amount: txn.amount,
      currency: txn.currency || 'INR',
      status: txn.status,
      orderId: txn.order?.orderId || txn.order?._id,
      orderAmount: txn.order?.totalAmount,
      breakdown: txn.breakdown,
      note: txn.note,
      transactionId: txn._id.toString().substring(0, 12),
      createdAt: txn.createdAt,
      updatedAt: txn.updatedAt
    }));

    res.status(200).json({
      success: true,
      transactions: formattedTransactions,
      pagination: {
        total,
        page: parseInt(page),
        limit: parseInt(limit),
        pages: Math.ceil(total / parseInt(limit))
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

// Manual Rider Payout (Individual)
exports.processRiderPayout = async (req, res) => {
  try {
    const { riderId } = req.params;
    const RiderWallet = require('../models/RiderWallet');
    const PaymentTransaction = require('../models/PaymentTransaction');

    const wallet = await RiderWallet.findOne({ rider: riderId });

    if (!wallet) {
      return res.status(404).json({
        success: false,
        message: 'Rider wallet not found'
      });
    }

    // ✅ FIX: Use availableBalance instead of balance (RiderWallet has availableBalance)
    if (!wallet.availableBalance || wallet.availableBalance === 0) {
      return res.status(400).json({
        success: false,
        message: 'No pending balance to payout'
      });
    }

    const payoutAmount = wallet.availableBalance;

    // Process payout
    wallet.totalPayouts = (wallet.totalPayouts || 0) + payoutAmount;
    wallet.lastPayoutAmount = payoutAmount;
    wallet.lastPayoutAt = new Date();
    wallet.availableBalance = 0;

    await wallet.save();

    // Create transaction record
    await PaymentTransaction.create({
      type: 'rider_manual_payout',
      rider: riderId,
      amount: payoutAmount,
      note: `Manual rider payout of ₹${payoutAmount}`,
      status: 'completed',
      processedBy: req.user._id,
      processedAt: new Date()
    });

    res.status(200).json({
      success: true,
      message: `Rider payout of ₹${payoutAmount} processed successfully`,
      payout: {
        amount: payoutAmount,
        totalPaidOut: wallet.totalEarningsPaidOut,
        remainingBalance: 0,
        payoutAt: wallet.lastPayoutAt
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};