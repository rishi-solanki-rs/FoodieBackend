const Cart = require("../models/Cart");
const Product = require("../models/Product");
const Restaurant = require("../models/Restaurant");
const Promocode = require("../models/Promocode");
const Order = require("../models/Order");
const { calculateBill } = require("./orderController"); // Import unified calculateBill
const { formatRestaurantForUser, formatProductForUser } = require("../utils/responseFormatter");
exports.getCart = async (req, res) => {
  try {
    let cart = await Cart.findOne({ user: req.user._id })
      .populate(
        "restaurant",
        "name description image cuisine rating address city area deliveryTime deliveryType isFreeDelivery minOrderValue estimatedPreparationTime isActive isTemporarilyClosed timing",
      );
    if (!cart)
      return res.status(200).json({ message: "Cart is empty", cart: null, bill: null });
    if (cart.items && cart.items.length > 0) {
      const originalLength = cart.items.length;
      cart.items = cart.items.filter((item) => item && item.restaurant);
      if (cart.items.length !== originalLength) {
        await cart.save();
      }
      if (cart.items.length === 0) {
        await Cart.findByIdAndDelete(cart._id);
        return res.status(200).json({ message: "Cart is empty", cart: null, bill: null });
      }
      const missingImageIds = cart.items
        .filter((item) => !item.image)
        .map((item) => item.product);
      if (missingImageIds.length > 0) {
        const products = await Product.find({ _id: { $in: missingImageIds } })
          .select("_id image")
          .lean();
        const imageMap = new Map(
          products.map((product) => [product._id.toString(), product.image])
        );
        let updated = false;
        cart.items.forEach((item) => {
          if (!item.image) {
            const image = imageMap.get(item.product.toString());
            if (image) {
              item.image = image;
              updated = true;
            }
          }
        });
        if (updated) {
          await cart.save();
        }
      }
    }
    const formattedRestaurant = cart.restaurant
      ? formatRestaurantForUser(cart.restaurant)
      : null;
    const formattedItems = cart.items.map((item) => ({
      _id: item._id,
      product: item.product,
      image: item.image,
      name: item.name,
      price: item.price,
      quantity: item.quantity,
      variation: item.variation || null,
      addOns: item.addOns || [],
    }));
    const bill = await calculateBill(cart, req.user._id);
    if (bill && bill.restaurantId && bill.restaurantId._id) {
      bill.restaurantId = bill.restaurantId._id;
    }
    const itemCount = formattedItems.reduce(
      (sum, item) => sum + (item.quantity || 0),
      0,
    );
    res.status(200).json({
      cart: {
        _id: cart._id,
        user: cart.user,
        restaurant: formattedRestaurant,
        items: formattedItems,
        couponCode: cart.couponCode || null,
        tip: cart.tip || 0,
        createdAt: cart.createdAt,
        updatedAt: cart.updatedAt,
      },
      bill,
      itemCount,
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};
exports.validateCoupon = async (req, res) => {
  try {
    const { couponCode } = req.body;
    const userId = req.user ? req.user._id : req.body.userId;
    if (!couponCode) {
      return res.status(400).json({ message: "Coupon code is required." });
    }
    const cart = await Cart.findOne({ user: userId })
      .populate("restaurant")
      .populate("items.restaurant");
    if (!cart) {
      return res.status(404).json({ message: "Cart not found." });
    }
    cart.couponCode = couponCode;
    const bill = await calculateBill(cart, userId);
    if (bill.couponError) {
      return res.status(400).json({ valid: false, message: bill.couponError });
    }
    return res.json({ valid: true, message: "Coupon is valid", bill });
  } catch (err) {
    return res.status(500).json({ message: "Server error." });
  }
};
exports.addToCart = async (req, res) => {
  try {
    const { restaurantId, productId, quantity, variationId, addOnsIds, clearCart } = req.body;
    if (!restaurantId || !productId) {
      return res.status(400).json({ message: "Restaurant ID and Product ID are required" });
    }
    const parsedQuantity = Number.isFinite(Number(quantity)) && Number(quantity) > 0
      ? parseInt(quantity, 10)
      : 1;
    const normalizedAddOnsIds = Array.isArray(addOnsIds)
      ? addOnsIds
      : addOnsIds && typeof addOnsIds === 'string' && addOnsIds.trim()
      ? [addOnsIds]
      : [];
    let cart = await Cart.findOne({ user: req.user._id });
    if (cart && cart.items.length > 0) {
      cart.items = cart.items.filter(item => item && item.restaurant);
      const existingRestaurantId = cart.restaurant ? cart.restaurant.toString() : null;
      if (existingRestaurantId && existingRestaurantId !== restaurantId) {
        if (clearCart) {
          cart.items = [];
          cart.restaurant = restaurantId;
          cart.couponCode = null;
          cart.tip = 0;
        } else {
          const existingRestaurant = await Restaurant.findById(existingRestaurantId);
          const newRestaurant = await Restaurant.findById(restaurantId);
          return res.status(409).json({
            message: "Cart contains items from another restaurant. Please place your current order first or clear your cart.",
            conflict: true,
            requiresAction: true,
            currentRestaurant: {
              id: existingRestaurantId,
              name: existingRestaurant ? existingRestaurant.name.en : "Current Restaurant"
            },
            newRestaurant: {
              id: restaurantId,
              name: newRestaurant ? newRestaurant.name.en : "New Restaurant"
            },
            actions: [
              { type: "place_order", label: "Place Current Order" },
              { type: "clear_cart", label: "Clear Cart & Start Fresh" }
            ]
          });
        }
      }
    }
    if (!cart) {
      cart = await Cart.create({
        user: req.user._id,
        restaurant: restaurantId,
        items: [],
      });
    } else {
      if (cart.items.length === 0) {
        cart.restaurant = restaurantId;
      }
    }
    const product = await Product.findById(productId);
    if (!product) {
      return res.status(404).json({ message: "Product not found" });
    }
    if (product.restaurant.toString() !== restaurantId.toString()) {
        const productRestaurant = await Restaurant.findById(product.restaurant);
        return res.status(400).json({ 
            message: "Product does not belong to the selected restaurant",
            productRestaurant: productRestaurant ? productRestaurant.name.en : "Unknown"
        });
    }
    let finalPrice = product.basePrice;
    let variationObj = null;
    let addOnsArr = [];
    if (variationId) {
      const v = product.variations.id(variationId);
      if (!v) {
        return res.status(400).json({ message: "Invalid variation selected" });
      }
      const variationPrice = Number(v.price) || 0;
      finalPrice += variationPrice;
      const variationName = v.name?.en || v.name?.de || v.name?.ar || "";
      variationObj = { _id: v._id, name: variationName, price: variationPrice };
    }
    if (normalizedAddOnsIds.length > 0) {
      const uniqueAddOnIds = Array.from(new Set(normalizedAddOnsIds.map((id) => id.toString())));
      const selectedAddons = product.addOns.filter((a) =>
        uniqueAddOnIds.includes(a._id.toString())
      );
      if (selectedAddons.length !== uniqueAddOnIds.length) {
        return res.status(400).json({ message: "Invalid add-on selected" });
      }
      selectedAddons.forEach((a) => {
        const addOnPrice = Number(a.price) || 0;
        finalPrice += addOnPrice;
        const addOnName = a.name?.en || a.name?.de || a.name?.ar || "";
        addOnsArr.push({ _id: a._id, name: addOnName, price: addOnPrice });
      });
    }
    const cartItem = {
      product: productId,
      restaurant: restaurantId,
      name: product.name.en,
      image: product.image,
      price: finalPrice,
      quantity: parsedQuantity,
      addOns: addOnsArr,
    };
    if (variationObj && typeof variationObj === 'object' && Object.keys(variationObj).length > 0) {
      cartItem.variation = variationObj;
    }
    const existingItemIndex = cart.items.findIndex(item => 
        item.product.toString() === productId && 
        JSON.stringify(item.variation) === JSON.stringify(cartItem.variation) &&
        JSON.stringify(item.addOns) === JSON.stringify(cartItem.addOns)
    );
    if (existingItemIndex > -1) {
        cart.items[existingItemIndex].quantity += parsedQuantity;
      if (!cart.items[existingItemIndex].image) {
        cart.items[existingItemIndex].image = product.image;
      }
    } else {
        cart.items.push(cartItem);
    }
    await cart.save();
    const updatedCart = await Cart.findById(cart._id)
      .populate("restaurant")
      .populate("items.restaurant")
      .lean();
    const bill = await calculateBill(cart, req.user._id);
    res.status(200).json({ 
      message: "Item added to cart successfully", 
      cart: updatedCart, 
      bill 
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};
exports.removeItem = async (req, res) => {
  try {
    const cart = await Cart.findOne({ user: req.user._id });
    if (!cart) return res.status(404).json({ message: "Cart not found" });
    const itemId = req.params.itemId;
    const itemExists = cart.items.some(item => item._id.toString() === itemId);
    if (!itemExists) {
      return res.status(404).json({ message: "Item not found in cart" });
    }
    cart.items = cart.items.filter(
      (item) => item._id.toString() !== itemId
    );
    if (cart.items.length === 0) {
      await Cart.findByIdAndDelete(cart._id);
      return res.status(200).json({ 
        message: "Cart cleared", 
        cart: null, 
        bill: null 
      });
    }
    await cart.save();
    const bill = await calculateBill(cart, req.user._id);
    res.status(200).json({ 
      message: "Item removed from cart", 
      cart, 
      bill,
      itemCount: cart.items.length
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};
exports.updateItemQuantity = async (req, res) => {
  try {
    const { itemId, quantity, action } = req.body;
    if (!itemId) {
      return res.status(400).json({ message: "Item ID is required" });
    }
    let newQuantity;
    if (action) {
      if (action !== 'increase' && action !== 'decrease') {
        return res.status(400).json({ message: "Invalid action. Use 'increase' or 'decrease'" });
      }
    } else if (Number.isFinite(Number(quantity))) {
      newQuantity = parseInt(quantity, 10);
    } else {
      return res.status(400).json({ message: "Quantity or action is required" });
    }
    const cart = await Cart.findOne({ user: req.user._id });
    if (!cart) {
      return res.status(404).json({ message: "Cart not found" });
    }
    const item = cart.items.find(i => i._id.toString() === itemId);
    if (!item) {
      return res.status(404).json({ message: "Item not found in cart" });
    }
    if (action === 'increase') {
      item.quantity += 1;
    } else if (action === 'decrease') {
      item.quantity -= 1;
      if (item.quantity < 1) {
        item.quantity = 1; // Minimum 1
      }
    } else if (newQuantity >= 1) {
      item.quantity = newQuantity;
    } else {
      return res.status(400).json({ message: "Quantity must be at least 1" });
    }
    await cart.save();
    const updatedCart = await Cart.findById(cart._id)
      .populate("restaurant")
      .populate("items.restaurant")
      .lean();
    const bill = await calculateBill(cart, req.user._id);
    res.status(200).json({
      message: `Item quantity updated to ${item.quantity}`,
      cart: updatedCart,
      bill,
      itemCount: cart.items.length,
      updatedItemQuantity: item.quantity
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};
exports.updateCartMeta = async (req, res) => {
  try {
    const { tip } = req.body;
    const cart = await Cart.findOne({ user: req.user._id });
    if (!cart) return res.status(404).json({ message: "Cart not found" });
    if (tip !== undefined) {
      const tipValue = Number(tip);
      if (!Number.isFinite(tipValue) || tipValue < 0) {
        return res.status(400).json({ message: "Tip must be a non-negative number" });
      }
      cart.tip = Math.round(tipValue * 100) / 100;
    }
    await cart.save();
    const bill = await calculateBill(cart, req.user._id);
    res.status(200).json({ message: "Cart updated", bill });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};
