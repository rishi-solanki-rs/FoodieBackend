const Contact = require('../models/ContactForm');
const { getPaginationParams } = require('../utils/pagination');
exports.submitContact = async (req, res) => {
    try {
        const { name, email, mobile, subject, message } = req.body;
        const userId = req.user?.id || null;
        if (!name || !email || !mobile || !subject || !message) {
            return res.status(400).json({ message: 'All fields are required' });
        }
        const contact = await Contact.create({
            name,
            email,
            mobile,
            subject,
            message,
            userId
        });
        res.status(201).json({
            message: 'Your message has been received. We will contact you soon.',
            contact
        });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};
exports.getAllContacts = async (req, res) => {
    try {
        const { page, limit, skip } = getPaginationParams(req, 20);
        const { status, search } = req.query;
        const query = {};
        if (status) query.status = status;
        if (search) {
            query.$or = [
                { name: { $regex: search, $options: 'i' } },
                { email: { $regex: search, $options: 'i' } },
                { subject: { $regex: search, $options: 'i' } }
            ];
        }
        const total = await Contact.countDocuments(query);
        const contacts = await Contact.find(query)
            .populate('userId', 'name email mobile')
            .populate('repliedBy', 'name email')
            .skip(skip)
            .limit(limit)
            .sort({ createdAt: -1 });
        res.status(200).json({
            contacts,
            total,
            page,
            limit,
            pages: Math.ceil(total / limit)
        });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};
exports.getContactById = async (req, res) => {
    try {
        const contact = await Contact.findById(req.params.id)
            .populate('userId', 'name email mobile')
            .populate('repliedBy', 'name email');
        if (!contact) {
            return res.status(404).json({ message: 'Contact not found' });
        }
        res.status(200).json(contact);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};
exports.replyContact = async (req, res) => {
    try {
        const { id } = req.params;
        const { reply } = req.body;
        const userId = req.user.id;
        if (!reply) {
            return res.status(400).json({ message: 'Reply message is required' });
        }
        const contact = await Contact.findByIdAndUpdate(
            id,
            {
                reply,
                repliedAt: new Date(),
                repliedBy: userId,
                status: 'replied'
            },
            { new: true }
        ).populate('repliedBy', 'name email');
        if (!contact) {
            return res.status(404).json({ message: 'Contact not found' });
        }
        res.status(200).json({
            message: 'Reply sent successfully',
            contact
        });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};
exports.closeContact = async (req, res) => {
    try {
        const contact = await Contact.findByIdAndUpdate(
            req.params.id,
            { status: 'closed' },
            { new: true }
        );
        if (!contact) {
            return res.status(404).json({ message: 'Contact not found' });
        }
        res.status(200).json({
            message: 'Contact marked as closed',
            contact
        });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};
exports.deleteContact = async (req, res) => {
    try {
        const contact = await Contact.findByIdAndDelete(req.params.id);
        if (!contact) {
            return res.status(404).json({ message: 'Contact not found' });
        }
        res.status(200).json({ message: 'Contact deleted successfully' });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};
exports.getContactStats = async (req, res) => {
    try {
        const total = await Contact.countDocuments();
        const pending = await Contact.countDocuments({ status: 'pending' });
        const replied = await Contact.countDocuments({ status: 'replied' });
        const closed = await Contact.countDocuments({ status: 'closed' });
        res.status(200).json({
            total,
            pending,
            replied,
            closed
        });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};
