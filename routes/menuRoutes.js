const express = require("express");
const router = express.Router();
const { protect, restaurantOwner } = require("../middleware/authMiddleware");
const {
  getCategories,
  addFoodItem,
  getMenu,
  bulkUpdateProducts,
  toggleProductAvailability,
  bulkUpdatePrices,
  editProduct,
  deleteProduct,
  getSeasonalMenu,
} = require("../controllers/menuController");
const { upload } = require("../utils/upload");

// IMPORTANT: Specific routes must come BEFORE parameterized routes
// Public/Restaurant: Get all active admin-managed food categories (for dropdown when adding products)
router.get("/categories", getCategories);
router.get("/categories/list", getCategories);

// Public: Seasonal menu
router.get("/seasonal/:restaurantId", getSeasonalMenu);

// Public: Get full menu for a restaurant
router.get("/:restaurantId", getMenu);

// Restaurant: Add a food item (category must be from admin category list)
router.post(
  "/item",
  protect,
  restaurantOwner,
  upload.fields([
    { name: "image", maxCount: 1 },
    { name: "addOnImages", maxCount: 20 },
  ]),
  addFoodItem
);

// Restaurant: Edit a food item
router.put(
  "/item/:id",
  protect,
  restaurantOwner,
  upload.fields([
    { name: "image", maxCount: 1 },
    { name: "addOnImages", maxCount: 20 },
  ]),
  editProduct
);

// Restaurant: Delete a food item
router.delete("/item/:id", protect, restaurantOwner, deleteProduct);

// Restaurant: Bulk update products
router.put("/bulk/items", protect, restaurantOwner, bulkUpdateProducts);

// Restaurant: Toggle product availability
router.put("/item/:id/availability", protect, restaurantOwner, toggleProductAvailability);

// Restaurant: Bulk update prices
router.put("/bulk/prices", protect, restaurantOwner, bulkUpdatePrices);

module.exports = router;
