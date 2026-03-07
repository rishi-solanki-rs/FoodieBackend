const express = require('express');
const router = express.Router();
const trainingController = require('../controllers/trainingController');
const { protect, admin } = require('../middleware/authMiddleware');
router.get('/', protect, trainingController.getAllMaterials);
router.post('/', protect, admin, trainingController.addMaterial);
router.delete('/:id', protect, admin, trainingController.deleteMaterial);
module.exports = router;
