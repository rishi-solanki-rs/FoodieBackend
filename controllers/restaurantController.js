const Restaurant = require("../models/Restaurant");
const User = require("../models/User");
const bcrypt = require("bcryptjs");
const mongoose = require("mongoose");
const Product = require("../models/Product"); // Required for Menu
const Category = require("../models/Category");
const Rider = require("../models/Rider");
const { getPaginationParams } = require("../utils/pagination");
const { formatRestaurantForUser, formatRestaurantForAdmin } = require("../utils/responseFormatter");
const { getFileUrl } = require("../utils/upload");
const { getNearbyRidersQuery, calculateDistance, estimateTravelMinutes } = require("../utils/locationUtils");
const { isRestaurantOpenNow } = require("../utils/restaurantAvailability");
const { initiateProfileUpdate, verifyOTPAndApplyUpdate, checkDuplicate } = require("../utils/profileUpdateHelpers");
const normalizeRatingOutput = (rating) => {
  if (rating && typeof rating === "object") return rating;
  const average = typeof rating === "number" ? rating : 0;
  return {
    average,
    count: 0,
    breakdown: { five: 0, four: 0, three: 0, two: 0, one: 0 },
    lastRatedAt: null,
  };
};
const withRatingObject = (restaurant) => {
  if (!restaurant) return restaurant;
  const plain = restaurant.toObject ? restaurant.toObject() : { ...restaurant };
  return { ...plain, rating: normalizeRatingOutput(restaurant.rating) };
};
const parseIfString = (value) => {
  if (typeof value !== "string") return value;
  try {
    return JSON.parse(value);
  } catch (error) {
    return value;
  }
};
const isPlainObject = (value) => {
  return value !== null && typeof value === "object" && !Array.isArray(value);
};
const normalizeCuisine = (value) => {
  if (Array.isArray(value)) return value;
  if (typeof value === "string" && value.trim()) {
    if (value.includes(",")) {
      return value
        .split(",")
        .map((item) => item.trim())
        .filter(Boolean);
    }
    return [value.trim()];
  }
  return value;
};
const normalizeTranslation = (value) => {
  const parsed = parseIfString(value);
  if (!parsed) return parsed;
  if (typeof parsed === "string") return { en: parsed };
  return parsed;
};
const normalizeDeliveryType = (value) => {
  const parsed = parseIfString(value);
  if (Array.isArray(parsed)) return parsed;
  if (typeof parsed === "string" && parsed.trim()) {
    if (parsed.includes(",")) {
      return parsed
        .split(",")
        .map((item) => item.trim())
        .filter(Boolean);
    }
    return [parsed.trim()];
  }
  return parsed;
};
const normalizeBankDetails = (value) => {
  const parsed = parseIfString(value);
  if (!parsed || typeof parsed !== "object") return {};
  const normalized = { ...parsed };
  if (!normalized.accountName && normalized.holderName) {
    normalized.accountName = normalized.holderName;
  }
  if (!normalized.swiftCode && normalized.ifscCode) {
    normalized.swiftCode = normalized.ifscCode;
  }
  return normalized;
};
const normalizeImageArray = (value) => {
  if (!value) return [];
  if (Array.isArray(value)) return value;
  if (typeof value === "string") return [value];
  return [];
};
exports.adminCreateRestaurant = async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();
  try {
    const {
      ownerName,
      ownerEmail,
      ownerMobile,
      ownerPassword,
      name,
      description,
      restaurantType,
      cuisine,
      address,
      city,
      area,
      location,
      contactNumber,
      email,
      deliveryTime,
      packagingCharge,
      geofenceRadius,
      deliveringZones,
      deliveryType,
      paymentMethods,
      adminCommission,
      brand,
      isFreeDelivery,
      freeDeliveryContribution,
      bankDetails,
      timing,
    } = req.body;
    const parsedLocation = parseIfString(location);
    const parsedTiming = parseIfString(timing);
    const parsedBankDetails = normalizeBankDetails(bankDetails);
    const parsedCuisine = normalizeCuisine(parseIfString(cuisine));
    const parsedName = normalizeTranslation(name);
    const parsedDescription = normalizeTranslation(description);
    const parsedDeliveryType = normalizeDeliveryType(deliveryType);
    const existingRestaurant = await Restaurant.findOne({ owner: req.user._id });
    if (existingRestaurant) {
      return res
        .status(400)
        .json({ message: "You already have a restaurant registered." });
    }
    if (!ownerEmail) {
      return res.status(400).json({ message: "Owner email is required" });
    }
    if (email && email !== ownerEmail) {
      return res
        .status(400)
        .json({ message: "Restaurant email must match owner email" });
    }
    const existingRestaurantEmail = await Restaurant.findOne({ email: ownerEmail });
    if (existingRestaurantEmail) {
      return res
        .status(400)
        .json({ message: "Restaurant email already in use" });
    }
    const existingUser = await User.findOne({
      $or: [{ email: ownerEmail }, { mobile: ownerMobile }],
    });
    if (existingUser) {
      throw new Error("User with this email or mobile already exists");
    }
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(ownerPassword, salt);
    const [user] = await User.create(
      [
        {
          name: ownerName,
          email: ownerEmail,
          mobile: ownerMobile,
          password: hashedPassword,
          role: "restaurant_owner",
          isVerified: true,
        },
      ],
      { session },
    );
    let image = null;
    let bannerImage = null;
    let restaurantImages = [];
    const documents = {};
    if (req.files) {
      if (req.files.image && req.files.image[0]) {
        image = getFileUrl(req.files.image[0]);
      }
      if (req.files.bannerImage && req.files.bannerImage[0]) {
        bannerImage = getFileUrl(req.files.bannerImage[0]);
      }
      if (req.files.images && req.files.images.length) {
        restaurantImages = req.files.images.map((file) => getFileUrl(file));
      }
      if (req.files.licenseFrontImage && req.files.licenseFrontImage[0]) {
        documents.license = documents.license || {};
        documents.license.url = getFileUrl(req.files.licenseFrontImage[0]);
      }
      if (req.files.licenseBackImage && req.files.licenseBackImage[0]) {
        documents.license = documents.license || {};
        documents.license.backUrl = getFileUrl(req.files.licenseBackImage[0]);
      }
      if (req.files.panImage && req.files.panImage[0]) {
        documents.pan = documents.pan || {};
        documents.pan.url = getFileUrl(req.files.panImage[0]);
      }
      if (req.files.gstImage && req.files.gstImage[0]) {
        documents.gst = documents.gst || {};
        documents.gst.url = getFileUrl(req.files.gstImage[0]);
      }
      if (req.files.tradeLicenseImage && req.files.tradeLicenseImage[0]) {
        documents.license = documents.license || {};
        documents.license.url = getFileUrl(req.files.tradeLicenseImage[0]);
      }
      if (req.files.vatImage && req.files.vatImage[0]) {
        documents.gst = documents.gst || {};
        documents.gst.url = getFileUrl(req.files.vatImage[0]);
      }
    }
    const parsedDocuments = parseIfString(req.body.documents);
    if (parsedDocuments && typeof parsedDocuments === "object") {
      if (parsedDocuments.license) {
        documents.license = { ...(documents.license || {}), ...parsedDocuments.license };
      }
      if (parsedDocuments.pan) {
        documents.pan = { ...(documents.pan || {}), ...parsedDocuments.pan };
      }
      if (parsedDocuments.gst) {
        documents.gst = { ...(documents.gst || {}), ...parsedDocuments.gst };
      }
    }
    if (req.body.licenseNumber || req.body.tradeLicenseNumber) {
      documents.license = documents.license || {};
      documents.license.number = req.body.licenseNumber || req.body.tradeLicenseNumber;
    }
    if (req.body.licenseExpiry) {
      documents.license = documents.license || {};
      documents.license.expiry = req.body.licenseExpiry;
    }
    if (req.body.panNumber) {
      documents.pan = documents.pan || {};
      documents.pan.number = req.body.panNumber;
    }
    if (req.body.gstNumber || req.body.vatNumber) {
      documents.gst = documents.gst || {};
      documents.gst.number = req.body.gstNumber || req.body.vatNumber;
    }
    const [restaurant] = await Restaurant.create(
      [
        {
          owner: user._id,
          name: parsedName || name,
          description: parsedDescription || description,
          restaurantType,
          cuisine: parsedCuisine || cuisine,
          brand,
          image,
          bannerImage,
          restaurantImages,
          email: ownerEmail,
          contactNumber,
          address,
          city,
          area,
          location: parsedLocation || location || { type: "Point", coordinates: [0, 0] },
          deliveryTime,
          geofenceRadius,
          deliveringZones,
          deliveryType: parsedDeliveryType || deliveryType,
          paymentMethods,
          packagingCharge,
          adminCommission,
          isFreeDelivery,
          freeDeliveryContribution,
          isActive: true,
          restaurantApproved: true,
          documents,
          verificationStatus: "verified",
          bankDetails: parsedBankDetails || bankDetails,
          timing: parsedTiming || timing,
        },
      ],
      { session },
    );
    await session.commitTransaction();
    session.endSession();
    res.status(201).json({
      message: "Restaurant and Owner created successfully",
      restaurantId: restaurant._id,
      ownerId: user._id,
    });
  } catch (error) {
    await session.abortTransaction();
    session.endSession();
    res.status(500).json({ message: error.message });
  }
};
exports.applyForRestaurant = async (req, res) => {
  try {
    const {
      name,
      description,
      restaurantType,
      cuisine,
      address,
      city,
      area,
      location,
      contactNumber,
      email,
      deliveryTime,
      deliveryType,
      paymentMethods,
      brand,
      bankDetails,
      timing,
      documents: bodyDocuments = {}, // <-- important
    } = req.body;
    const ownerUser = await User.findById(req.user._id).select("email");
    if (!ownerUser || !ownerUser.email) {
      return res.status(400).json({ message: "Owner email not found" });
    }
    if (email && email !== ownerUser.email) {
      return res
        .status(400)
        .json({ message: "Application email must match registered email" });
    }
    const existingRestaurant = await Restaurant.findOne({
      $or: [{ owner: req.user._id }, { email: ownerUser.email }],
    });
    let reuseRejected = false;
    if (existingRestaurant) {
      const isSameOwner =
        existingRestaurant.owner.toString() === req.user._id.toString();
      if (!isSameOwner) {
        return res
          .status(400)
          .json({ message: "Restaurant already exists with this email" });
      }
      const isRejected =
        existingRestaurant.verificationStatus === "rejected" ||
        Boolean(existingRestaurant.rejectionReason);
      if (!isRejected) {
        return res
          .status(400)
          .json({ message: "You already have a restaurant application" });
      }
      reuseRejected = true;
    }
    const parsedLocation = parseIfString(location);
    const parsedTiming = parseIfString(timing);
    const parsedBankDetails = normalizeBankDetails(bankDetails);
    const parsedDocuments = parseIfString(bodyDocuments);
    const parsedCuisine = normalizeCuisine(parseIfString(cuisine));
    const parsedName = normalizeTranslation(name);
    const parsedDescription = normalizeTranslation(description);
    const parsedDeliveryType = normalizeDeliveryType(deliveryType);
    const documents = {
      ...(reuseRejected ? existingRestaurant.documents || {} : {}),
      ...(parsedDocuments || {}),
    };
    if (req.body.tradeLicenseNumber || req.body.licenseNumber) {
      documents.license = documents.license || {};
      documents.license.number = req.body.tradeLicenseNumber || req.body.licenseNumber;
    }
    if (req.body.vatNumber || req.body.gstNumber) {
      documents.gst = documents.gst || {};
      documents.gst.number = req.body.vatNumber || req.body.gstNumber;
    }
    if (req.body.panNumber) {
      documents.pan = documents.pan || {};
      documents.pan.number = req.body.panNumber;
    }
    let image = null;
    let bannerImage = null;
    let restaurantImages = [];
    if (req.files) {
      if (req.files.image?.[0]) {
        image = getFileUrl(req.files.image[0]);
      }
      if (req.files.bannerImage?.[0]) {
        bannerImage = getFileUrl(req.files.bannerImage[0]);
      }
      if (req.files.images && req.files.images.length) {
        restaurantImages = req.files.images.map((file) => getFileUrl(file));
      }
      if (req.files.licenseFrontImage?.[0]) {
        documents.license = documents.license || {};
        documents.license.url = getFileUrl(req.files.licenseFrontImage[0]);
      }
      if (req.files.licenseBackImage?.[0]) {
        documents.license = documents.license || {};
        documents.license.backUrl = getFileUrl(req.files.licenseBackImage[0]);
      }
      if (req.files.panImage?.[0]) {
        documents.pan = documents.pan || {};
        documents.pan.url = getFileUrl(req.files.panImage[0]);
      }
      if (req.files.gstImage?.[0]) {
        documents.gst = documents.gst || {};
        documents.gst.url = getFileUrl(req.files.gstImage[0]);
      }
      if (req.files.tradeLicenseImage?.[0]) {
        documents.license = documents.license || {};
        documents.license.url = getFileUrl(req.files.tradeLicenseImage[0]);
      }
      if (req.files.vatImage?.[0]) {
        documents.gst = documents.gst || {};
        documents.gst.url = getFileUrl(req.files.vatImage[0]);
      }
    }
    if (!image && req.body.image) {
      image = parseIfString(req.body.image);
    }
    if (!bannerImage && req.body.bannerImage) {
      bannerImage = parseIfString(req.body.bannerImage);
    }
    if (restaurantImages.length === 0 && (req.body.restaurantImages || req.body.images)) {
      const bodyImages = parseIfString(req.body.restaurantImages || req.body.images);
      restaurantImages = normalizeImageArray(bodyImages);
    }
    if (reuseRejected) {
      if (!image) image = existingRestaurant.image || null;
      if (!bannerImage) bannerImage = existingRestaurant.bannerImage || null;
      if (restaurantImages.length === 0) {
        restaurantImages = existingRestaurant.restaurantImages || [];
      }
    }
    const restaurantPayload = {
      owner: req.user._id,
      name: parsedName || name,
      description: parsedDescription || description,
      restaurantType,
      cuisine: parsedCuisine || cuisine,
      brand,
      image,
      bannerImage,
      restaurantImages,
      email: ownerUser.email,
      contactNumber,
      address,
      city,
      area,
      location: parsedLocation || location,
      deliveryTime,
      deliveryType: parsedDeliveryType || ["Home Delivery"],
      paymentMethods: paymentMethods || "Both",
      packagingCharge: 0,
      adminCommission: 10,  // ✅ DEFAULT: 10% commission instead of 0
      isFreeDelivery: false,
      freeDeliveryContribution: 0,
      restaurantApproved: false,
      isActive: false,
      verificationStatus: "pending",
      verificationNotes: "",
      rejectionReason: undefined,
      rejectionDate: undefined,
      rejectedBy: undefined,
      documents,
      bankDetails: parsedBankDetails || bankDetails,
      timing: parsedTiming || timing,
    };
    const restaurant = reuseRejected
      ? await Restaurant.findByIdAndUpdate(existingRestaurant._id, restaurantPayload, {
        new: true,
        runValidators: true,
      })
      : await Restaurant.create(restaurantPayload);
    res.status(201).json({
      message:
        "Restaurant application submitted successfully. Please wait for Admin approval.",
      restaurant: withRatingObject(restaurant),
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: error.message });
  }
};
exports.getPendingRestaurants = async (req, res) => {
  try {
    const pendingRestaurants = await Restaurant.find({
      restaurantApproved: false,
    }).populate("owner", "name email mobile");
    res.status(200).json(pendingRestaurants.map((rest) => withRatingObject(rest)));
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};
exports.approveRestaurant = async (req, res) => {
  try {
    const restaurant = await Restaurant.findById(req.params.id);
    if (!restaurant)
      return res.status(404).json({ message: "Restaurant not found" });
    restaurant.restaurantApproved = true;
    restaurant.isActive = true;
    restaurant.verificationStatus = "verified";
    await restaurant.save();
    const ownerUser = await User.findById(restaurant.owner).select("role");
    if (ownerUser && ownerUser.role !== "restaurant_owner") {
      ownerUser.role = "restaurant_owner";
      await ownerUser.save();
    }
    res.status(200).json({ message: "Restaurant Approved!", restaurant: withRatingObject(restaurant) });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};
exports.rejectRestaurant = async (req, res) => {
  try {
    const { reason } = req.body;
    if (!reason) {
      return res.status(400).json({ message: "Rejection reason is required" });
    }
    const restaurant = await Restaurant.findById(req.params.id).populate(
      "owner",
      "name email mobile",
    );
    if (!restaurant) {
      return res.status(404).json({ message: "Restaurant not found" });
    }
    restaurant.restaurantApproved = false;
    restaurant.isActive = false;
    restaurant.rejectionReason = reason;
    restaurant.rejectionDate = new Date();
    restaurant.rejectedBy = req.user._id;
    await restaurant.save();
    if (restaurant.owner) {
      try {
        const { sendNotification } = require("../utils/notificationService");
        await sendNotification(
          restaurant.owner._id,
          "Restaurant Registration Rejected",
          `Your restaurant registration has been rejected. Reason: ${reason}`,
          {
            type: "RESTAURANT_REJECTED",
            restaurantId: restaurant._id,
            reason: reason,
          },
        );
      } catch (notifError) {
        console.error("Notification failed:", notifError.message);
      }
    }
    res.status(200).json({
      message: "Restaurant Rejected Successfully",
      restaurant: withRatingObject(restaurant),
      rejectionReason: reason,
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};
exports.updateRestaurant = async (req, res) => {
  try {
    const restaurant = await Restaurant.findById(req.params.id);
    if (!restaurant) {
      return res.status(404).json({ message: "Restaurant not found" });
    }
    const isAdminUser = req.user && req.user.role === "admin";
    if (!isAdminUser && restaurant.owner.toString() !== req.user._id.toString()) {
      return res.status(403).json({ message: "Access denied" });
    }

    if (!isAdminUser && (req.body.email !== undefined || req.body.contactNumber !== undefined)) {
      return res.status(400).json({
        message: "Email/Contact number updates require OTP verification. Use request-update endpoint"
      });
    }
    if (req.file) {
      req.body.image = getFileUrl(req.file);
    }
    if (req.files?.image?.[0]) {
      req.body.image = getFileUrl(req.files.image[0]);
    }
    if (req.files?.bannerImage?.[0]) {
      req.body.bannerImage = getFileUrl(req.files.bannerImage[0]);
    }
    if (req.files?.images?.length) {
      req.body.restaurantImages = req.files.images.map((file) => getFileUrl(file));
    }
    const updates = { ...req.body };
    if (updates.name !== undefined) updates.name = normalizeTranslation(updates.name);
    if (updates.description !== undefined) {
      updates.description = normalizeTranslation(updates.description);
    }
    if (updates.images !== undefined && updates.restaurantImages === undefined) {
      updates.restaurantImages = updates.images;
    }
    if (updates.cuisine !== undefined) {
      updates.cuisine = normalizeCuisine(parseIfString(updates.cuisine));
    }
    if (updates.location !== undefined) updates.location = parseIfString(updates.location);
    if (updates.location !== undefined && !isPlainObject(updates.location)) {
      return res.status(400).json({ message: "Invalid location format" });
    }
    if (updates.deliveryType !== undefined) {
      updates.deliveryType = normalizeDeliveryType(updates.deliveryType);
    }
    if (updates.restaurantImages !== undefined) {
      updates.restaurantImages = normalizeImageArray(
        parseIfString(updates.restaurantImages),
      );
    }
    if (updates.timing !== undefined) updates.timing = parseIfString(updates.timing);
    if (updates.timing !== undefined && !isPlainObject(updates.timing)) {
      return res.status(400).json({ message: "Invalid timing format" });
    }
    const ownerAllowed = [
      "name",
      "description",
      "restaurantType",
      "cuisine",
      "brand",
      "image",
      "bannerImage",
      "restaurantImages",
      "address",
      "city",
      "area",
      "location",
    ];
    const adminAllowed = ownerAllowed.concat([
      "contactNumber",
      "email",
      "deliveryTime",
      "geofenceRadius",
      "deliveringZones",
      "deliveryType",
      "paymentMethods",
      "isActive",
      "restaurantApproved",
      "verificationStatus",
      "verificationNotes",
      "packagingCharge",
      "adminCommission",
      "isFreeDelivery",
      "freeDeliveryContribution",
      "minOrderValue",
      "estimatedPreparationTime",
      "autoAccept",
      "orderScheduling",
      "dailyOrderLimitType",
      "dailyOrderLimit",
      "notificationSettings",
      "taxConfig",
      "isTemporarilyClosed",
      "timing",
    ]);
    const allowed = isAdminUser ? adminAllowed : ownerAllowed;
    const sanitized = {};
    allowed.forEach((field) => {
      if (updates[field] !== undefined) sanitized[field] = updates[field];
    });
    if (Object.keys(sanitized).length === 0) {
      return res.status(400).json({ message: "No valid fields to update" });
    }
    const updatedRestaurant = await Restaurant.findByIdAndUpdate(
      req.params.id,
      sanitized,
      { new: true, runValidators: true },
    );
    res
      .status(200)
      .json({ message: "Updated Successfully", restaurant: withRatingObject(updatedRestaurant) });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};
exports.requestRestaurantProfileUpdate = async (req, res) => {
  try {
    const { email, contactNumber } = req.body;
    if (!email && !contactNumber) {
      return res.status(400).json({ message: "Provide email or contactNumber to update" });
    }
    const restaurant = await Restaurant.findById(req.params.id);
    if (!restaurant) {
      return res.status(404).json({ message: "Restaurant not found" });
    }
    if (restaurant.owner.toString() !== req.user._id.toString()) {
      return res.status(403).json({ message: "Access denied" });
    }
    if (email && (!email.includes("@") || email.length < 5)) {
      return res.status(400).json({ message: "Invalid email format" });
    }
    if (contactNumber && contactNumber.length < 10) {
      return res.status(400).json({ message: "Invalid contact number" });
    }
    if (email) {
      const isDuplicate = await checkDuplicate(Restaurant, 'email', email, restaurant._id);
      if (isDuplicate) {
        return res.status(409).json({ message: "Email already in use by another restaurant" });
      }
    }
    if (contactNumber) {
      const isDuplicate = await checkDuplicate(Restaurant, 'contactNumber', contactNumber, restaurant._id);
      if (isDuplicate) {
        return res.status(409).json({ message: "Contact number already in use by another restaurant" });
      }
    }
    const result = await initiateProfileUpdate(restaurant, { email, contactNumber });
    res.status(200).json({
      success: true,
      message: result.message,
      testOtp: result.testOtp, // Remove in production
      expiresIn: result.expiresIn,
      destination: result.destination
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};
exports.verifyRestaurantProfileUpdate = async (req, res) => {
  try {
    const { otp } = req.body;
    if (!otp || otp.length !== 6) {
      return res.status(400).json({ message: "Valid 6-digit OTP is required" });
    }
    const restaurant = await Restaurant.findById(req.params.id);
    if (!restaurant) {
      return res.status(404).json({ message: "Restaurant not found" });
    }
    if (restaurant.owner.toString() !== req.user._id.toString()) {
      return res.status(403).json({ message: "Access denied" });
    }
    const result = await verifyOTPAndApplyUpdate(restaurant, otp, null);
    if (!result.success) {
      return res.status(400).json({ message: result.message });
    }
    res.status(200).json({
      success: true,
      message: result.message,
      appliedUpdates: result.appliedUpdates,
      restaurant: {
        _id: restaurant._id,
        name: restaurant.name,
        email: restaurant.email,
        contactNumber: restaurant.contactNumber
      }
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};
exports.verifyRestaurantDocuments = async (req, res) => {
  try {
    const { action, notes } = req.body;
    const restaurant = await Restaurant.findById(req.params.id);
    if (!restaurant)
      return res.status(404).json({ message: "Restaurant not found" });
    if (action === "verify") {
      restaurant.verificationStatus = "verified";
      restaurant.restaurantApproved = true;
      restaurant.isActive = true;
      restaurant.verificationNotes = notes || "";
      const ownerUser = await User.findById(restaurant.owner).select("role");
      if (ownerUser && ownerUser.role !== "restaurant_owner") {
        ownerUser.role = "restaurant_owner";
        await ownerUser.save();
      }
    } else if (action === "reject") {
      restaurant.verificationStatus = "rejected";
      restaurant.verificationNotes = notes || "";
    } else {
      return res.status(400).json({ message: "Invalid action" });
    }
    await restaurant.save();
    const { sendNotification } = require("../utils/notificationService");
    await sendNotification(
      restaurant.owner,
      "Verification Update",
      `Your restaurant verification status: ${restaurant.verificationStatus}`,
      { restaurantId: restaurant._id },
    );
    res.status(200).json({ message: "Verification updated", restaurant });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};
exports.getRestaurantByIdAdmin = async (req, res) => {
  try {
    const { id } = req.params;
    const restaurant = await Restaurant.findById(id).populate('owner', 'name email mobile');
    if (!restaurant) {
      return res.status(404).json({ message: "Restaurant not found" });
    }
    const products = await Product.find({ restaurant: id });
    const categoryIds = [
      ...new Set(
        products
          .map((p) => (p.category ? p.category.toString() : null))
          .filter(Boolean)
      ),
    ];
    const categories = await Category.find({ _id: { $in: categoryIds } });
    const menuByCategoryId = {};
    categories.forEach((cat) => {
      menuByCategoryId[cat._id.toString()] = {
        category: {
          _id: cat._id,
          name: cat.name,
          image: cat.image,
        },
        items: [],
      };
    });
    products.forEach((p) => {
      const category = categories.find(
        (c) => c._id.toString() === p.category.toString(),
      );
      if (!category) return;
      const item = {
        _id: p._id,
        categoryId: p.category,
        name: p.name?.en || p.name,
        description: p.description ? p.description.en || p.description : "",
        image: p.image,
        basePrice: p.basePrice,
        variations: p.variations,
        addOns: p.addOns,
        available: p.available,
        quantity: p.quantity,
        unit: p.unit,
        gstPercent: p.gstPercent,
        isBestSeller: false,
      };
      const categoryKey = category._id.toString();
      if (!menuByCategoryId[categoryKey]) {
        menuByCategoryId[categoryKey] = {
          category: {
            _id: category._id,
            name: category.name,
            image: category.image,
          },
          items: [],
        };
      }
      menuByCategoryId[categoryKey].items.push(item);
    });
    const formattedRestaurant = formatRestaurantForAdmin(restaurant);
    res.status(200).json({
      restaurant: formattedRestaurant,
      menu: menuByCategoryId,
      categories: categories.map((cat) => ({
        _id: cat._id,
        name: cat.name,
        image: cat.image,
      })),
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};
exports.getRestaurantById = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user ? req.user._id : null; // Check if user logged in
    const restaurant = await Restaurant.findById(id);
    if (!restaurant)
      return res.status(404).json({ message: "Restaurant not found" });
    if (!restaurant.menuApproved) {
      return res.status(403).json({
        message: "Restaurant menu is not yet available",
        status: "pending_approval"
      });
    }
    const products = await Product.find({
      restaurant: id,
      available: true,
      isApproved: true,
    });
    const categoryIds = [
      ...new Set(products.map((p) => p.category.toString())),
    ];
    const categories = await Category.find({ _id: { $in: categoryIds } });
    const menuByCategoryId = {};
    categories.forEach((cat) => {
      menuByCategoryId[cat._id.toString()] = {
        category: {
          _id: cat._id,
          name: cat.name,
          image: cat.image,
        },
        items: [],
      };
    });
    products.forEach((p) => {
      const category = categories.find(
        (c) => c._id.toString() === p.category.toString(),
      );
      if (!category) return;
      const item = {
        _id: p._id,
        categoryId: p.category,
        name: p.name.en || p.name,
        description: p.description ? p.description.en || p.description : "",
        image: p.image,
        basePrice: p.basePrice,
        variations: p.variations,
        addOns: p.addOns,
        available: p.available,
        quantity: p.quantity,
        unit: p.unit,
        gstPercent: p.gstPercent,
        isBestSeller: false,
      };
      const categoryKey = category._id.toString();
      if (!menuByCategoryId[categoryKey]) {
        menuByCategoryId[categoryKey] = {
          category: {
            _id: category._id,
            name: category.name,
            image: category.image,
          },
          items: [],
        };
      }
      menuByCategoryId[categoryKey].items.push(item);
    });
    let isFavorite = false;
    if (userId) {
      const user = await User.findById(userId);
      if (
        user &&
        user.favoriteRestaurants &&
        user.favoriteRestaurants.includes(id)
      ) {
        isFavorite = true;
      }
    }
    const formattedRestaurant = formatRestaurantForUser(restaurant);
    res.status(200).json({
      restaurant: formattedRestaurant,
      menu: menuByCategoryId,
      categories: categories.map((cat) => ({
        _id: cat._id,
        name: cat.name,
        image: cat.image,
      })),
      isFavorite,
      surgeFee: 0,
      platformFee: 5,
      packagingCharge: restaurant.packagingCharge || 0,
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};
exports.updateDocuments = async (req, res) => {
  try {
    const { id } = req.params;
    const restaurant = await Restaurant.findById(id);
    const isAdminUser = req.user && req.user.role === "admin";
    if (!restaurant)
      return res.status(404).json({ message: "Restaurant not found" });
    if (!isAdminUser && restaurant.owner.toString() !== req.user._id.toString())
      return res.status(403).json({ message: "Access denied" });
    const documents = restaurant.documents || {};
    const parsedBodyDocuments = parseIfString(req.body.documents);
    if (parsedBodyDocuments !== undefined && parsedBodyDocuments !== null && !isPlainObject(parsedBodyDocuments)) {
      return res.status(400).json({ message: "Invalid documents format" });
    }
    if (parsedBodyDocuments && typeof parsedBodyDocuments === "object") {
      if (parsedBodyDocuments.license) {
        documents.license = { ...(documents.license || {}), ...parsedBodyDocuments.license };
      }
      if (parsedBodyDocuments.pan) {
        documents.pan = { ...(documents.pan || {}), ...parsedBodyDocuments.pan };
      }
      if (parsedBodyDocuments.gst) {
        documents.gst = { ...(documents.gst || {}), ...parsedBodyDocuments.gst };
      }
    }
    if (req.files) {
      if (req.files.licenseFrontImage && req.files.licenseFrontImage[0]) {
        documents.license = documents.license || {};
        documents.license.url = getFileUrl(req.files.licenseFrontImage[0]);
      }
      if (req.files.licenseBackImage && req.files.licenseBackImage[0]) {
        documents.license = documents.license || {};
        documents.license.backUrl = getFileUrl(req.files.licenseBackImage[0]);
      }
      if (req.files.panImage && req.files.panImage[0]) {
        documents.pan = documents.pan || {};
        documents.pan.url = getFileUrl(req.files.panImage[0]);
      }
      if (req.files.gstImage && req.files.gstImage[0]) {
        documents.gst = documents.gst || {};
        documents.gst.url = getFileUrl(req.files.gstImage[0]);
      }
      if (req.files.tradeLicenseImage && req.files.tradeLicenseImage[0]) {
        documents.license = documents.license || {};
        documents.license.url = getFileUrl(req.files.tradeLicenseImage[0]);
      }
      if (req.files.vatImage && req.files.vatImage[0]) {
        documents.gst = documents.gst || {};
        documents.gst.url = getFileUrl(req.files.vatImage[0]);
      }
    }
    if (req.body.licenseNumber || req.body.tradeLicenseNumber) {
      documents.license = documents.license || {};
      documents.license.number = req.body.licenseNumber || req.body.tradeLicenseNumber;
    }
    if (req.body.licenseExpiry) {
      documents.license = documents.license || {};
      documents.license.expiry = req.body.licenseExpiry;
    }
    if (req.body.panNumber) {
      documents.pan = documents.pan || {};
      documents.pan.number = req.body.panNumber;
    }
    if (req.body.gstNumber || req.body.vatNumber) {
      documents.gst = documents.gst || {};
      documents.gst.number = req.body.gstNumber || req.body.vatNumber;
    }
    restaurant.documents = documents;
    restaurant.verificationStatus = "pending";
    restaurant.verificationNotes = "";
    restaurant.restaurantApproved = false;
    restaurant.isActive = false;
    restaurant.rejectionReason = undefined;
    restaurant.rejectionDate = undefined;
    restaurant.rejectedBy = undefined;
    await restaurant.save();
    res
      .status(200)
      .json({
        message: "Documents uploaded, verification pending",
        restaurant,
      });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};
exports.updateBankDetails = async (req, res) => {
  try {
    const { id } = req.params;
    const { bankDetails } = req.body;
    const isAdminUser = req.user && req.user.role === "admin";
    const restaurant = await Restaurant.findById(id);
    if (!restaurant)
      return res.status(404).json({ message: "Restaurant not found" });
    if (!isAdminUser && restaurant.owner.toString() !== req.user._id.toString())
      return res.status(403).json({ message: "Access denied" });
    const parsedBankDetails = normalizeBankDetails(
      parseIfString(bankDetails || req.body.bankDetails || req.body),
    );
    if (!Object.keys(parsedBankDetails).length) {
      return res.status(400).json({ message: "No bank details provided" });
    }
    restaurant.bankDetails = {
      ...(restaurant.bankDetails || {}),
      ...parsedBankDetails,
    };
    restaurant.verificationStatus = "pending";
    restaurant.verificationNotes = "";
    restaurant.restaurantApproved = false;
    restaurant.isActive = false;
    restaurant.rejectionReason = undefined;
    restaurant.rejectionDate = undefined;
    restaurant.rejectedBy = undefined;
    await restaurant.save();
    res
      .status(200)
      .json({
        message: "Bank details updated, verification pending",
        restaurant,
      });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};
exports.getMyRestaurant = async (req, res) => {
  try {
    const restaurant = await Restaurant.findOne({
      owner: req.user._id,
    }).populate("owner", "name email mobile");
    if (!restaurant) {
      return res.status(404).json({ message: "Restaurant not found" });
    }
    res.status(200).json({
      success: true,
      restaurant: {
        _id: restaurant._id,
        name: restaurant.name,
        description: restaurant.description,
        restaurantType: restaurant.restaurantType,
        image: restaurant.image,
        bannerImage: restaurant.bannerImage,
        restaurantImages: restaurant.restaurantImages || [],
        cuisine: restaurant.cuisine,
        address: restaurant.address,
        city: restaurant.city,
        area: restaurant.area,
        location: restaurant.location,
        contactNumber: restaurant.contactNumber,
        email: restaurant.email,
        verificationStatus: restaurant.verificationStatus,
        restaurantApproved: restaurant.restaurantApproved,
        isActive: restaurant.isActive,
        rejectionReason: restaurant.rejectionReason || null,
        rejectionDate: restaurant.rejectionDate || null,
        verificationNotes: restaurant.verificationNotes || null,
        deliveryTime: restaurant.deliveryTime,
        packagingCharge: restaurant.packagingCharge,
        rating: normalizeRatingOutput(restaurant.rating),
        totalOrders: restaurant.totalOrders,
        totalEarnings: restaurant.totalEarnings,
        documents: restaurant.documents,
        bankDetails: restaurant.bankDetails,
        timing: restaurant.timing,
        isTemporarilyClosed: restaurant.isTemporarilyClosed,
        isFreeDelivery: restaurant.isFreeDelivery,
        freeDeliveryContribution: restaurant.freeDeliveryContribution,
        estimatedPreparationTime: restaurant.estimatedPreparationTime,
        autoAccept: restaurant.autoAccept,
        orderScheduling: restaurant.orderScheduling,
        dailyOrderLimitType: restaurant.dailyOrderLimitType,
        dailyOrderLimit: restaurant.dailyOrderLimit,
        notificationSettings: restaurant.notificationSettings,
        owner: restaurant.owner,
      },
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};
exports.getDashboard = async (req, res) => {
  try {
    const restaurant = await Restaurant.findOne({ owner: req.user._id });
    if (!restaurant)
      return res.status(404).json({ message: "Restaurant not found" });
    const restaurantId = restaurant._id;
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    const end = new Date();
    end.setHours(23, 59, 59, 999);
    const Order = require("../models/Order");
    const todaysOrders = await Order.countDocuments({
      restaurant: restaurantId,
      createdAt: { $gte: start, $lte: end },
    });
    const revenueAgg = await Order.aggregate([
      {
        $match: {
          restaurant: restaurantId,
          createdAt: { $gte: start, $lte: end },
          status: { $ne: "cancelled" },
        },
      },
      { $group: { _id: null, totalRevenue: { $sum: "$totalAmount" } } },
    ]);
    const todaysRevenue =
      revenueAgg[0] && revenueAgg[0].totalRevenue
        ? revenueAgg[0].totalRevenue
        : 0;
    const inProgressCount = await Order.countDocuments({
      restaurant: restaurantId,
      status: {
        $in: [
          "placed",
          "accepted",
          "preparing",
          "ready",
          "assigned",
          "reached_restaurant",
          "picked_up",
          "delivery_arrived",
        ],
      },
    });
    const prepAgg = await Order.aggregate([
      { $match: { restaurant: restaurantId } },
      {
        $project: {
          accepted: {
            $arrayElemAt: [
              {
                $filter: {
                  input: "$timeline",
                  cond: { $eq: ["$$this.status", "accepted"] },
                },
              },
              0,
            ],
          },
          ready: {
            $arrayElemAt: [
              {
                $filter: {
                  input: "$timeline",
                  cond: { $eq: ["$$this.status", "ready"] },
                },
              },
              0,
            ],
          },
        },
      },
      {
        $match: {
          "accepted.timestamp": { $exists: true },
          "ready.timestamp": { $exists: true },
        },
      },
      {
        $project: {
          diffMinutes: {
            $divide: [
              {
                $subtract: [
                  "$$ROOT.ready.timestamp",
                  "$$ROOT.accepted.timestamp",
                ],
              },
              1000 * 60,
            ],
          },
        },
      },
      { $group: { _id: null, avgPrep: { $avg: "$diffMinutes" } } },
    ]);
    const avgPrepTime =
      prepAgg[0] && prepAgg[0].avgPrep
        ? Number(prepAgg[0].avgPrep.toFixed(2))
        : null;
    res.status(200).json({
      todaysOrders,
      todaysRevenue,
      inProgressCount,
      avgPrepTime,
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
}; //checkkkkkkkkkkk
exports.getAnalyticsDashboard = async (req, res) => {
  try {
    const restaurant = await Restaurant.findOne({ owner: req.user._id });
    if (!restaurant)
      return res.status(404).json({ message: "Restaurant not found" });
    const restaurantId = restaurant._id;
    const Order = require("../models/Order");
    const last7 = new Date();
    last7.setDate(last7.getDate() - 7);
    const peakAgg = await Order.aggregate([
      { $match: { restaurant: restaurantId, createdAt: { $gte: last7 } } },
      { $project: { hour: { $hour: "$createdAt" } } },
      { $group: { _id: "$hour", count: { $sum: 1 } } },
      { $sort: { count: -1 } },
      { $limit: 5 },
    ]);
    const startOfWeek = new Date();
    startOfWeek.setDate(startOfWeek.getDate() - 7);
    startOfWeek.setHours(0, 0, 0, 0);
    const startOfMonth = new Date();
    startOfMonth.setDate(1);
    startOfMonth.setHours(0, 0, 0, 0);
    const [weeklyAgg, monthlyAgg, weeklyDaily, monthlyDaily] = await Promise.all([
      Order.aggregate([
        { $match: { restaurant: restaurantId, createdAt: { $gte: startOfWeek } } },
        {
          $group: {
            _id: null,
            orders: { $sum: 1 },
            revenue: {
              $sum: {
                $cond: [{ $ne: ["$status", "cancelled"] }, "$totalAmount", 0],
              },
            },
            delivered: {
              $sum: { $cond: [{ $eq: ["$status", "delivered"] }, 1, 0] },
            },
            cancelled: {
              $sum: { $cond: [{ $eq: ["$status", "cancelled"] }, 1, 0] },
            },
          },
        },
      ]),
      Order.aggregate([
        { $match: { restaurant: restaurantId, createdAt: { $gte: startOfMonth } } },
        {
          $group: {
            _id: null,
            orders: { $sum: 1 },
            revenue: {
              $sum: {
                $cond: [{ $ne: ["$status", "cancelled"] }, "$totalAmount", 0],
              },
            },
            delivered: {
              $sum: { $cond: [{ $eq: ["$status", "delivered"] }, 1, 0] },
            },
            cancelled: {
              $sum: { $cond: [{ $eq: ["$status", "cancelled"] }, 1, 0] },
            },
          },
        },
      ]),
      Order.aggregate([
        { $match: { restaurant: restaurantId, createdAt: { $gte: startOfWeek } } },
        {
          $group: {
            _id: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt" } },
            orders: { $sum: 1 },
            revenue: {
              $sum: {
                $cond: [{ $ne: ["$status", "cancelled"] }, "$totalAmount", 0],
              },
            },
          },
        },
        { $sort: { _id: 1 } },
      ]),
      Order.aggregate([
        { $match: { restaurant: restaurantId, createdAt: { $gte: startOfMonth } } },
        {
          $group: {
            _id: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt" } },
            orders: { $sum: 1 },
            revenue: {
              $sum: {
                $cond: [{ $ne: ["$status", "cancelled"] }, "$totalAmount", 0],
              },
            },
          },
        },
        { $sort: { _id: 1 } },
      ]),
    ]);
    const weeklyTotals = weeklyAgg[0] || { orders: 0, revenue: 0, delivered: 0, cancelled: 0 };
    const monthlyTotals = monthlyAgg[0] || { orders: 0, revenue: 0, delivered: 0, cancelled: 0 };
    return res.status(200).json({
      peakHours: peakAgg,
      weekly: {
        totals: weeklyTotals,
        daily: weeklyDaily,
      },
      monthly: {
        totals: monthlyTotals,
        daily: monthlyDaily,
      },
    });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};
exports.updateSettings = async (req, res) => {
  try {
    const { id } = req.params;
    const updates = req.body;
    const restaurant = await Restaurant.findById(id);
    if (!restaurant)
      return res.status(404).json({ message: "Restaurant not found" });
    if (restaurant.owner.toString() !== req.user._id.toString())
      return res.status(403).json({ message: "Access denied" });
    const allowed = [
      "timing",
      "isTemporarilyClosed",
      "minOrderValue",
      "packagingCharge",
      "estimatedPreparationTime",
      "autoAccept",
      "orderScheduling",
      "dailyOrderLimitType",
      "dailyOrderLimit",
      "notificationSettings",
      "taxConfig",
      "deliveryTime",
      "geofenceRadius",
      "deliveringZones",
      "paymentMethods",
    ];
    allowed.forEach((field) => {
      if (updates[field] === undefined) return;

      // Parse stringified JSON (e.g. when sent as form-data)
      const value =
        typeof updates[field] === "string"
          ? (() => {
              try {
                return JSON.parse(updates[field]);
              } catch {
                return updates[field];
              }
            })()
          : updates[field];

      restaurant[field] = value;

      // Mongoose won't auto-detect changes to nested objects.
      if (typeof value === "object" && value !== null) {
        restaurant.markModified(field);
      }
    });

    await restaurant.save();

    // Return only safe owner fields.
    const result = await restaurant.populate("owner", "name email");
    res
      .status(200)
      .json({ message: "Settings updated successfully", restaurant: result });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};
exports.financeSummary = async (req, res) => {
  try {
    const restaurant = await Restaurant.findOne({ owner: req.user._id });
    if (!restaurant)
      return res.status(404).json({ message: "Restaurant not found" });
    const { period = "day", from, to } = req.query;
    const Order = require("../models/Order");
    const match = { restaurant: restaurant._id, status: { $ne: "cancelled" } };
    if (from) match.createdAt = { $gte: new Date(from) };
    if (to)
      match.createdAt = match.createdAt
        ? { ...match.createdAt, $lte: new Date(to) }
        : { $lte: new Date(to) };
    let groupId = null;
    if (period === "week") {
      groupId = { $isoWeek: "$createdAt" };
    } else if (period === "month") {
      groupId = { $dateToString: { format: "%Y-%m", date: "$createdAt" } };
    } else {
      groupId = { $dateToString: { format: "%Y-%m-%d", date: "$createdAt" } };
    }
    const agg = await Order.aggregate([
      { $match: match },
      {
        $group: {
          _id: groupId,
          totalRevenue: { $sum: "$totalAmount" },
          orders: { $sum: 1 },
          platformFees: { $sum: "$platformFee" },
        },
      },
      { $sort: { _id: -1 } },
    ]);
    const totals = agg.reduce(
      (acc, cur) => ({
        revenue: acc.revenue + (cur.totalRevenue || 0),
        platformFees: acc.platformFees + (cur.platformFees || 0),
        orders: acc.orders + (cur.orders || 0),
      }),
      { revenue: 0, platformFees: 0, orders: 0 },
    );
    const commission =
      (totals.revenue * (restaurant.adminCommission || 0)) / 100;
    const payout = totals.revenue - commission - totals.platformFees;
    res
      .status(200)
      .json({
        aggregation: agg,
        totals: {
          revenue: totals.revenue,
          platformFees: totals.platformFees,
          commission,
          payout,
          orders: totals.orders,
        },
      });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};
exports.getRestaurantWalletEarnings = async (req, res) => {
  try {
    const restaurant = await Restaurant.findOne({ owner: req.user._id });
    if (!restaurant) return res.status(404).json({ message: "Restaurant not found" });
    const RestaurantWallet = require('../models/RestaurantWallet');
    const Order = require('../models/Order');
    const [wallet, ordersAgg] = await Promise.all([
      RestaurantWallet.findOne({ restaurant: restaurant._id }),
      Order.aggregate([
        { $match: { restaurant: restaurant._id, status: 'delivered' } },
        {
          $group: {
            _id: null,
            totalRevenue: { $sum: '$totalAmount' },
            totalCommission: { $sum: '$adminCommission' },
            totalRestaurantNet: { $sum: '$restaurantCommission' },
            totalOrders: { $sum: 1 },
          }
        }
      ]),
    ]);
    const agg = ordersAgg[0] || { totalRevenue: 0, totalCommission: 0, totalRestaurantNet: 0, totalOrders: 0 };
    res.status(200).json({
      success: true,
      wallet: wallet ? {
        balance: Number((wallet.balance || 0).toFixed(2)),
        totalEarnings: Number((wallet.totalEarnings || 0).toFixed(2)),
        totalPaidOut: Number((wallet.totalPaidOut || 0).toFixed(2)),
        pendingAmount: Number((wallet.pendingAmount || 0).toFixed(2)),
        lastPayoutAt: wallet.lastPayoutAt || null,
        lastPayoutAmount: wallet.lastPayoutAmount || 0,
        nextPayoutDate: wallet.nextPayoutDate || null,
      } : null,
      summary: {
        totalDeliveredOrders: agg.totalOrders,
        totalRevenue: Number(agg.totalRevenue.toFixed(2)),
        totalPlatformCommission: Number(agg.totalCommission.toFixed(2)),
        totalRestaurantNet: Number(agg.totalRestaurantNet.toFixed(2)),
      }
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};
exports.bestSellers = async (req, res) => {
  try {
    const restaurant = await Restaurant.findOne({ owner: req.user._id });
    if (!restaurant)
      return res.status(404).json({ message: "Restaurant not found" });
    const { limit = 10, from, to } = req.query;
    const match = { restaurant: restaurant._id, status: { $ne: "cancelled" } };
    if (from) match.createdAt = { $gte: new Date(from) };
    if (to)
      match.createdAt = match.createdAt
        ? { ...match.createdAt, $lte: new Date(to) }
        : { $lte: new Date(to) };
    const Order = require("../models/Order");
    const agg = await Order.aggregate([
      { $match: match },
      { $unwind: "$items" },
      {
        $group: {
          _id: "$items.product",
          name: { $first: "$items.name" },
          qty: { $sum: "$items.quantity" },
          revenue: { $sum: { $multiply: ["$items.quantity", "$items.price"] } },
        },
      },
      { $sort: { qty: -1 } },
      { $limit: parseInt(limit) },
    ]);
    res.status(200).json({ bestSellers: agg });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};
exports.getOrderInvoice = async (req, res) => {
  try {
    const restaurant = await Restaurant.findOne({ owner: req.user._id });
    if (!restaurant)
      return res.status(404).json({ message: "Restaurant not found" });
    const Order = require("../models/Order");
    const order = await Order.findById(req.params.orderId).populate(
      "customer",
      "name email",
    );
    if (!order || order.restaurant.toString() !== restaurant._id.toString())
      return res.status(404).json({ message: "Order not found" });
    const invoice = {
      orderId: order._id,
      date: order.createdAt,
      restaurant: {
        name: restaurant.name,
        gstNumber: restaurant.taxConfig ? restaurant.taxConfig.gstNumber : null,
        address: restaurant.address,
      },
      customer: order.customer,
      items: order.items,
      itemTotal: order.itemTotal,
      tax: order.tax,
      deliveryFee: order.deliveryFee,
      discount: order.discount,
      totalAmount: order.totalAmount,
    };
    res.status(200).json({ invoice });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};
exports.settlementReport = async (req, res) => {
  try {
    const restaurant = await Restaurant.findOne({ owner: req.user._id });
    if (!restaurant)
      return res.status(404).json({ message: "Restaurant not found" });
    const { from, to, format } = req.query;
    const match = { restaurant: restaurant._id, status: { $ne: "cancelled" } };
    if (from) match.createdAt = { $gte: new Date(from) };
    if (to)
      match.createdAt = match.createdAt
        ? { ...match.createdAt, $lte: new Date(to) }
        : { $lte: new Date(to) };
    const Order = require("../models/Order");
    const agg = await Order.aggregate([
      { $match: match },
      {
        $group: {
          _id: null,
          revenue: { $sum: "$totalAmount" },
          platformFees: { $sum: "$platformFee" },
          orders: { $sum: 1 },
        },
      },
    ]);
    const totals = agg[0] || { revenue: 0, platformFees: 0, orders: 0 };
    const commission =
      (totals.revenue * (restaurant.adminCommission || 0)) / 100;
    const payout = totals.revenue - commission - totals.platformFees;
    if (format === "csv") {
      const csv = `revenue,platformFees,commission,payout,orders\n${totals.revenue},${totals.platformFees},${commission},${payout},${totals.orders}`;
      res.header("Content-Type", "text/csv");
      return res.send(csv);
    }
    res
      .status(200)
      .json({
        revenue: totals.revenue,
        platformFees: totals.platformFees,
        commission,
        payout,
        orders: totals.orders,
      });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};
exports.getAllRestaurants = async (req, res) => {
  try {
    const lat = Number(req.query.lat);
    const lng = Number(req.query.lng);
    const radiusKm = Number(req.query.radiusKm || 10);
    const riderRadiusKm = Number(req.query.riderRadiusKm || 5);
    const hasCoords = Number.isFinite(lat) && Number.isFinite(lng);
    const baseQuery = {
      restaurantApproved: true,
      isActive: true,
      isTemporarilyClosed: false,
      menuApproved: true,
    };
    if (hasCoords) {
      baseQuery.location = {
        $near: {
          $geometry: { type: "Point", coordinates: [lng, lat] },
          $maxDistance: radiusKm * 1000,
        },
      };
    }
    let query = Restaurant.find(baseQuery);
    if (hasCoords) {
      query = query.sort({ location: 1 }).limit(50); // Get up to 50 restaurants in delivery area
    } else {
      query = query.limit(10); // Browsing mode - show 10 restaurants
    }
    const restaurants = await query;
    const filteredRestaurants = restaurants.filter((restaurant) => isRestaurantOpenNow(restaurant));
    const riderRadiusMeters = riderRadiusKm * 1000;
    const restaurantsWithAvailability = await Promise.all(
      filteredRestaurants.map(async (restaurant) => {
        const coordinates = restaurant.location?.coordinates;
        if (!coordinates || coordinates.length !== 2 ||
          !Number.isFinite(coordinates[0]) || !Number.isFinite(coordinates[1]) ||
          (coordinates[0] === 0 && coordinates[1] === 0)) {
          return null;
        }
        const baseDeliveryTime = restaurant.deliveryTime || 30;
        const distanceKm = hasCoords ? calculateDistance([lng, lat], coordinates) : null;
        return {
          restaurant,
          nearbyRiderCount: 0,
          estimatedDeliveryTime: baseDeliveryTime,
          pickupMinutes: 0,
          distanceKm,
        };
      }),
    );
    const formattedRestaurants = restaurantsWithAvailability
      .filter(Boolean)
      .map((entry) => {
        const formatted = formatRestaurantForUser(entry.restaurant);
        return {
          ...formatted,
          estimatedDeliveryTime: entry.estimatedDeliveryTime,
          riderAvailability: entry.nearbyRiderCount,
          pickupMinutes: entry.pickupMinutes,
          ...(entry.distanceKm !== null ? { distanceKm: entry.distanceKm } : {}),
        };
      });
    res.status(200).json(formattedRestaurants);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};
exports.getAllRestaurantsForAdmin = async (req, res) => {
  try {
    const { page, limit, skip } = getPaginationParams(req, 50);
    const search = req.query.search || "";
    const query = {};
    if (search) {
      query.$or = [
        { "name.en": { $regex: search, $options: "i" } },
        { name: { $regex: search, $options: "i" } },
        { email: { $regex: search, $options: "i" } },
        { city: { $regex: search, $options: "i" } },
      ];
    }
    const total = await Restaurant.countDocuments({
      ...query,
      owner: { $ne: null },
    });
    const restaurants = await Restaurant.find({
      ...query,
      owner: { $ne: null },
    })
      .populate("owner", "email mobile")
      .skip(skip)
      .limit(limit)
      .sort({ createdAt: -1 }); // Newest first
    const formattedData = restaurants.map((rest) => {
      const isAccepting = rest.restaurantApproved && rest.isActive;
      return {
        _id: rest._id,
        name: rest.name.en || rest.name,
        email: rest.email,
        address: `${rest.address}, ${rest.city}`,
        contact: rest.contactNumber,
        rating: normalizeRatingOutput(rest.rating),
        status: rest.isActive ? "Active" : "Inactive",
        openStatus: isAccepting ? "Accepting Orders" : "Not Accepting Orders",
        createdOn: new Date(rest.createdAt).toLocaleString("en-IN", {
          day: "numeric",
          month: "long",
          year: "numeric",
          hour: "numeric",
          minute: "numeric",
          hour12: true,
        }),
        ownerId: rest.owner ? rest.owner._id : null,
      };
    });
    res.status(200).json({
      restaurants: formattedData,
      total,
      page,
      limit,
      pages: Math.ceil(total / limit),
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};
exports.getAllApprovedRestaurantsForAdmin = async (req, res) => {
  try {
    const { page, limit, skip } = getPaginationParams(req, 50);
    const search = req.query.search || "";
    const query = {};
    if (search) {
      query.$or = [
        { "name.en": { $regex: search, $options: "i" } },
        { name: { $regex: search, $options: "i" } },
        { email: { $regex: search, $options: "i" } },
        { city: { $regex: search, $options: "i" } },
      ];
    }
    const total = await Restaurant.countDocuments({
      ...query,
      owner: { $ne: null },
      restaurantApproved: true,
      isActive: true,
    });
    const restaurants = await Restaurant.find({
      ...query,
      owner: { $ne: null },
      restaurantApproved: true,
      isActive: true,
    })
      .populate("owner", "email mobile")
      .skip(skip)
      .limit(limit)
      .sort({ createdAt: -1 }); // Newest first
    const formattedData = restaurants.map((rest) => {
      const isAccepting = rest.restaurantApproved && rest.isActive;
      return {
        _id: rest._id,
        name: rest.name.en || rest.name,
        email: rest.email,
        address: `${rest.address}, ${rest.city}`,
        contact: rest.contactNumber,
        rating: normalizeRatingOutput(rest.rating),
        status: rest.isActive ? "Active" : "Inactive",
        openStatus: isAccepting ? "Accepting Orders" : "Not Accepting Orders",
        createdOn: new Date(rest.createdAt).toLocaleString("en-IN", {
          day: "numeric",
          month: "long",
          year: "numeric",
          hour: "numeric",
          minute: "numeric",
          hour12: true,
        }),
        ownerId: rest.owner ? rest.owner._id : null,
      };
    });
    res.status(200).json({
      restaurants: formattedData,
      total,
      page,
      limit,
      pages: Math.ceil(total / limit),
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};
exports.getAllRestaurantsNameForAdmin = async (req, res) => {
  try {
    const restaurants = await Restaurant.find({ owner: { $ne: null } })
      .populate("owner", "email mobile")
      .select("name")
      .sort({ createdAt: -1 });
    const formattedData = restaurants.map((rest) => {
      return {
        _id: rest._id,
        name: rest.name.en || rest.name,
        createdOn: new Date(rest.createdAt).toLocaleString("en-IN", {
          day: "numeric",
          month: "long",
          year: "numeric",
          hour: "numeric",
          minute: "numeric",
          hour12: true,
        }),
        ownerId: rest.owner ? rest.owner._id : null,
      };
    });
    res.status(200).json(formattedData);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};
exports.deleteRestaurant = async (req, res) => {
  try {
    const restaurant = await Restaurant.findById(req.params.id);
    if (!restaurant) {
      return res.status(404).json({ message: "Restaurant not found" });
    }
    await restaurant.deleteOne();
    res.status(200).json({ message: "Restaurant deleted successfully" });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};
exports.getActiveRestaurantsForAdmin = async (req, res) => {
  try {
    const restaurants = await Restaurant.find({
      isActive: true,
      owner: { $ne: null },
    })
      .populate("owner", "email mobile")
      .sort({ createdAt: -1 });
    const formattedData = restaurants.map((rest) => {
      const isAccepting = rest.restaurantApproved && rest.isActive;
      return {
        _id: rest._id,
        name: rest.name.en || rest.name,
        email: rest.email,
        address: `${rest.address}, ${rest.city}`,
        contact: rest.contactNumber,
        rating: normalizeRatingOutput(rest.rating),
        status: "Active", // We know it's active because of the query
        openStatus: isAccepting ? "Accepting Orders" : "Not Accepting Orders",
        createdOn: new Date(rest.createdAt).toLocaleString("en-IN", {
          day: "numeric",
          month: "long",
          year: "numeric",
          hour: "numeric",
          minute: "numeric",
          hour12: true,
        }),
        ownerId: rest.owner ? rest.owner._id : null,
      };
    });
    res.status(200).json(formattedData);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};
exports.toggleFavorite = async (req, res) => {
  try {
    const user = await User.findById(req.user._id);
    const restId = req.params.id;
    if (!user.favoriteRestaurants) {
      user.favoriteRestaurants = [];
    }
    const index = user.favoriteRestaurants.indexOf(restId);
    if (index === -1) {
      user.favoriteRestaurants.push(restId);
      await user.save();
      return res.json({ message: "Added to favorites", isFavorite: true });
    } else {
      user.favoriteRestaurants.splice(index, 1);
      await user.save();
      return res.json({ message: "Removed from favorites", isFavorite: false });
    }
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};
exports.getRestaurantProductById = async (req, res) => {
  try {
    const restaurant = await Restaurant.findById(req.params.id).populate(
      "product",
    );
    if (!restaurant) {
      return res.status(404).json({ message: "Restaurant not found" });
    }
    if (!restaurant.menuApproved) {
      return res.status(403).json({
        message: "Restaurant menu is not yet available",
        status: "pending_approval"
      });
    }
    res.json(restaurant);
  } catch (error) {
    res.status(500).json({ message: "Server error", error });
  }
};

// Admin endpoint to get all frozen restaurants
exports.getFrozenRestaurants = async (req, res) => {
  try {
    // Verify admin authentication
    const user = await User.findById(req.user._id);
    if (!user || user.role !== "admin") {
      return res.status(403).json({ message: "Unauthorized: Admin access required" });
    }

    const { page = 1, limit = 20, search = "" } = req.query;
    const skip = (parseInt(page) - 1) * parseInt(limit);

    // Build query for frozen restaurants
    const query = {
      isActive: false,
      frozenReason: { $exists: true, $ne: null }
    };

    // Add search filter if provided
    if (search && search.trim()) {
      query.$or = [
        { "name.en": new RegExp(search, "i") },
        { email: new RegExp(search, "i") },
        { contactNumber: new RegExp(search, "i") }
      ];
    }

    // Get total count
    const total = await Restaurant.countDocuments(query);

    // Get frozen restaurants with pagination
    const frozenRestaurants = await Restaurant.find(query)
      .populate("owner", "name email")
      .select("name owner email contactNumber documents frozenReason frozenDate frozenBy isActive")
      .sort({ frozenDate: -1 })
      .skip(skip)
      .limit(parseInt(limit))
      .lean();

    // Format response
    const formattedData = frozenRestaurants.map(restaurant => ({
      _id: restaurant._id,
      name: restaurant.name,
      email: restaurant.email,
      contactNumber: restaurant.contactNumber,
      owner: restaurant.owner,
      frozenReason: restaurant.frozenReason,
      frozenDate: restaurant.frozenDate,
      frozenBy: restaurant.frozenBy,
      licenceExpiry: restaurant.documents?.license?.expiry || null
    }));

    res.status(200).json({
      data: formattedData,
      pagination: {
        current: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / parseInt(limit))
      }
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Admin endpoint to unfreeze/reactivate a frozen restaurant
exports.unfreezeRestaurant = async (req, res) => {
  try {
    // Verify admin authentication
    const user = await User.findById(req.user._id);
    if (!user || user.role !== "admin") {
      return res.status(403).json({ message: "Unauthorized: Admin access required" });
    }

    const restaurantId = req.params.id;
    const { reason = "Admin verification" } = req.body;

    // Find restaurant
    const restaurant = await Restaurant.findById(restaurantId);
    if (!restaurant) {
      return res.status(404).json({ message: "Restaurant not found" });
    }

    // Check if restaurant is actually frozen
    if (restaurant.isActive === true && !restaurant.frozenReason) {
      return res.status(400).json({ message: "Restaurant is not frozen" });
    }

    // Check if new license is valid (if frozen due to licence expiry)
    if (restaurant.frozenReason && /licen[cs]e/i.test(restaurant.frozenReason)) {
      const licenceExpiry = restaurant.documents?.license?.expiry;
      if (!licenceExpiry) {
        return res.status(400).json({ 
          message: "Cannot unfreeze: No valid licence found. Please upload a new licence document." 
        });
      }

      const today = new Date();
      today.setHours(0, 0, 0, 0);
      
      if (licenceExpiry <= today) {
        return res.status(400).json({ 
          message: "Cannot unfreeze: Licence is still expired or expiring today. Please upload a valid licence." 
        });
      }
    }

    // Unfreeze restaurant
    restaurant.isActive = true;
    restaurant.frozenReason = null;
    restaurant.frozenDate = null;
    restaurant.frozenBy = null;
    restaurant.unfreezedBy = user._id;
    restaurant.unfreezedDate = new Date();
    restaurant.unfreezeReason = reason;

    await restaurant.save();

    // Emit socket notification to notify restaurant owner (if needed)
    const socketService = require("../services/socketService");
    if (socketService && socketService.emitToAdmin) {
      socketService.emitToAdmin("restaurant:unfrozen", {
        restaurantId: restaurant._id.toString(),
        restaurantName: restaurant.name,
        unfrozenBy: user.name || user.email,
        unfreezeReason: reason,
        timestamp: new Date()
      });
    }

    res.status(200).json({
      message: "Restaurant unfrozen successfully",
      restaurant: {
        _id: restaurant._id,
        name: restaurant.name,
        email: restaurant.email,
        isActive: restaurant.isActive,
        unfreezedDate: restaurant.unfreezedDate
      }
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Admin endpoint to update/renew restaurant food licence (FSSAI)
exports.updateRestaurantLicence = async (req, res) => {
  try {
    // Verify admin authentication
    const user = await User.findById(req.user._id);
    if (!user || user.role !== "admin") {
      return res.status(403).json({ message: "Unauthorized: Admin access required" });
    }

    const restaurantId = req.params.id;
    const { licenceNumber, licenceExpiry, licenceUrl, backUrl } = req.body;

    // Validate required fields
    if (!licenceNumber || !licenceExpiry) {
      return res.status(400).json({ 
        message: "Licence number and expiry date are required" 
      });
    }

    // Validate expiry date
    const expiryDate = new Date(licenceExpiry);
    if (isNaN(expiryDate.getTime())) {
      return res.status(400).json({ message: "Invalid expiry date format" });
    }

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    if (expiryDate <= today) {
      return res.status(400).json({ 
        message: "Licence expiry date must be in the future" 
      });
    }

    // Find restaurant
    const restaurant = await Restaurant.findById(restaurantId);
    if (!restaurant) {
      return res.status(404).json({ message: "Restaurant not found" });
    }

    // Handle file upload if provided
    let finalLicenceUrl = licenceUrl;
    let finalBackUrl = backUrl;
    
    if (req.files) {
      if (req.files.licenceImage && req.files.licenceImage[0]) {
        finalLicenceUrl = getFileUrl(req.files.licenceImage[0]);
      }
      if (req.files.licenceBackImage && req.files.licenceBackImage[0]) {
        finalBackUrl = getFileUrl(req.files.licenceBackImage[0]);
      }
    }

    // Update restaurant licence details
    restaurant.documents = restaurant.documents || {};
    restaurant.documents.license = {
      number: licenceNumber,
      expiry: expiryDate,
      url: finalLicenceUrl || restaurant.documents.license?.url || "",
      backUrl: finalBackUrl || restaurant.documents.license?.backUrl || ""
    };

    // If restaurant was frozen due to expired licence, unfreeze it
    const wasFrozen = restaurant.frozenReason && /licen[cs]e/i.test(restaurant.frozenReason);
    if (wasFrozen) {
      restaurant.isActive = true;
      restaurant.frozenReason = null;
      restaurant.frozenDate = null;
      restaurant.frozenBy = null;
      restaurant.unfreezedBy = user._id;
      restaurant.unfreezedDate = new Date();
      restaurant.unfreezeReason = `Food licence renewed - New expiry: ${expiryDate.toLocaleDateString()}`;
    }

    await restaurant.save();

    // Emit socket notification
    const socketService = require("../services/socketService");
    if (socketService && socketService.emitToAdmin) {
      socketService.emitToAdmin("restaurant:licence_updated", {
        restaurantId: restaurant._id.toString(),
        restaurantName: restaurant.name,
        licenceNumber,
        licenceExpiry: expiryDate,
        updatedBy: user.name || user.email,
        wasUnfrozen: wasFrozen,
        timestamp: new Date()
      });
    }

    res.status(200).json({
      message: wasFrozen 
        ? "Licence updated and restaurant unfrozen successfully" 
        : "Licence updated successfully",
      restaurant: {
        _id: restaurant._id,
        name: restaurant.name,
        email: restaurant.email,
        isActive: restaurant.isActive,
        licence: restaurant.documents.license
      }
    });
  } catch (error) {
    console.error('Update licence error:', error.message);
    res.status(500).json({ message: error.message });
  }
};
