const AboutUs = require('../models/AboutUs');
exports.getAboutUs = async (req, res) => {
    try {
        let about = await AboutUs.findOne({ isActive: true });
        if (!about) {
            return res.status(404).json({ message: 'About Us not found' });
        }
        res.status(200).json(about);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};
exports.updateAboutUs = async (req, res) => {
    try {
        const { title, content } = req.body;
        const userId = req.user.id;
        let about = await AboutUs.findOne();
        if (!about) {
            about = new AboutUs({
                title: title || 'About Us',
                content,
                lastRevisedBy: userId
            });
        } else {
            about.title = title || about.title;
            about.content = content;
            about.lastRevised = new Date();
            about.lastRevisedBy = userId;
            about.version += 1;
        }
        await about.save();
        await about.populate('lastRevisedBy', 'name email');
        res.status(200).json({
            message: 'About Us updated successfully',
            about
        });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};
exports.getAboutUsAdmin = async (req, res) => {
    try {
        const about = await AboutUs.findOne().populate('lastRevisedBy', 'name email');
        if (!about) {
            return res.status(404).json({ message: 'About Us not found' });
        }
        res.status(200).json(about);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};
