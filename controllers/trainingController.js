const Training = require('../models/TrainingMaterial');
exports.getAllMaterials = async (req, res) => {
    try {
        const materials = await Training.find().sort({ createdAt: -1 });
        res.status(200).json({ materials });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};
exports.addMaterial = async (req, res) => {
    try {
        const { title, url, description } = req.body;
        const mat = await Training.create({ title, url, description });
        res.status(201).json({ message: 'Training material added', material: mat });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};
exports.deleteMaterial = async (req, res) => {
    try {
        const mat = await Training.findByIdAndDelete(req.params.id);
        if (!mat) return res.status(404).json({ message: 'Material not found' });
        res.status(200).json({ message: 'Deleted' });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};
