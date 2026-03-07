const MasterCategory = require('../models/MasterCategory'); // <--- Updated Import
const Unit = require('../models/Unit');
const Tag = require('../models/Tag');
const Addon = require('../models/Addon');
const Brand = require('../models/Brand');
const Cuisine = require('../models/Cuisine');
const DocumentType = require('../models/DocumentType');
const Banner = require('../models/Banner');
const { getFileUrl } = require('../utils/upload');
const { getPaginationParams, buildSearchQuery } = require('../utils/pagination');
exports.addMasterCategory = async (req, res) => {
    try {
        const { name, status } = req.body;
        if (!name || !name.trim()) {
            return res.status(400).json({ 
                success: false,
                message: "Category name is required" 
            });
        }
        const image = req.file ? getFileUrl(req.file) : req.body.image;
        if (!image || !image.trim()) {
            return res.status(400).json({ 
                success: false,
                message: "Category image is required" 
            });
        }
        console.log('📝 Creating master category:', { name, image, status });
        const newCategory = await MasterCategory.create({ 
            name: name.trim(), 
            image, 
            status: status || 'active' 
        });
        console.log('✅ Master category created:', newCategory._id);
        res.status(201).json({ 
            success: true,
            message: "Category added successfully", 
            data: newCategory 
        });
    } catch (error) {
        console.error('❌ Error adding master category:', error);
        res.status(500).json({ 
            success: false,
            message: error.message || "Failed to add category",
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
};
exports.getAllMasterCategories = async (req, res) => {
    try {
        const { page, limit, skip } = getPaginationParams(req, 50);
        const search = req.query.search || '';
        const query = buildSearchQuery(search, ['name']);
        const total = await MasterCategory.countDocuments(query);
        const categories = await MasterCategory.find(query)
            .skip(skip)
            .limit(limit)
            .sort({ createdAt: -1 });
        res.status(200).json({
            success: true,
            categories,
            total,
            page,
            limit,
            pages: Math.ceil(total / limit)
        });
    } catch (error) {
        console.error('❌ Error fetching master categories:', error);
        res.status(500).json({ 
            success: false,
            message: error.message || "Failed to fetch categories" 
        });
    }
};
exports.getMasterCategoryById = async (req, res) => {
    try {
        const category = await MasterCategory.findById(req.params.id);
        if (!category) {
            return res.status(404).json({ 
                success: false,
                message: "Category not found" 
            });
        }
        res.status(200).json({
            success: true,
            data: category
        });
    } catch (error) {
        console.error('❌ Error fetching category:', error);
        res.status(500).json({ 
            success: false,
            message: error.message || "Failed to fetch category" 
        });
    }
};
exports.updateMasterCategory = async (req, res) => {
    try {
        const { id } = req.params;
        const { name, status } = req.body;
        if (name && !name.trim()) {
            return res.status(400).json({ 
                success: false,
                message: "Category name cannot be empty" 
            });
        }
        const updateData = {};
        if (name) updateData.name = name.trim();
        if (status) updateData.status = status;
        if (req.file) {
            updateData.image = getFileUrl(req.file);
        }
        if (Object.keys(updateData).length === 0) {
            return res.status(400).json({ 
                success: false,
                message: "No data to update" 
            });
        }
        console.log('📝 Updating master category:', { id, ...updateData });
        const category = await MasterCategory.findByIdAndUpdate(
            id, 
            updateData, 
            { new: true, runValidators: false }
        );
        if (!category) {
            return res.status(404).json({ 
                success: false,
                message: "Category not found" 
            });
        }
        console.log('✅ Master category updated:', id);
        res.status(200).json({ 
            success: true,
            message: "Category updated successfully", 
            data: category 
        });
    } catch (error) {
        console.error('❌ Error updating category:', error);
        res.status(500).json({ 
            success: false,
            message: error.message || "Failed to update category" 
        });
    }
};
exports.deleteMasterCategory = async (req, res) => {
    try {
        const { id } = req.params;
        console.log('🗑️ Deleting master category:', id);
        const category = await MasterCategory.findByIdAndDelete(id);
        if (!category) {
            return res.status(404).json({ 
                success: false,
                message: "Category not found" 
            });
        }
        console.log('✅ Master category deleted:', id);
        res.status(200).json({ 
            success: true,
            message: "Category deleted successfully" 
        });
    } catch (error) {
        console.error('❌ Error deleting category:', error);
        res.status(500).json({ 
            success: false,
            message: error.message || "Failed to delete category" 
        });
    }
};
exports.addUnit = async (req, res) => {
    try {
        const { symbol, status } = req.body;
        const unit = await Unit.create({ symbol, status });
        res.status(201).json({ message: "Unit added", data: unit });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};
exports.getAllUnits = async (req, res) => {
    try {
        const { page, limit, skip } = getPaginationParams(req, 50);
        const search = req.query.search || '';
        const query = buildSearchQuery(search, ['symbol']);
        const total = await Unit.countDocuments(query);
        const units = await Unit.find(query)
            .skip(skip)
            .limit(limit)
            .sort({ createdAt: -1 });
        res.status(200).json({
            units,
            total,
            page,
            limit,
            pages: Math.ceil(total / limit)
        });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};
exports.getUnitById = async (req, res) => {
    try {
        const unit = await Unit.findById(req.params.id);
        if (!unit) {
            return res.status(404).json({ message: "Unit not found" });
        }
        res.status(200).json(unit);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};
exports.updateUnit = async (req, res) => {
    try {
        const unit = await Unit.findByIdAndUpdate(req.params.id, req.body, { new: true });
        res.status(200).json({ message: "Unit updated", data: unit });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};
exports.deleteUnit = async (req, res) => {
    try {
        await Unit.findByIdAndDelete(req.params.id);
        res.status(200).json({ message: "Unit deleted" });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};
exports.addTag = async (req, res) => {
    try {
        const { name, type, description, color, status } = req.body;
        const image = req.file ? getFileUrl(req.file) : req.body.image;
        const tag = await Tag.create({ name, type, description, image, color, status });
        res.status(201).json({ message: "Tag added", data: tag });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};
exports.getAllTags = async (req, res) => {
    try {
        const { page, limit, skip } = getPaginationParams(req, 50);
        const search = req.query.search || '';
        const query = buildSearchQuery(search, ['name', 'type']);
        const total = await Tag.countDocuments(query);
        const tags = await Tag.find(query)
            .skip(skip)
            .limit(limit)
            .sort({ createdAt: -1 });
        res.status(200).json({
            tags,
            total,
            page,
            limit,
            pages: Math.ceil(total / limit)
        });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};
exports.getTagById = async (req, res) => {
    try {
        const tag = await Tag.findById(req.params.id);
        if (!tag) {
            return res.status(404).json({ message: "Tag not found" });
        }
        res.status(200).json(tag);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};
exports.updateTag = async (req, res) => {
    try {
        const updateData = { ...req.body };
        if (req.file) {
            updateData.image = getFileUrl(req.file);
        }
        const tag = await Tag.findByIdAndUpdate(req.params.id, updateData, { new: true });
        res.status(200).json({ message: "Tag updated", data: tag });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};
exports.deleteTag = async (req, res) => {
    try {
        await Tag.findByIdAndDelete(req.params.id);
        res.status(200).json({ message: "Tag deleted" });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};
exports.addAddon = async (req, res) => {
    try {
        const { restaurant, name, price } = req.body;
        const newAddon = await Addon.create({ restaurant, name, price });
        res.status(201).json({ message: "Addon created", data: newAddon });
    } catch (error) { res.status(500).json({ message: error.message }); }
};
exports.getAllAddons = async (req, res) => {
    try {
        const { page, limit, skip } = getPaginationParams(req, 50);
        const search = req.query.search || '';
        const query = buildSearchQuery(search, ['name']);
        const total = await Addon.countDocuments(query);
        const addons = await Addon.find(query)
            .populate('restaurant', 'name')
            .skip(skip)
            .limit(limit)
            .sort({ createdAt: -1 });
        res.status(200).json({
            addons,
            total,
            page,
            limit,
            pages: Math.ceil(total / limit)
        });
    } catch (error) { res.status(500).json({ message: error.message }); }
};
exports.getAddonById = async (req, res) => {
    try {
        const addon = await Addon.findById(req.params.id).populate('restaurant', 'name');
        if (!addon) {
            return res.status(404).json({ message: "Addon not found" });
        }
        res.status(200).json(addon);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};
exports.updateAddon = async (req, res) => {
    try {
        const addon = await Addon.findByIdAndUpdate(req.params.id, req.body, { new: true, runValidators: true });
        if (!addon) {
            return res.status(404).json({ message: "Addon not found" });
        }
        res.status(200).json({ message: "Addon updated", data: addon });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};
exports.deleteAddon = async (req, res) => {
    try {
        const addon = await Addon.findByIdAndDelete(req.params.id);
        if (!addon) {
            return res.status(404).json({ message: "Addon not found" });
        }
        res.status(200).json({ message: "Addon deleted" });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};
exports.addBrand = async (req, res) => {
    try {
        const { name, status } = req.body;
        const brand = await Brand.create({ name, status });
        res.status(201).json({ message: "Brand created", data: brand });
    } catch (error) { res.status(500).json({ message: error.message }); }
};
exports.getAllBrands = async (req, res) => {
    try {
        const { page, limit, skip } = getPaginationParams(req, 50);
        const search = req.query.search || '';
        const query = buildSearchQuery(search, ['name']);
        const total = await Brand.countDocuments(query);
        const brands = await Brand.find(query)
            .skip(skip)
            .limit(limit)
            .sort({ createdAt: -1 });
        res.status(200).json({
            brands,
            total,
            page,
            limit,
            pages: Math.ceil(total / limit)
        });
    } catch (error) { res.status(500).json({ message: error.message }); }
};
exports.getBrandById = async (req, res) => {
    try {
        const brand = await Brand.findById(req.params.id);
        if (!brand) {
            return res.status(404).json({ message: "Brand not found" });
        }
        res.status(200).json(brand);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};
exports.updateBrand = async (req, res) => {
    try {
        const brand = await Brand.findByIdAndUpdate(req.params.id, req.body, { new: true, runValidators: true });
        if (!brand) {
            return res.status(404).json({ message: "Brand not found" });
        }
        res.status(200).json({ message: "Brand updated", data: brand });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};
exports.deleteBrand = async (req, res) => {
    try {
        const brand = await Brand.findByIdAndDelete(req.params.id);
        if (!brand) {
            return res.status(404).json({ message: "Brand not found" });
        }
        res.status(200).json({ message: "Brand deleted" });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};
exports.addCuisine = async (req, res) => {
    try {
        const { name } = req.body;
        const cuisine = await Cuisine.create({ name });
        res.status(201).json({ message: "Cuisine created", data: cuisine });
    } catch (error) { res.status(500).json({ message: error.message }); }
};
exports.getAllCuisines = async (req, res) => {
    try {
        const { page, limit, skip } = getPaginationParams(req, 50);
        const search = req.query.search || '';
        const query = buildSearchQuery(search, ['name']);
        const total = await Cuisine.countDocuments(query);
        const cuisines = await Cuisine.find(query)
            .skip(skip)
            .limit(limit)
            .sort({ createdAt: -1 });
        res.status(200).json({
            cuisines,
            total,
            page,
            limit,
            pages: Math.ceil(total / limit)
        });
    } catch (error) { res.status(500).json({ message: error.message }); }
};
exports.getCuisineById = async (req, res) => {
    try {
        const cuisine = await Cuisine.findById(req.params.id);
        if (!cuisine) {
            return res.status(404).json({ message: "Cuisine not found" });
        }
        res.status(200).json(cuisine);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};
exports.updateCuisine = async (req, res) => {
    try {
        const cuisine = await Cuisine.findByIdAndUpdate(req.params.id, req.body, { new: true, runValidators: true });
        if (!cuisine) {
            return res.status(404).json({ message: "Cuisine not found" });
        }
        res.status(200).json({ message: "Cuisine updated", data: cuisine });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};
exports.deleteCuisine = async (req, res) => {
    try {
        const cuisine = await Cuisine.findByIdAndDelete(req.params.id);
        if (!cuisine) {
            return res.status(404).json({ message: "Cuisine not found" });
        }
        res.status(200).json({ message: "Cuisine deleted" });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};
exports.addDocumentType = async (req, res) => {
    try {
        const { name, type, hasExpiry, status } = req.body;
        const doc = await DocumentType.create({ name, type, hasExpiry, status });
        res.status(201).json({ message: "Document Type created", data: doc });
    } catch (error) { res.status(500).json({ message: error.message }); }
};
exports.getAllDocumentTypes = async (req, res) => {
    try {
        const { page, limit, skip } = getPaginationParams(req, 50);
        const search = req.query.search || '';
        const query = buildSearchQuery(search, ['name', 'type']);
        const total = await DocumentType.countDocuments(query);
        const docs = await DocumentType.find(query)
            .skip(skip)
            .limit(limit)
            .sort({ createdAt: -1 });
        res.status(200).json({
            documentTypes: docs,
            total,
            page,
            limit,
            pages: Math.ceil(total / limit)
        });
    } catch (error) { res.status(500).json({ message: error.message }); }
};
exports.getDocumentTypeById = async (req, res) => {
    try {
        const doc = await DocumentType.findById(req.params.id);
        if (!doc) {
            return res.status(404).json({ message: "Document Type not found" });
        }
        res.status(200).json(doc);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};
exports.updateDocumentType = async (req, res) => {
    try {
        const doc = await DocumentType.findByIdAndUpdate(req.params.id, req.body, { new: true, runValidators: true });
        if (!doc) {
            return res.status(404).json({ message: "Document Type not found" });
        }
        res.status(200).json({ message: "Document Type updated", data: doc });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};
exports.deleteDocumentType = async (req, res) => {
    try {
        const doc = await DocumentType.findByIdAndDelete(req.params.id);
        if (!doc) {
            return res.status(404).json({ message: "Document Type not found" });
        }
        res.status(200).json({ message: "Document Type deleted" });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};
exports.addCancellationReason = async (req, res) => {
    try {
        const { reason, userType, status } = req.body;
        const newReason = await CancellationReason.create({ reason, userType, status });
        res.status(201).json({ message: "Reason created", data: newReason });
    } catch (error) { res.status(500).json({ message: error.message }); }
};
exports.getAllCancellationReasons = async (req, res) => {
    try {
        const { page, limit, skip } = getPaginationParams(req, 50);
        const search = req.query.search || '';
        const query = buildSearchQuery(search, ['reason']);
        const total = await CancellationReason.countDocuments(query);
        const reasons = await CancellationReason.find(query)
            .skip(skip)
            .limit(limit)
            .sort({ createdAt: -1 });
        res.status(200).json({
            reasons,
            total,
            page,
            limit,
            pages: Math.ceil(total / limit)
        });
    } catch (error) { res.status(500).json({ message: error.message }); }
};
exports.getCancellationReasonById = async (req, res) => {
    try {
        const reason = await CancellationReason.findById(req.params.id);
        if (!reason) {
            return res.status(404).json({ message: "Cancellation Reason not found" });
        }
        res.status(200).json(reason);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};
exports.updateCancellationReason = async (req, res) => {
    try {
        const reason = await CancellationReason.findByIdAndUpdate(req.params.id, req.body, { new: true, runValidators: true });
        if (!reason) {
            return res.status(404).json({ message: "Cancellation Reason not found" });
        }
        res.status(200).json({ message: "Cancellation Reason updated", data: reason });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};
exports.deleteCancellationReason = async (req, res) => {
    try {
        const reason = await CancellationReason.findByIdAndDelete(req.params.id);
        if (!reason) {
            return res.status(404).json({ message: "Cancellation Reason not found" });
        }
        res.status(200).json({ message: "Cancellation Reason deleted" });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};
exports.addBanner = async (req, res) => {
    try {
        const { title, type, targetId, targetModel, position } = req.body;
        const image = req.file ? getFileUrl(req.file) : req.body.image;
        const banner = await Banner.create({ 
            title, image, type, targetId, targetModel, position 
        });
        res.status(201).json({ message: "Banner created", data: banner });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};
exports.getAllBanners = async (req, res) => {
    try {
        const { page, limit, skip } = getPaginationParams(req, 50);
        const search = req.query.search || '';
        const query = buildSearchQuery(search, ['title', 'type']);
        const total = await Banner.countDocuments(query);
        const banners = await Banner.find(query)
            .skip(skip)
            .limit(limit)
            .sort({ position: 1 });
        res.status(200).json({
            banners,
            total,
            page,
            limit,
            pages: Math.ceil(total / limit)
        });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};
exports.getBannerById = async (req, res) => {
    try {
        const banner = await Banner.findById(req.params.id);
        if (!banner) {
            return res.status(404).json({ message: "Banner not found" });
        }
        res.status(200).json(banner);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};
exports.updateBanner = async (req, res) => {
    try {
        const updateData = { ...req.body };
        if (req.file) {
            updateData.image = getFileUrl(req.file);
        }
        const updatedBanner = await Banner.findByIdAndUpdate(
            req.params.id, 
            updateData, 
            { new: true }
        );
        res.status(200).json({ message: "Banner updated", data: updatedBanner });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};
exports.deleteBanner = async (req, res) => {
    try {
        await Banner.findByIdAndDelete(req.params.id);
        res.status(200).json({ message: "Banner deleted" });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};
