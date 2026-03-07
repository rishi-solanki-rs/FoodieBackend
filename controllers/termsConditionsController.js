const TermsConditions = require('../models/TermsConditions');
exports.getTermsConditions = async (req, res) => {
    try {
        let terms = await TermsConditions.findOne({ isActive: true });
        if (!terms) {
            return res.status(404).json({ message: 'Terms and Conditions not found' });
        }
        res.status(200).json(terms);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};
exports.updateTermsConditions = async (req, res) => {
    try {
        const { title, content } = req.body;
        const userId = req.user.id;
        let terms = await TermsConditions.findOne();
        if (!terms) {
            terms = new TermsConditions({
                title: title || 'Terms and Conditions',
                content,
                lastRevisedBy: userId
            });
        } else {
            terms.title = title || terms.title;
            terms.content = content;
            terms.lastRevised = new Date();
            terms.lastRevisedBy = userId;
            terms.version += 1;
        }
        await terms.save();
        await terms.populate('lastRevisedBy', 'name email');
        res.status(200).json({
            message: 'Terms and Conditions updated successfully',
            terms
        });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};
exports.getTermsConditionsAdmin = async (req, res) => {
    try {
        const terms = await TermsConditions.findOne().populate('lastRevisedBy', 'name email');
        if (!terms) {
            return res.status(404).json({ message: 'Terms and Conditions not found' });
        }
        res.status(200).json(terms);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};
