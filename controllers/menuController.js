const FoodCategory = require("../models/FoodCategory");
const Category = require("../models/Category");
const Product = require("../models/Product");
const Restaurant = require("../models/Restaurant");
const { formatProductForUser } = require("../utils/responseFormatter");
const { getFileUrl } = require("../utils/upload");
const parseIfString = (value) => {
  if (typeof value !== "string") return value;
  try {
    return JSON.parse(value);
  } catch (error) {
    return value;
  }
};
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
const getOwnerRestaurant = async (userId) => {
  const restaurant = await Restaurant.findOne({ owner: userId });
  if (!restaurant) {
    throw new Error("Restaurant not found for this user");
  }
  if (!restaurant.restaurantApproved) {
    throw new Error("Your restaurant is not approved yet.");
  }
  return restaurant;
};

/**
 * Compute discount display fields for a product.
 * Rules:
 *  - If both adminDiscount and restaurantDiscount are active, show the higher one.
 *  - If only one is active, show that one.
 *  - finalDiscount is the effective percent (or flat ₹ value) to display.
 *  - discountTag is the human-readable label e.g. "10% OFF".
 */
function computeDiscountFields(product) {
  const ad = product.adminDiscount;
  const rd = product.restaurantDiscount;
  const isDiscountActive = (discount) => {
    if (!discount) return false;
    const value = Number(discount.value || 0);
    if (!Number.isFinite(value) || value <= 0) return false;

    // Legacy records may not have `active`; treat value > 0 as active by default.
    if (discount.active === undefined || discount.active === null) return true;
    return discount.active === true || discount.active === 'true';
  };

  const adActive = isDiscountActive(ad);
  const rdActive = isDiscountActive(rd);

  // Normalise to a comparable numeric value (for flat, use raw; for percent, use raw)
  const adVal = adActive ? Number(ad.value) : 0;
  const rdVal = rdActive ? Number(rd.value) : 0;

  let finalDiscount = 0;
  let finalDiscountType = 'percent';
  let discountSource = null; // 'admin' | 'restaurant' | null

  if (adActive && rdActive) {
    // Both active: pick the higher value (same type preferred; if mixed, both are shown raw)
    if (adVal >= rdVal) {
      finalDiscount = adVal;
      finalDiscountType = ad.type || 'percent';
      discountSource = 'admin';
    } else {
      finalDiscount = rdVal;
      finalDiscountType = rd.type || 'percent';
      discountSource = 'restaurant';
    }
  } else if (adActive) {
    finalDiscount = adVal;
    finalDiscountType = ad.type || 'percent';
    discountSource = 'admin';
  } else if (rdActive) {
    finalDiscount = rdVal;
    finalDiscountType = rd.type || 'percent';
    discountSource = 'restaurant';
  }

  const discountTag = finalDiscount > 0
    ? (finalDiscountType === 'percent' ? `${finalDiscount}% OFF` : `₹${finalDiscount} OFF`)
    : null;

  return {
    restaurantDiscount: rdActive ? { type: rd.type, value: rdVal } : null,
    adminDiscount: adActive ? { type: ad.type, value: adVal, reason: ad.reason || '' } : null,
    finalDiscount,
    finalDiscountType,
    discountSource,
    discountTag,
  };
}
/**
 * GET /api/menu/categories
 * Public/Restaurant: List all active admin-managed food categories.
 * Restaurants use this when adding or editing products.
 */
exports.getCategories = async (req, res) => {
  try {
    const categories = await FoodCategory.find({ isActive: true }).sort({ sortOrder: 1, name: 1 }).lean();
    return res.status(200).json({ success: true, categories });
  } catch (error) {
    console.error('Error fetching categories:', error);
    return res.status(500).json({ success: false, message: error.message });
  }
};
//   }
// };
exports.addFoodItem = async (req, res) => {
  try {
    const file = req.files && req.files.image ? req.files.image[0] : null;
    const {
      categoryId,
      name,
      description,
      basePrice,
      gstPercent,
      quantity,    // Serving size label e.g. "250ml", "1 plate"
      unit,        // Measurement unit e.g. kg, gram, litre, ml, piece, packet, dozen
      hsnCode,     // HSN code for GST compliance
      packagingCharge,  // Packaging charge per item
      packagingGstPercent, // GST on packaging
      restaurantDiscount, // Restaurant-set discount — allowed here
      // NOTE: `adminDiscount`, `adminCommissionPercent`, `restaurantCommissionPercent` are admin-only
      variations,
      addOns,
    } = req.body;
    const image = file ? getFileUrl(file) : req.body.image;
    const parsedVariations = parseIfString(variations);
    const parsedAddOns = parseIfString(addOns);
    if (req.files && req.files.addOnImages && Array.isArray(parsedAddOns)) {
      req.files.addOnImages.forEach((fileItem, index) => {
        if (parsedAddOns[index]) {
          parsedAddOns[index].image = getFileUrl(fileItem);
        }
      });
    }
    const restaurant = await getOwnerRestaurant(req.user._id);

    // Validate that the category exists in FoodCategory (admin-managed) and is active
    const category = await FoodCategory.findOne({ _id: categoryId, isActive: true });
    if (!category) {
      return res.status(404).json({ message: "Category not found. Please select a valid category from the list." });
    }
    const normalizedName = normalizeTranslation(name);
    if (!normalizedName || !normalizedName.en) {
      return res.status(400).json({ message: "Product name is required" });
    }
    let normalizedVariations = normalizeNamedList(parsedVariations || variations) || [];
    if (Array.isArray(normalizedVariations)) {
      normalizedVariations = normalizedVariations.filter((variation) => {
        if (!variation) return false;
        if (typeof variation.price !== 'number' || variation.price < 0) return false;
        const varName = variation.name;
        const hasName = varName &&
          (typeof varName === 'string' ? varName.trim() :
            typeof varName === 'object' ? (varName.en || varName.de || varName.ar) : false);
        const hasQuantity = typeof variation.quantity === 'number' && variation.quantity >= 0;
        return hasName || hasQuantity;
      });
    }
    let normalizedAddOns = normalizeNamedList(parsedAddOns || addOns) || [];
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
    const gstSlabs = [0, 5, 12, 18];
    const parsedGst = Number(gstPercent);
    const finalGst = gstSlabs.includes(parsedGst) ? parsedGst : 5;

    // Validate packaging GST
    const parsedPackagingGst = packagingGstPercent !== undefined ? Number(packagingGstPercent) : 0;
    const finalPackagingGst = gstSlabs.includes(parsedPackagingGst) ? parsedPackagingGst : 0;

    const productData = {
      restaurant: restaurant._id,
      category: categoryId,
      name: normalizedName,
      description: normalizeTranslation(description),
      basePrice,
      gstPercent: finalGst,
      quantity: quantity ? String(quantity).trim() : '',
      unit: unit || undefined,
      hsnCode: hsnCode ? String(hsnCode).trim() : '',
      image,
      variations: normalizedVariations,
      addOns: normalizedAddOns,
      isApproved: false,
      // adminDiscount is NOT set here — only admin can set it
    };

    // Validate and apply restaurantDiscount if provided
    if (restaurantDiscount !== undefined && restaurantDiscount !== null) {
      const rd = parseIfString(restaurantDiscount);
      if (rd && typeof rd === 'object') {
        const rdType = rd.type === 'flat' ? 'flat' : 'percent';
        const rdValue = Number(rd.value ?? 0);
        if (isNaN(rdValue) || rdValue < 0) {
          return res.status(400).json({ message: 'restaurantDiscount.value must be a non-negative number' });
        }
        if (rdType === 'percent' && rdValue > 100) {
          return res.status(400).json({ message: 'restaurantDiscount percent cannot exceed 100%' });
        }
        productData.restaurantDiscount = {
          type: rdType,
          value: rdValue,
          active: rdValue > 0,
          setAt: new Date(),
          setBy: req.user._id,
        };
      }
    }

    // Add packaging fields if provided
    if (packagingCharge !== undefined && packagingCharge !== null && packagingCharge !== '') {
      const charge = Number(packagingCharge);
      if (charge >= 0) {
        productData.packagingCharge = charge;
        productData.packagingGstPercent = finalPackagingGst;
      }
    }

    const product = await Product.create(productData);
    await Restaurant.findByIdAndUpdate(
      restaurant._id,
      { $addToSet: { product: product._id } }, // $addToSet prevents duplicates
      { new: true }
    );
    res.status(201).json({
      message: "Food Item added successfully. Awaiting admin approval.",
      product,
      status: "pending_approval"
    });
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};
exports.getMenu = async (req, res) => {
  try {
    const { restaurantId } = req.params;
    const restaurant = await Restaurant.findById(restaurantId).select(
      "restaurantApproved isActive menuApproved"
    );
    if (!restaurant) {
      return res.status(404).json({ message: "Restaurant not found" });
    }
    if (!restaurant.restaurantApproved || !restaurant.isActive) {
      return res.status(403).json({ message: "Restaurant not available" });
    }
    const products = await Product.find({
      restaurant: restaurantId,
      isApproved: true,
      available: true,
    });
    if (products.length === 0) {
      return res.status(200).json({
        message: restaurant.menuApproved ? "Restaurant menu is empty" : "Menu is being updated, please check back soon",
        menu: {},
        menuByCategoryId: {},
        categories: [],
        status: restaurant.menuApproved ? "empty" : "pending_approval"
      });
    }
    const categoryIds = [
      ...new Set(products.map((p) => p.category.toString())),
    ];

    // Fetch from both new FoodCategory model and old Category model for backward compatibility
    const [foodCategories, oldCategories] = await Promise.all([
      FoodCategory.find({ _id: { $in: categoryIds } }),
      Category.find({ _id: { $in: categoryIds } })
    ]);

    // Combine them
    const categories = [...foodCategories, ...oldCategories];
    const menu = {};
    const menuByCategoryId = {};
    categories.forEach((cat) => {
      const catName = cat.name.en || cat.name;
      menu[catName] = [];
      menuByCategoryId[cat._id.toString()] = {
        category: {
          _id: cat._id,
          name: cat.name,
          image: cat.image,
        },
        items: [],
      };
    });
    products.forEach((p) => {
      const category = categories.find(
        (c) => c._id.toString() === p.category.toString(),
      );
      if (category) {
        const catName = category.name.en || category.name;
        const item = {
          _id: p._id,
          categoryId: p.category,
          name: p.name.en || p.name,
          description: p.description ? p.description.en || p.description : "",
          image: p.image,
          basePrice: p.basePrice,
          unit: p.unit || "piece",
          variations: p.variations,
          addOns: p.addOns,
          available: p.available,
          isBestSeller: false,
          ...computeDiscountFields(p),
        };
        menu[catName].push(item);
        const categoryKey = category._id.toString();
        if (!menuByCategoryId[categoryKey]) {
          menuByCategoryId[categoryKey] = {
            category: {
              _id: category._id,
              name: category.name,
              image: category.image,
            },
            items: [],
          };
        }
        menuByCategoryId[categoryKey].items.push(item);
      }
    });
    res.json({
      menu,
      menuByCategoryId,
      categories: categories.map((cat) => ({
        _id: cat._id,
        name: cat.name,
        image: cat.image,
      })),
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};
exports.bulkUpdateProducts = async (req, res) => {
  try {
    const { updates } = req.body;
    if (!Array.isArray(updates) || updates.length === 0) {
      return res.status(400).json({ message: "No updates provided" });
    }
    const restaurant = await Restaurant.findOne({ owner: req.user._id });
    if (!restaurant)
      return res.status(404).json({ message: "Restaurant not found" });
    const results = [];
    let hasPendingUpdates = false;
    for (const u of updates) {
      if (!u.productId) {
        results.push({ productId: null, status: "invalid_payload" });
        continue;
      }
      const product = await Product.findOne({
        _id: u.productId,
        restaurant: restaurant._id,
      });
      if (!product) {
        results.push({ productId: u.productId, status: "not_found" });
        continue;
      }
      if (u.available !== undefined) {
        product.available =
          u.available === "true"
            ? true
            : u.available === "false"
              ? false
              : !!u.available;
      }
      const pendingFields = [
        "basePrice",
        "seasonal",
        "seasonTag",
        "name",
        "description",
        "addOns",
        "variations",
        "image",
        "quantity",
        "gstPercent",
        "category",
        "restaurantDiscount",
      ];
      if (product.isApproved) {
        const pendingUpdate = { ...(product.pendingUpdate || {}) };
        pendingFields.forEach((field) => {
          if (u[field] !== undefined) {
            if (field === "name") {
              const normalized = normalizeTranslation(u.name);
              if (normalized && normalized.en) {
                pendingUpdate.name = normalized;
              }
            } else if (field === "description") {
              const normalized = normalizeTranslation(u.description);
              if (normalized) {
                pendingUpdate.description = normalized;
              }
            } else if (field === "variations") {
              let normalizedVars = normalizeNamedList(u.variations) || [];
              if (Array.isArray(normalizedVars)) {
                normalizedVars = normalizedVars.filter((variation) => {
                  if (!variation) return false;
                  if (typeof variation.price !== 'number' || variation.price < 0) return false;
                  const varName = variation.name;
                  const hasName = varName &&
                    (typeof varName === 'string' ? varName.trim() :
                      typeof varName === 'object' ? (varName.en || varName.de || varName.ar) : false);
                  const hasQuantity = typeof variation.quantity === 'number' && variation.quantity >= 0;
                  return hasName || hasQuantity;
                });
              }
              pendingUpdate.variations = normalizedVars;
            } else if (field === "addOns") {
              let normalizedAddOns = normalizeNamedList(u.addOns) || [];
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
              pendingUpdate.addOns = normalizedAddOns;
            } else if (field === "restaurantDiscount") {
              const rd = parseIfString(u.restaurantDiscount);
              if (rd && typeof rd === 'object') {
                const rdType = rd.type === 'flat' ? 'flat' : 'percent';
                const rdValue = Number(rd.value ?? 0);
                if (!isNaN(rdValue) && rdValue >= 0 && (rdType !== 'percent' || rdValue <= 100)) {
                  pendingUpdate.restaurantDiscount = { type: rdType, value: rdValue, active: rdValue > 0 };
                }
              }
            } else {
              pendingUpdate[field] = u[field];
            }
          }
        });
        if (Object.keys(pendingUpdate).length > 0) {
          product.pendingUpdate = pendingUpdate;
          product.pendingUpdateAt = new Date();
          hasPendingUpdates = true;
        }
        await product.save();
        results.push({ productId: product._id, status: "pending_approval" });
      } else {
        pendingFields.forEach((field) => {
          if (u[field] === undefined) return;
          if (field === "name") {
            const normalized = normalizeTranslation(u.name);
            if (!normalized || !normalized.en) return;
            product.name = normalized;
          } else if (field === "description") {
            product.description = normalizeTranslation(u.description);
          } else if (field === "variations") {
            let normalizedVars = normalizeNamedList(u.variations) || [];
            if (Array.isArray(normalizedVars)) {
              normalizedVars = normalizedVars.filter((variation) => {
                if (!variation) return false;
                if (typeof variation.price !== 'number' || variation.price < 0) return false;
                const varName = variation.name;
                const hasName = varName &&
                  (typeof varName === 'string' ? varName.trim() :
                    typeof varName === 'object' ? (varName.en || varName.de || varName.ar) : false);
                const hasQuantity = typeof variation.quantity === 'number' && variation.quantity >= 0;
                return hasName || hasQuantity;
              });
            }
            product.variations = normalizedVars;
          } else if (field === "addOns") {
            let normalizedAddOns = normalizeNamedList(u.addOns) || [];
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
            product.addOns = normalizedAddOns;
          } else if (field === "restaurantDiscount") {
            const rd = parseIfString(u.restaurantDiscount);
            if (rd && typeof rd === 'object') {
              const rdType = rd.type === 'flat' ? 'flat' : 'percent';
              const rdValue = Number(rd.value ?? 0);
              if (!isNaN(rdValue) && rdValue >= 0 && (rdType !== 'percent' || rdValue <= 100)) {
                product.restaurantDiscount = {
                  type: rdType,
                  value: rdValue,
                  active: rdValue > 0,
                  setAt: new Date(),
                  setBy: req.user._id,
                };
              }
            }
          } else {
            product[field] = u[field];
          }
        });
        await product.save();
        results.push({ productId: product._id, status: "updated" });
      }
    }
    res.status(200).json({ message: "Bulk update completed", results });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};
exports.toggleProductAvailability = async (req, res) => {
  try {
    const productId = req.params.id;
    const { available } = req.body;
    const restaurant = await Restaurant.findOne({ owner: req.user._id });
    if (!restaurant)
      return res.status(404).json({ message: "Restaurant not found" });
    const product = await Product.findOne({
      _id: productId,
      restaurant: restaurant._id,
    });
    if (!product) return res.status(404).json({ message: "Product not found" });
    product.available = !!available;
    await product.save();
    res.status(200).json({ message: "Product availability updated", product });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};
exports.bulkUpdatePrices = async (req, res) => {
  try {
    const { updates, percentage, productIds } = req.body;
    const restaurant = await Restaurant.findOne({ owner: req.user._id });
    if (!restaurant)
      return res.status(404).json({ message: "Restaurant not found" });
    const results = [];
    let hasPendingUpdates = false;
    if (Array.isArray(updates) && updates.length > 0) {
      for (const u of updates) {
        if (!u.productId || typeof u.newPrice !== "number") {
          results.push({
            productId: u.productId || null,
            status: "invalid_payload",
          });
          continue;
        }
        const product = await Product.findOne({
          _id: u.productId,
          restaurant: restaurant._id,
        });
        if (!product) {
          results.push({ productId: u.productId, status: "not_found" });
          continue;
        }
        if (product.isApproved) {
          const pendingUpdate = { ...(product.pendingUpdate || {}) };
          pendingUpdate.basePrice = u.newPrice;
          product.pendingUpdate = pendingUpdate;
          product.pendingUpdateAt = new Date();
          await product.save();
          hasPendingUpdates = true;
          results.push({ productId: product._id, status: "pending_approval" });
        } else {
          product.basePrice = u.newPrice;
          await product.save();
          results.push({ productId: product._id, status: "price_updated" });
        }
      }
      return res.status(200).json({ message: "Bulk prices updated", results });
    }
    if (typeof percentage === "number") {
      const query = { restaurant: restaurant._id };
      if (Array.isArray(productIds) && productIds.length > 0)
        query._id = { $in: productIds };
      const products = await Product.find(query);
      for (const p of products) {
        const nextPrice =
          Math.round(p.basePrice * (1 + percentage / 100) * 100) / 100;
        if (p.isApproved) {
          const pendingUpdate = { ...(p.pendingUpdate || {}) };
          pendingUpdate.basePrice = nextPrice;
          p.pendingUpdate = pendingUpdate;
          p.pendingUpdateAt = new Date();
          await p.save();
          hasPendingUpdates = true;
          results.push({ productId: p._id, newPrice: nextPrice, status: "pending_approval" });
        } else {
          p.basePrice = nextPrice;
          await p.save();
          results.push({ productId: p._id, newPrice: p.basePrice });
        }
      }
      return res
        .status(200)
        .json({ message: "Bulk percentage price update applied", results });
    }
    res
      .status(400)
      .json({
        message: "Invalid payload. Provide either updates or percentage.",
      });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};
exports.editProduct = async (req, res) => {
  try {
    const productId = req.params.id;
    const restaurant = await Restaurant.findOne({ owner: req.user._id });
    if (!restaurant)
      return res.status(404).json({ message: "Restaurant not found" });
    const product = await Product.findOne({
      _id: productId,
      restaurant: restaurant._id,
    });
    if (!product) return res.status(404).json({ message: "Product not found" });
    const file = req.files && req.files.image ? req.files.image[0] : null;
    const updates = { ...req.body };
    if (file) updates.image = getFileUrl(file);
    if (updates.variations !== undefined) {
      updates.variations = parseIfString(updates.variations);
    }
    if (updates.addOns !== undefined) {
      updates.addOns = parseIfString(updates.addOns);
    }
    if (req.files && req.files.addOnImages && Array.isArray(updates.addOns)) {
      req.files.addOnImages.forEach((fileItem, index) => {
        if (updates.addOns[index]) {
          updates.addOns[index].image = getFileUrl(fileItem);
        }
      });
    }
    const allowed = [
      "basePrice",
      "name",
      "description",
      "image",
      "quantity",
      "gstPercent",
      "variations",
      "addOns",
      "seasonal",
      "seasonTag",
      "available",
      "category",
      "restaurantDiscount",  // restaurant can update their own discount
    ];
    let hasPendingUpdate = false;
    if (product.isApproved) {
      if (updates.available !== undefined) {
        product.available =
          updates.available === "true"
            ? true
            : updates.available === "false"
              ? false
              : !!updates.available;
      }
      const pendingUpdate = { ...(product.pendingUpdate || {}) };
      const pendingFields = allowed.filter((field) => field !== "available");
      pendingFields.forEach((field) => {
        if (updates[field] !== undefined) {
          if (field === "name") {
            const normalized = normalizeTranslation(updates.name);
            if (normalized && normalized.en) {
              pendingUpdate.name = normalized;
            }
          } else if (field === "description") {
            const normalized = normalizeTranslation(updates.description);
            if (normalized) {
              pendingUpdate.description = normalized;
            }
          } else if (field === "variations") {
            pendingUpdate.variations = normalizeNamedList(updates.variations);
          } else if (field === "addOns") {
            pendingUpdate.addOns = normalizeNamedList(updates.addOns);
          } else if (field === "restaurantDiscount") {
            const rd = parseIfString(updates.restaurantDiscount);
            if (rd && typeof rd === 'object') {
              const rdType = rd.type === 'flat' ? 'flat' : 'percent';
              const rdValue = Number(rd.value ?? 0);
              if (!isNaN(rdValue) && rdValue >= 0 && (rdType !== 'percent' || rdValue <= 100)) {
                pendingUpdate.restaurantDiscount = { type: rdType, value: rdValue, active: rdValue > 0 };
              }
            }
          } else {
            pendingUpdate[field] = updates[field];
          }
        }
      });
      if (Object.keys(pendingUpdate).length > 0) {
        product.pendingUpdate = pendingUpdate;
        product.pendingUpdateAt = new Date();
        hasPendingUpdate = true;
      }
    } else {
      allowed.forEach((field) => {
        if (updates[field] === undefined) return;
        if (field === "name") {
          const normalized = normalizeTranslation(updates.name);
          if (!normalized || !normalized.en) return;
          product.name = normalized;
        } else if (field === "description") {
          product.description = normalizeTranslation(updates.description);
        } else if (field === "variations") {
          product.variations = normalizeNamedList(updates.variations);
        } else if (field === "addOns") {
          product.addOns = normalizeNamedList(updates.addOns);
        } else if (field === "restaurantDiscount") {
          const rd = parseIfString(updates.restaurantDiscount);
          if (rd && typeof rd === 'object') {
            const rdType = rd.type === 'flat' ? 'flat' : 'percent';
            const rdValue = Number(rd.value ?? 0);
            if (!isNaN(rdValue) && rdValue >= 0 && (rdType !== 'percent' || rdValue <= 100)) {
              product.restaurantDiscount = {
                type: rdType,
                value: rdValue,
                active: rdValue > 0,
                setAt: new Date(),
                setBy: req.user._id,
              };
            }
          }
        } else {
          product[field] = updates[field];
        }
      });
    }
    await product.save();
    if (hasPendingUpdate) {
      return res.status(200).json({
        message: "Product updated and sent for admin approval. Current menu unaffected.",
        product,
        status: "pending_approval"
      });
    }
    res.status(200).json({ message: "Product updated", product });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};
exports.deleteProduct = async (req, res) => {
  try {
    const productId = req.params.id;
    const restaurant = await Restaurant.findOne({ owner: req.user._id });
    if (!restaurant)
      return res.status(404).json({ message: "Restaurant not found" });
    const product = await Product.findOneAndDelete({
      _id: productId,
      restaurant: restaurant._id,
    });
    if (!product)
      return res
        .status(404)
        .json({ message: "Product not found or not yours" });
    await Restaurant.findByIdAndUpdate(
      restaurant._id,
      { $pull: { product: productId } }, // $pull removes the ID
      { new: true }
    );
    res.status(200).json({ message: "Product deleted" });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};
exports.getSeasonalMenu = async (req, res) => {
  try {
    const { restaurantId } = req.params;
    const { tag } = req.query;
    const query = { restaurant: restaurantId, seasonal: true, available: true };
    if (tag) query.seasonTag = tag;
    const products = await Product.find(query);
    res.status(200).json({ products });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};
