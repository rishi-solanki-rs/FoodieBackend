const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/authMiddleware');
const { 
	getHomeData, 
	getBanners, 
	getCategories, 
	getRecommendedRestaurants, 
	getExploreRestaurants 
} = require('../controllers/homeController');
router.get('/', protect, getHomeData);
router.get('/banners', protect, getBanners);
router.get('/categories', protect, getCategories);
router.get('/recommended', protect, getRecommendedRestaurants);
router.get('/explore', protect, getExploreRestaurants);
module.exports = router;
