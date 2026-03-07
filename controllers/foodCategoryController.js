const FoodCategory = require('../models/FoodCategory');
const Product = require('../models/Product');
const { getFileUrl } = require('../utils/upload');

/**
 * POST /api/admin/food-categories
 * Admin: Create a new food category
 */
exports.createFoodCategory = async (req, res) => {
    try {
        const { name, description, sortOrder } = req.body;
        if (!name || !name.trim()) {
            return res.status(400).json({ success: false, message: 'Category name is required' });
        }
        const file = req.file || null;
        const image = file ? getFileUrl(file) : req.body.image || null;

        const existing = await FoodCategory.findOne({ name: name.trim() });
        if (existing) {
            return res.status(409).json({ success: false, message: `Category "${name}" already exists` });
        }

        const category = await FoodCategory.create({
            name: name.trim(),
            description: description?.trim() || '',
            image,
            sortOrder: sortOrder ? Number(sortOrder) : 0,
            isActive: true,
        });

        return res.status(201).json({
            success: true,
            message: 'Food category created successfully',
            category,
        });
    } catch (error) {
        console.error('createFoodCategory error:', error);
        return res.status(500).json({ success: false, message: error.message });
    }
};

/**
 * GET /api/admin/food-categories
 * Admin: Get all food categories (active + inactive)
 */
exports.getAllFoodCategoriesAdmin = async (req, res) => {
    try {
        const categories = await FoodCategory.find().sort({ sortOrder: 1, name: 1 });
        return res.status(200).json({ success: true, categories });
    } catch (error) {
        return res.status(500).json({ success: false, message: error.message });
    }
};

/**
 * PUT /api/admin/food-categories/:id
 * Admin: Update a food category
 */
exports.updateFoodCategory = async (req, res) => {
    try {
        const { id } = req.params;
        const { name, description, sortOrder, isActive } = req.body;
        const file = req.file || null;

        const category = await FoodCategory.findById(id);
        if (!category) {
            return res.status(404).json({ success: false, message: 'Category not found' });
        }

        if (name !== undefined) category.name = name.trim();
        if (description !== undefined) category.description = description.trim();
        if (sortOrder !== undefined) category.sortOrder = Number(sortOrder);
        if (isActive !== undefined) category.isActive = isActive === true || isActive === 'true';
        if (file) category.image = getFileUrl(file);
        else if (req.body.image !== undefined) category.image = req.body.image;

        await category.save();
        return res.status(200).json({ success: true, message: 'Category updated', category });
    } catch (error) {
        return res.status(500).json({ success: false, message: error.message });
    }
};

/**
 * DELETE /api/admin/food-categories/:id
 * Admin: Delete a food category (blocked if products exist in it)
 */
exports.deleteFoodCategory = async (req, res) => {
    try {
        const { id } = req.params;
        const usedByProducts = await Product.countDocuments({ category: id });
        if (usedByProducts > 0) {
            return res.status(400).json({
                success: false,
                message: `Cannot delete: ${usedByProducts} product(s) are using this category. Reassign them first.`,
            });
        }
        await FoodCategory.findByIdAndDelete(id);
        return res.status(200).json({ success: true, message: 'Category deleted' });
    } catch (error) {
        return res.status(500).json({ success: false, message: error.message });
    }
};

/**
 * PATCH /api/admin/food-categories/:id/toggle
 * Admin: Toggle active/inactive status
 */
exports.toggleFoodCategory = async (req, res) => {
    try {
        const { id } = req.params;
        const category = await FoodCategory.findById(id);
        if (!category) {
            return res.status(404).json({ success: false, message: 'Category not found' });
        }
        category.isActive = !category.isActive;
        await category.save();
        return res.status(200).json({
            success: true,
            message: `Category ${category.isActive ? 'activated' : 'deactivated'}`,
            category,
        });
    } catch (error) {
        return res.status(500).json({ success: false, message: error.message });
    }
};
