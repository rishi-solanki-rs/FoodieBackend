const express = require("express");
const router = express.Router();
const { protect } = require("../middleware/authMiddleware");
const { getActiveBanners, trackBannerClick } = require("../controllers/bannerController");

router.get("/", getActiveBanners);
router.post("/click/:bannerId", protect, trackBannerClick);

module.exports = router;
