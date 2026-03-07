const express = require("express");
const router = express.Router();
const { protect } = require("../middleware/authMiddleware"); // Assuming you have this
const {
  globalSearch,
  getSuggestions,
  getSearchLanding,
  clearSearchHistory,
} = require("../controllers/searchController");
router.get("/landing", protect, getSearchLanding);
router.get("/suggestions", getSuggestions);
router.get("/", protect, globalSearch); // /api/search?q=...
router.delete("/history", protect, clearSearchHistory);
module.exports = router;
