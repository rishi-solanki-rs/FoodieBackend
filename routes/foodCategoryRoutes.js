const express = require('express');
const router = express.Router();
const { protect, admin } = require('../middleware/authMiddleware');
const {
    createFoodCategory,
    getAllFoodCategoriesAdmin,
    updateFoodCategory,
    deleteFoodCategory,
    toggleFoodCategory,
    getActiveFoodCategories,
} = require('../controllers/foodCategoryController');
const { upload } = require('../utils/upload');

// Public: Get active food categories (for restaurants & customers)
router.get('/active', getActiveFoodCategories);

// Admin: Full CRUD on food categories
router.get('/', protect, admin, getAllFoodCategoriesAdmin);
router.post('/', protect, admin, upload.single('image'), createFoodCategory);
router.put('/:id', protect, admin, upload.single('image'), updateFoodCategory);
router.delete('/:id', protect, admin, deleteFoodCategory);
router.patch('/:id/toggle', protect, admin, toggleFoodCategory);

module.exports = router;
