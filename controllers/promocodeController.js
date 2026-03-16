const Promocode = require('../models/Promocode');
const { getFileUrl } = require('../utils/upload');
const { getPaginationParams, buildSearchQuery } = require('../utils/pagination');

const normalizeOfferType = (value) => {
    const normalized = String(value || '').trim().toLowerCase();
    if (normalized === 'percent' || normalized === 'percentage') return 'percentage';
    if (normalized === 'free_delivery') return 'free_delivery';
    return null;
};

const normalizeValidity = (payload = {}) => {
    const availableFrom = payload.availableFrom;
    const expiryDate = payload.expiryDate;
    return {
        availableFrom,
        expiryDate,
    };
};

const normalizeTimeWindow = (payload = {}) => {
    const activeDays = Array.isArray(payload.activeDays) ? payload.activeDays : [];
    let timeSlots = Array.isArray(payload.timeSlots) ? payload.timeSlots : [];
    return {
        activeDays,
        timeSlots,
    };
};

exports.addPromocode = async (req, res) => {
    try {
        const {
            title, description, code,
            restaurant, 
            offerType, discountValue, maxDiscountAmount, minOrderValue,
            usageLimitPerCoupon, usageLimitPerUser,
            availableFrom, expiryDate,
            isTimeBound, activeDays, timeSlots,
            status
        } = req.body;
        const normalizedOfferType = normalizeOfferType(offerType);
        if (!normalizedOfferType) {
            return res.status(400).json({ message: 'offerType must be percentage or free_delivery' });
        }
        const validity = normalizeValidity(req.body);
        if (!validity.availableFrom || !validity.expiryDate) {
            return res.status(400).json({ message: 'availableFrom and expiryDate are required' });
        }
        const image = req.file ? getFileUrl(req.file) : req.body.image;
        const existing = await Promocode.findOne({ code: code.toUpperCase() });
        if (existing) {
            return res.status(400).json({ message: "Promocode with this code already exists" });
        }
        const resolvedUsageLimitPerCoupon = usageLimitPerCoupon ?? 0;
        const resolvedUsageLimitPerUser = usageLimitPerUser ?? 1;
        const timeWindow = normalizeTimeWindow(req.body);
        const newPromo = await Promocode.create({
            title, description, 
            code: code.toUpperCase(), 
            image,
            restaurant: restaurant || null,
            offerType: normalizedOfferType, discountValue, maxDiscountAmount, minOrderValue,
            usageLimitPerCoupon: resolvedUsageLimitPerCoupon,
            usageLimitPerUser: resolvedUsageLimitPerUser,
            availableFrom: validity.availableFrom,
            expiryDate: validity.expiryDate,
            isTimeBound,
            activeDays: timeWindow.activeDays,
            timeSlots: timeWindow.timeSlots,
            status
        });
        res.status(201).json({ message: "Promocode created successfully", data: newPromo });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};
exports.getAllPromocodes = async (req, res) => {
    try {
        const { page, limit, skip } = getPaginationParams(req, 50);
        const search = req.query.search || '';
        const query = buildSearchQuery(search, ['code', 'title', 'description']);
        const total = await Promocode.countDocuments(query);
        const promos = await Promocode.find(query)
            .populate('restaurant', 'name')
            .skip(skip)
            .limit(limit)
            .sort({ createdAt: -1 });
        res.status(200).json({
            promocodes: promos,
            total,
            page,
            limit,
            pages: Math.ceil(total / limit)
        });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};
exports.getPromocodeById = async (req, res) => {
    try {
        const promo = await Promocode.findById(req.params.id)
            .populate('restaurant', 'name');
        if (!promo) {
            return res.status(404).json({ message: "Promocode not found" });
        }
        res.status(200).json(promo);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};
exports.updatePromocode = async (req, res) => {
    try {
        const updateData = { ...req.body };
        if (updateData.offerType !== undefined) {
            const normalizedOfferType = normalizeOfferType(updateData.offerType);
            if (!normalizedOfferType) {
                return res.status(400).json({ message: 'offerType must be percentage or free_delivery' });
            }
            updateData.offerType = normalizedOfferType;
        }
        if (updateData.availableFrom || updateData.expiryDate) {
            const validity = normalizeValidity(updateData);
            updateData.availableFrom = validity.availableFrom;
            updateData.expiryDate = validity.expiryDate;
        }
        if (updateData.activeDays || updateData.timeSlots) {
            const timeWindow = normalizeTimeWindow(updateData);
            updateData.activeDays = timeWindow.activeDays;
            updateData.timeSlots = timeWindow.timeSlots;
        }
        if (req.file) {
            updateData.image = getFileUrl(req.file);
        }
        const updatedPromo = await Promocode.findByIdAndUpdate(
            req.params.id,
            updateData,
            { new: true, runValidators: true }
        );
        if (!updatedPromo) return res.status(404).json({ message: "Promocode not found" });
        res.status(200).json({ message: "Promocode updated", data: updatedPromo });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};
exports.deletePromocode = async (req, res) => {
    try {
        await Promocode.findByIdAndDelete(req.params.id);
        res.status(200).json({ message: "Promocode deleted" });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};
exports.createOwnerPromocode = async (req, res) => {
    try {
        const Restaurant = require('../models/Restaurant');
        const restaurant = await Restaurant.findOne({ owner: req.user._id });
        if (!restaurant) return res.status(404).json({ message: 'Restaurant not found' });
        const body = req.body;
        body.restaurant = restaurant._id;
        body.code = body.code ? body.code.toUpperCase() : undefined;
        const normalizedOfferType = normalizeOfferType(body.offerType);
        if (!normalizedOfferType) {
            return res.status(400).json({ message: 'offerType must be percentage or free_delivery' });
        }
        body.offerType = normalizedOfferType;
        body.usageLimitPerCoupon = body.usageLimitPerCoupon ?? 0;
        body.usageLimitPerUser = body.usageLimitPerUser ?? 1;
        const validity = normalizeValidity(body);
        const timeWindow = normalizeTimeWindow(body);
        body.availableFrom = validity.availableFrom;
        body.expiryDate = validity.expiryDate;
        body.activeDays = timeWindow.activeDays;
        body.timeSlots = timeWindow.timeSlots;
        if (!body.availableFrom || !body.expiryDate) {
            return res.status(400).json({ message: 'availableFrom and expiryDate are required' });
        }
        if (req.file) {
            body.image = getFileUrl(req.file);
        }
        if (body.code) {
            const existing = await Promocode.findOne({ code: body.code });
            if (existing) return res.status(400).json({ message: 'Code already exists' });
        }
        const newPromo = await Promocode.create(body);
        res.status(201).json({ message: 'Promocode created', data: newPromo });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};
exports.getOwnerPromocodes = async (req, res) => {
    try {
        const Restaurant = require('../models/Restaurant');
        const restaurant = await Restaurant.findOne({ owner: req.user._id });
        if (!restaurant) return res.status(404).json({ message: 'Restaurant not found' });
        const promos = await Promocode.find({ restaurant: restaurant._id }).sort({ createdAt: -1 });
        res.status(200).json(promos);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};
exports.getOwnerPromocodeById = async (req, res) => {
    try {
        const Restaurant = require('../models/Restaurant');
        const restaurant = await Restaurant.findOne({ owner: req.user._id });
        if (!restaurant) return res.status(404).json({ message: 'Restaurant not found' });
        const promo = await Promocode.findOne({ _id: req.params.id, restaurant: restaurant._id });
        if (!promo) return res.status(404).json({ message: 'Promocode not found or not yours' });
        res.status(200).json(promo);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};
exports.updateOwnerPromocode = async (req, res) => {
    try {
        const Restaurant = require('../models/Restaurant');
        const restaurant = await Restaurant.findOne({ owner: req.user._id });
        if (!restaurant) return res.status(404).json({ message: 'Restaurant not found' });
        const promo = await Promocode.findOne({ _id: req.params.id, restaurant: restaurant._id });
        if (!promo) return res.status(404).json({ message: 'Promocode not found' });
        const updateData = { ...req.body };
        if (updateData.offerType !== undefined) {
            const normalizedOfferType = normalizeOfferType(updateData.offerType);
            if (!normalizedOfferType) {
                return res.status(400).json({ message: 'offerType must be percentage or free_delivery' });
            }
            updateData.offerType = normalizedOfferType;
        }
        if (updateData.availableFrom || updateData.expiryDate) {
            const validity = normalizeValidity(updateData);
            updateData.availableFrom = validity.availableFrom;
            updateData.expiryDate = validity.expiryDate;
        }
        if (updateData.activeDays || updateData.timeSlots) {
            const timeWindow = normalizeTimeWindow(updateData);
            updateData.activeDays = timeWindow.activeDays;
            updateData.timeSlots = timeWindow.timeSlots;
        }
        if (req.file) {
            updateData.image = getFileUrl(req.file);
        }
        Object.assign(promo, updateData);
        await promo.save();
        res.status(200).json({ message: 'Promocode updated', data: promo });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};
exports.deleteOwnerPromocode = async (req, res) => {
    try {
        const Restaurant = require('../models/Restaurant');
        const restaurant = await Restaurant.findOne({ owner: req.user._id });
        if (!restaurant) return res.status(404).json({ message: 'Restaurant not found' });
        const promo = await Promocode.findOneAndDelete({ _id: req.params.id, restaurant: restaurant._id });
        if (!promo) return res.status(404).json({ message: 'Promocode not found or not yours' });
        res.status(200).json({ message: 'Promocode deleted' });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};
