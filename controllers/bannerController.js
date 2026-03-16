const Banner = require("../models/Banner");
const BannerClick = require("../models/BannerClick");

const NAV_FIELDS = "_id title image type targetId targetModel externalUrl navigationType";

function computeNavigationType(banner) {
  if (!banner || !banner.type) return "none";
  switch (banner.type) {
    case "restaurant":
      return "restaurant";
    case "item":
      return "product";
    case "category":
      return "category";
    case "external":
      return "external";
    default:
      return "none";
  }
}

exports.getActiveBanners = async (req, res) => {
  try {
    const banners = await Banner.find({ isActive: true })
      .sort({ position: 1 })
      .select(NAV_FIELDS)
      .lean();

    const normalized = banners.map((banner) => ({
      _id: banner._id,
      title: banner.title,
      image: banner.image,
      type: banner.type,
      targetId: banner.targetId || null,
      targetModel: banner.targetModel || null,
      externalUrl: banner.externalUrl || null,
      navigationType: banner.navigationType || computeNavigationType(banner),
    }));

    return res.status(200).json(normalized);
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};

exports.trackBannerClick = async (req, res) => {
  try {
    const { bannerId } = req.params;
    const banner = await Banner.findById(bannerId).select("_id").lean();

    if (!banner) {
      return res.status(404).json({ message: "Banner not found" });
    }

    await BannerClick.create({
      bannerId,
      userId: req.user?._id || null,
      clickedAt: new Date(),
    });

    return res.status(201).json({
      message: "Banner click tracked",
      data: {
        bannerId,
        userId: req.user?._id || null,
        clickedAt: new Date(),
      },
    });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};
