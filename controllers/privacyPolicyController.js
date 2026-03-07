const PrivacyPolicy = require('../models/PrivacyPolicy');
exports.getPrivacyPolicy = async (req, res) => {
    try {
        let policy = await PrivacyPolicy.findOne({ isActive: true });
        if (!policy) {
            return res.status(404).json({ message: 'Privacy Policy not found' });
        }
        res.status(200).json(policy);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};
exports.updatePrivacyPolicy = async (req, res) => {
    try {
        const { title, content } = req.body;
        const userId = req.user.id;
        let policy = await PrivacyPolicy.findOne();
        if (!policy) {
            policy = new PrivacyPolicy({
                title: title || 'Privacy Policy',
                content,
                lastRevisedBy: userId
            });
        } else {
            policy.title = title || policy.title;
            policy.content = content;
            policy.lastRevised = new Date();
            policy.lastRevisedBy = userId;
            policy.version += 1;
        }
        await policy.save();
        await policy.populate('lastRevisedBy', 'name email');
        res.status(200).json({
            message: 'Privacy Policy updated successfully',
            policy
        });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};
exports.getPrivacyPolicyAdmin = async (req, res) => {
    try {
        const policy = await PrivacyPolicy.findOne().populate('lastRevisedBy', 'name email');
        if (!policy) {
            return res.status(404).json({ message: 'Privacy Policy not found' });
        }
        res.status(200).json(policy);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};
