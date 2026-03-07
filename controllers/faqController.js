const FAQ = require('../models/FAQ');
const { getPaginationParams } = require('../utils/pagination');
exports.getAllFAQs = async (req, res) => {
    try {
        const { page, limit, skip } = getPaginationParams(req, 20);
        const { category, search } = req.query;
        const query = { isActive: true };
        if (category) query.category = category;
        if (search) {
            query.$or = [
                { title: { $regex: search, $options: 'i' } },
                { answer: { $regex: search, $options: 'i' } }
            ];
        }
        const total = await FAQ.countDocuments(query);
        const faqs = await FAQ.find(query)
            .skip(skip)
            .limit(limit)
            .sort({ order: 1, createdAt: -1 });
        res.status(200).json({
            faqs,
            total,
            page,
            limit,
            pages: Math.ceil(total / limit)
        });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};
exports.getFAQById = async (req, res) => {
    try {
        const faq = await FAQ.findByIdAndUpdate(
            req.params.id,
            { $inc: { views: 1 } },
            { new: true }
        );
        if (!faq) {
            return res.status(404).json({ message: 'FAQ not found' });
        }
        res.status(200).json(faq);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};
exports.markHelpful = async (req, res) => {
    try {
        const { helpful } = req.body;
        const faq = await FAQ.findByIdAndUpdate(
            req.params.id,
            helpful ? { $inc: { helpful: 1 } } : { $inc: { notHelpful: 1 } },
            { new: true }
        );
        if (!faq) {
            return res.status(404).json({ message: 'FAQ not found' });
        }
        res.status(200).json({
            message: helpful ? 'Marked as helpful' : 'Marked as not helpful',
            faq
        });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};
exports.getAllFAQsAdmin = async (req, res) => {
    try {
        const { page, limit, skip } = getPaginationParams(req, 20);
        const { category } = req.query;
        const query = {};
        if (category) query.category = category;
        const total = await FAQ.countDocuments(query);
        const faqs = await FAQ.find(query)
            .populate('createdBy', 'name email')
            .populate('updatedBy', 'name email')
            .skip(skip)
            .limit(limit)
            .sort({ order: 1 });
        res.status(200).json({
            faqs,
            total,
            page,
            limit,
            pages: Math.ceil(total / limit)
        });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};
exports.createFAQ = async (req, res) => {
    try {
        const { category, title, answer, order } = req.body;
        const userId = req.user.id;
        if (!title || !answer) {
            return res.status(400).json({ message: 'Title and answer are required' });
        }
        const faq = await FAQ.create({
            category: category || 'General',
            title,
            answer,
            order: order || 0,
            createdBy: userId
        });
        res.status(201).json({
            message: 'FAQ created successfully',
            faq
        });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};
exports.updateFAQ = async (req, res) => {
    try {
        const { id } = req.params;
        const { category, title, answer, order, isActive } = req.body;
        const userId = req.user.id;
        const faq = await FAQ.findByIdAndUpdate(
            id,
            {
                category,
                title,
                answer,
                order,
                isActive,
                updatedBy: userId
            },
            { new: true }
        );
        if (!faq) {
            return res.status(404).json({ message: 'FAQ not found' });
        }
        res.status(200).json({
            message: 'FAQ updated successfully',
            faq
        });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};
exports.deleteFAQ = async (req, res) => {
    try {
        const faq = await FAQ.findByIdAndDelete(req.params.id);
        if (!faq) {
            return res.status(404).json({ message: 'FAQ not found' });
        }
        res.status(200).json({ message: 'FAQ deleted successfully' });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};
exports.reorderFAQs = async (req, res) => {
    try {
        const { faqs } = req.body; // [{ id, order }, ...]
        const updates = faqs.map(item =>
            FAQ.findByIdAndUpdate(item.id, { order: item.order }, { new: true })
        );
        await Promise.all(updates);
        res.status(200).json({ message: 'FAQs reordered successfully' });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};
