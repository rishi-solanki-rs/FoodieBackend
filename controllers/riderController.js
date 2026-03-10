const mongoose = require('mongoose');
const Rider = require('../models/Rider');
const User = require('../models/User');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const { sendNotification } = require('../utils/notificationService');
const socketService = require('../services/socketService');
const SupportTicket = require('../models/SupportTicket');
const Order = require('../models/Order');
const Restaurant = require('../models/Restaurant');
const { getPaginationParams } = require('../utils/pagination');
const { getFileUrl } = require('../utils/upload');
const { calculateDistance } = require('../utils/locationUtils');
const { initiateProfileUpdate, verifyOTPAndApplyUpdate, checkDuplicate } = require('../utils/profileUpdateHelpers');
const { sendOTP } = require('../services/smsService');
const logger = console;
const sendError = (res, status, message, details) => {
  return res.status(status).json({
    success: false,
    message,
    ...(details ? { details } : {}),
  });
};
const isValidObjectId = (id) => mongoose.Types.ObjectId.isValid(id);

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

const deepMergeObjects = (target = {}, source = {}) => {
  const output = { ...(target || {}) };
  if (!isPlainObject(source)) return output;

  Object.keys(source).forEach((key) => {
    const sourceValue = source[key];
    const targetValue = output[key];

    if (isPlainObject(sourceValue) && isPlainObject(targetValue)) {
      output[key] = deepMergeObjects(targetValue, sourceValue);
    } else {
      output[key] = sourceValue;
    }
  });

  return output;
};

const extractBracketObject = (body = {}, rootKey) => {
  const result = {};
  const prefix = `${rootKey}[`;

  Object.entries(body || {}).forEach(([key, rawValue]) => {
    if (!key.startsWith(prefix)) return;

    const segments = [];
    const regex = /\[([^\]]+)\]/g;
    let match;
    while ((match = regex.exec(key)) !== null) {
      segments.push(match[1]);
    }
    if (!segments.length) return;

    let cursor = result;
    for (let i = 0; i < segments.length - 1; i += 1) {
      const seg = segments[i];
      if (!isPlainObject(cursor[seg])) cursor[seg] = {};
      cursor = cursor[seg];
    }

    const leafKey = segments[segments.length - 1];
    const parsedValue = parseIfString(rawValue);
    cursor[leafKey] = parsedValue;
  });

  return result;
};

const getAverageRating = (rating) => {
  if (typeof rating === "number") return rating;
  if (rating && typeof rating === "object" && typeof rating.average === "number") {
    return rating.average;
  }
  return 0;
};
const getRatingCount = (rating) => {
  if (rating && typeof rating === "object" && typeof rating.count === "number") {
    return rating.count;
  }
  return 0;
};
const generateRiderToken = (res, user) => {
  const token = jwt.sign(
    { _id: user._id, role: user.role },
    process.env.JWT_SECRET,
    { expiresIn: "7d" }
  );
  const options = {
    expires: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
  };
  res.cookie("token", token, options);
};
exports.updateRiderProfile = async (req, res) => {
  try {
    let { name, email, mobile, address, workCity, workZone, language, fcmToken } = req.body;

    if (!req.user || !isValidObjectId(req.user._id)) {
      return sendError(res, 401, "Unauthorized rider");
    }
    const user = await User.findById(req.user._id);
    if (!user || user.role !== "rider") {
      return sendError(res, 404, "Rider user not found");
    }

    const rider = await Rider.findOne({ user: req.user._id });
    if (!rider) {
      return sendError(res, 404, "Rider profile not found");
    }

    if (!user.name && (!name || !name.trim())) {
      return sendError(res, 400, "Name is required");
    }
    if (typeof name === "string" && name.trim()) {
      user.name = name.trim();
    }

    if (email !== undefined || mobile !== undefined) {
      return sendError(res, 400, "Email/Mobile updates require OTP verification. Use /profile/request-update endpoint");
    }

    if (req.file) {
      user.profilePic = getFileUrl(req.file);
    }

    if (language !== undefined) {
      user.language = language;
    }
    if (fcmToken !== undefined) {
      user.fcmToken = fcmToken;
    }

    if (address !== undefined) {
      if (typeof address === 'string') {
        try {
          address = JSON.parse(address);
        } catch (e) {
          return sendError(res, 400, "Invalid address format");
        }
      }
      rider.address = { ...(rider.address || {}), ...address };
    }
    if (workCity !== undefined) rider.workCity = workCity;
    if (workZone !== undefined) rider.workZone = workZone;

    await user.save();
    await rider.save();

    res.status(200).json({
      success: true,
      message: "Profile updated successfully",
      user: {
        _id: user._id,
        name: user.name,
        email: user.email,
        mobile: user.mobile,
        profilePic: user.profilePic,
        language: user.language
      },
      rider: {
        _id: rider._id,
        address: rider.address,
        workCity: rider.workCity,
        workZone: rider.workZone,
        verificationStatus: rider.verificationStatus
      }
    });
  } catch (e) {
    return sendError(res, 500, "Failed to update rider profile", e.message);
  }
};
exports.requestRiderProfileUpdate = async (req, res) => {
  try {
    const { email, mobile } = req.body;
    if (!email && !mobile) {
      return sendError(res, 400, "Provide email or mobile to update");
    }
    if (!req.user || !isValidObjectId(req.user._id)) {
      return sendError(res, 401, "Unauthorized rider");
    }
    const user = await User.findById(req.user._id);
    if (!user || user.role !== "rider") {
      return sendError(res, 404, "Rider user not found");
    }
    const rider = await Rider.findOne({ user: req.user._id });
    if (!rider) {
      return sendError(res, 404, "Rider profile not found");
    }
    if (email && (!email.includes("@") || email.length < 5)) {
      return sendError(res, 400, "Invalid email format");
    }
    if (mobile && mobile.length < 10) {
      return sendError(res, 400, "Invalid mobile number");
    }
    if (email) {
      const isDuplicate = await checkDuplicate(User, 'email', email, user._id);
      if (isDuplicate) {
        return sendError(res, 409, "Email already in use");
      }
    }
    if (mobile) {
      const isDuplicate = await checkDuplicate(User, 'mobile', mobile, user._id);
      if (isDuplicate) {
        return sendError(res, 409, "Mobile number already in use");
      }
    }
    const result = await initiateProfileUpdate(rider, { email, mobile });
    res.status(200).json({
      success: true,
      message: result.message,
      testOtp: result.testOtp, // Remove in production
      expiresIn: result.expiresIn,
      destination: result.destination
    });
  } catch (e) {
    return sendError(res, 500, "Failed to request profile update", e.message);
  }
};
exports.verifyRiderProfileUpdate = async (req, res) => {
  try {
    const { otp } = req.body;
    if (!otp || otp.length !== 6) {
      return sendError(res, 400, "Valid 6-digit OTP is required");
    }
    if (!req.user || !isValidObjectId(req.user._id)) {
      return sendError(res, 401, "Unauthorized rider");
    }
    const user = await User.findById(req.user._id);
    if (!user || user.role !== "rider") {
      return sendError(res, 404, "Rider user not found");
    }
    const rider = await Rider.findOne({ user: req.user._id });
    if (!rider) {
      return sendError(res, 404, "Rider profile not found");
    }
    const result = await verifyOTPAndApplyUpdate(rider, otp, user);
    if (!result.success) {
      return sendError(res, 400, result.message);
    }
    res.status(200).json({
      success: true,
      message: result.message,
      appliedUpdates: result.appliedUpdates,
      user: {
        _id: user._id,
        name: user.name,
        email: user.email,
        mobile: user.mobile
      }
    });
  } catch (e) {
    return sendError(res, 500, "Failed to verify OTP", e.message);
  }
};
exports.getRiderProfile = async (req, res) => {
  try {
    if (!req.user || !isValidObjectId(req.user._id)) {
      return sendError(res, 401, "Unauthorized rider");
    }
    const user = await User.findById(req.user._id);
    if (!user || user.role !== "rider") {
      return sendError(res, 404, "Rider user not found");
    }
    const riderProfile = await Rider.findOne({ user: req.user._id });
    if (!riderProfile) {
      return res.status(200).json({
        success: true,
        onboardingRequired: true,
        message: "Please complete your rider profile to start delivering",
        user: {
          _id: user._id,
          name: user.name,
          email: user.email,
          mobile: user.mobile,
          profilePic: user.profilePic,
          role: user.role,
          walletBalance: user.walletBalance || 0
        }
      });
    }
    const orders = await Order.find({ rider: riderProfile._id });
    const totalOrders = orders.length;
    const deliveredOrders = orders.filter(o => o.status === 'delivered').length;
    const cancelledOrders = orders.filter(o => o.status === 'cancelled').length;
    const totalEarnings = orders.reduce((sum, o) => {
      if (typeof o.riderEarning === "number") return sum + o.riderEarning;
      return sum + (o.riderCommission || 0) + (o.tip || 0);
    }, 0);
    res.status(200).json({
      success: true,
      message: "Rider profile retrieved successfully",
      user: {
        _id: user._id,
        name: user.name,
        email: user.email,
        mobile: user.mobile,
        profilePic: user.profilePic,
        role: user.role,
        walletBalance: user.walletBalance || 0
      },
      rider: {
        _id: riderProfile._id,
        address: riderProfile.address,
        workCity: riderProfile.workCity,
        workZone: riderProfile.workZone,
        rating: getAverageRating(riderProfile.rating),
        ratingCount: getRatingCount(riderProfile.rating),
        isAvailable: riderProfile.isAvailable,
        isOnline: riderProfile.isOnline,
        verificationStatus: riderProfile.verificationStatus,
        riderVerified: riderProfile.riderVerified,
        totalOrders: totalOrders,
        deliveredOrders: deliveredOrders,
        cancelledOrders: cancelledOrders,
        totalEarnings: parseFloat(totalEarnings.toFixed(2)),
        totalDeliveries: riderProfile.totalDeliveries || deliveredOrders,
        currentBalance: riderProfile.currentBalance || 0,
        vehicle: riderProfile.vehicle,
        documents: riderProfile.documents,
        bankDetails: riderProfile.bankDetails
      }
    });
  } catch (e) {
    return sendError(res, 500, "Failed to fetch rider profile", e.message);
  }
};
exports.getRiderDashboard = async (req, res) => {
  try {
    if (!req.user || !isValidObjectId(req.user._id)) {
      return sendError(res, 401, "Unauthorized rider");
    }
    const user = await User.findById(req.user._id);
    if (!user || user.role !== "rider") {
      return sendError(res, 404, "Rider user not found");
    }
    const riderProfile = await Rider.findOne({ user: req.user._id });
    if (!riderProfile) {
      return res.status(200).json({
        success: true,
        onboardingRequired: true,
        message: "Please complete your rider profile to start delivering",
      });
    }
    const RiderWallet = require('../models/RiderWallet');
    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);
    const activeStatuses = ["assigned", "reached_restaurant", "picked_up", "delivery_arrived"];
    const [
      totalOrders,
      deliveredOrders,
      todayDelivered,
      activeOrders,
      earningsAgg,
      todayEarningsAgg,
      lastActiveOrder,
      riderWallet,
    ] = await Promise.all([
      Order.countDocuments({ rider: riderProfile._id }),
      Order.countDocuments({ rider: riderProfile._id, status: "delivered" }),
      Order.countDocuments({
        rider: riderProfile._id,
        status: "delivered",
        deliveredAt: { $gte: startOfDay },
      }),
      Order.countDocuments({
        rider: riderProfile._id,
        status: { $in: activeStatuses },
      }),
      Order.aggregate([
        { $match: { rider: riderProfile._id, status: "delivered" } },
        { $group: { _id: null, earnings: { $sum: "$riderEarning" } } },
      ]),
      Order.aggregate([
        {
          $match: {
            rider: riderProfile._id,
            status: "delivered",
            deliveredAt: { $gte: startOfDay },
          },
        },
        { $group: { _id: null, earnings: { $sum: "$riderEarning" } } },
      ]),
      Order.findOne({ rider: riderProfile._id, status: { $in: activeStatuses } })
        .select('_id status deliveryAddress.addressLine restaurant deliveryFee tip riderEarning totalAmount paymentMethod')
        .populate("customer", "name mobile")
        .populate("restaurant", "name address location contactNumber")
        .sort({ updatedAt: -1, createdAt: -1 }),
      RiderWallet.findOne({ rider: riderProfile._id }),
    ]);
    const totalEarnings = earningsAgg[0]?.earnings || 0;
    const todayEarnings = todayEarningsAgg[0]?.earnings || 0;
    return res.status(200).json({
      success: true,
      rider: {
        _id: riderProfile._id,
        isOnline: riderProfile.isOnline,
        isAvailable: riderProfile.isAvailable,
        breakMode: riderProfile.breakMode,
        verificationStatus: riderProfile.verificationStatus,
      },
      stats: {
        totalOrders,
        deliveredOrders,
        todayDelivered,
        activeOrders,
        totalEarnings: Number(totalEarnings.toFixed(2)),
        todayEarnings: Number(todayEarnings.toFixed(2)),
        currentBalance: riderProfile.currentBalance || 0,
      },
      wallet: riderWallet ? {
        availableBalance: Number((riderWallet.availableBalance || 0).toFixed(2)),
        totalEarnings: Number((riderWallet.totalEarnings || 0).toFixed(2)),
        cashInHand: Number((riderWallet.cashInHand || 0).toFixed(2)),
        cashLimit: riderWallet.cashLimit || 2000,
        isFrozen: riderWallet.isFrozen || false,
        frozenReason: riderWallet.frozenReason || null,
        lastPayoutAt: riderWallet.lastPayoutAt || null,
        lastPayoutAmount: riderWallet.lastPayoutAmount || 0,
        totalPayouts: riderWallet.totalPayouts || 0,
      } : null,
      lastActiveOrder: lastActiveOrder || null,
    });
  } catch (error) {
    return sendError(res, 500, "Failed to fetch rider dashboard", error.message);
  }
};
exports.getCompletedOrdersForRider = async (req, res) => {
  try {
    if (!req.user || !isValidObjectId(req.user._id)) {
      return sendError(res, 401, "Unauthorized rider");
    }
    const riderProfile = await Rider.findOne({ user: req.user._id });
    if (!riderProfile) {
      return sendError(res, 404, "Rider profile not found");
    }
    const { page, limit, skip } = getPaginationParams(req, 20);
    const query = { rider: riderProfile._id, status: "delivered" };
    const [orders, total] = await Promise.all([
      Order.find(query)
        .populate("restaurant", "name image bannerImage address")
        .populate("customer", "name mobile")
        .sort({ deliveredAt: -1, createdAt: -1 })
        .skip(skip)
        .limit(limit),
      Order.countDocuments(query),
    ]);
    return res.status(200).json({
      success: true,
      orders,
      pagination: {
        total,
        page,
        limit,
        pages: Math.ceil(total / limit),
        hasNext: page < Math.ceil(total / limit),
        hasPrev: page > 1,
      },
    });
  } catch (error) {
    return sendError(res, 500, "Failed to fetch completed orders", error.message);
  }
};
exports.onboardRider = async (req, res) => {
  try {
    let {
      name,
      email,
      address,
      workCity,
      workZone,
      vehicle,
      documents,
      bankDetails,
      location
    } = req.body;
    address = parseIfString(address);
    vehicle = parseIfString(vehicle);
    documents = parseIfString(documents);
    bankDetails = parseIfString(bankDetails);
    location = parseIfString(location);

    if (address !== undefined && !isPlainObject(address)) {
      return sendError(res, 400, "Invalid address format");
    }
    if (vehicle !== undefined && !isPlainObject(vehicle)) {
      return sendError(res, 400, "Invalid vehicle format");
    }
    if (documents !== undefined && !isPlainObject(documents)) {
      return sendError(res, 400, "Invalid documents format");
    }
    if (bankDetails !== undefined && !isPlainObject(bankDetails)) {
      return sendError(res, 400, "Invalid bankDetails format");
    }
    if (location !== undefined && !isPlainObject(location)) {
      return sendError(res, 400, "Invalid location format");
    }
    const user = await User.findById(req.user._id);
    if (!user || user.role !== "rider") {
      return sendError(res, 401, "Unauthorized");
    }
    const existing = await Rider.findOne({ user: user._id });
    let reuseRejected = false;
    if (existing) {
      const isRejected =
        existing.verificationStatus === "rejected" ||
        Boolean(existing.rejectionReason);
      if (!isRejected) {
        return sendError(res, 400, "Rider application already submitted");
      }
      reuseRejected = true;
    }
    if (!user.name && (!name || !name.trim())) {
      return sendError(res, 400, "Name is required");
    }
    const normalizedEmail = email ? email.trim().toLowerCase() : "";
    if (!user.email && !normalizedEmail) {
      return sendError(res, 400, "Email is required");
    }
    if (user.email && normalizedEmail && normalizedEmail !== user.email) {
      return sendError(res, 400, "Email must match registered email");
    }
    if (name) user.name = name.trim();
    if (!user.email && normalizedEmail) {
      const exists = await User.findOne({
        _id: { $ne: user._id },
        email: normalizedEmail,
      });
      if (exists) {
        return sendError(res, 409, "Email already in use");
      }
      user.email = normalizedEmail;
    }
    await user.save();
    if (vehicle && vehicle.type && typeof vehicle.type === "string") {
      const VehicleModel = require("../models/Vehicle");
      const found = await VehicleModel.findOne({
        $or: [{ name: vehicle.type }, { type: vehicle.type }]
      });
      if (found) vehicle.type = found.type || found.name || vehicle.type;
    }
    if (reuseRejected) {
      if (!address) address = existing.address;
      if (!workCity) workCity = existing.workCity;
      if (!workZone) workZone = existing.workZone;
      if (!vehicle) vehicle = existing.vehicle;
      if (!bankDetails) bankDetails = existing.bankDetails;
      if (!location) location = existing.currentLocation;
    }
    const processedDocuments = {
      ...(reuseRejected ? existing.documents || {} : {}),
      ...(documents || {}),
    };
    if (req.files) {
      if (req.files.licenseFrontImage && req.files.licenseFrontImage[0]) {
        processedDocuments.license = processedDocuments.license || {};
        processedDocuments.license.frontImage = getFileUrl(req.files.licenseFrontImage[0]);
      }
      if (req.files.licenseBackImage && req.files.licenseBackImage[0]) {
        processedDocuments.license = processedDocuments.license || {};
        processedDocuments.license.backImage = getFileUrl(req.files.licenseBackImage[0]);
      }
      if (req.files.rcImage && req.files.rcImage[0]) {
        processedDocuments.rc = processedDocuments.rc || {};
        processedDocuments.rc.image = getFileUrl(req.files.rcImage[0]);
      }
      if (req.files.insuranceImage && req.files.insuranceImage[0]) {
        processedDocuments.insurance = processedDocuments.insurance || {};
        processedDocuments.insurance.image = getFileUrl(req.files.insuranceImage[0]);
      }
      if (req.files.medicalCertificate && req.files.medicalCertificate[0]) {
        processedDocuments.medicalCertificate = processedDocuments.medicalCertificate || {};
        processedDocuments.medicalCertificate.image = getFileUrl(req.files.medicalCertificate[0]);
      }
      if (req.files.panCardImage && req.files.panCardImage[0]) {
        processedDocuments.panCard = processedDocuments.panCard || {};
        processedDocuments.panCard.image = getFileUrl(req.files.panCardImage[0]);
      }
      if (req.files.aadharCardImage && req.files.aadharCardImage[0]) {
        processedDocuments.aadharCard = processedDocuments.aadharCard || {};
        processedDocuments.aadharCard.image = getFileUrl(req.files.aadharCardImage[0]);
      }
      if (req.files.policyVerification && req.files.policyVerification[0]) {
        processedDocuments.policyVerification = processedDocuments.policyVerification || {};
        processedDocuments.policyVerification.image = getFileUrl(req.files.policyVerification[0]);
      }
    }
    const permanentAddress = parseIfString(req.body.permanentAddress) || {};
    const localAddress = parseIfString(req.body.localAddress) || {};
    const emergencyContactNumber = req.body.emergencyContactNumber || "";
    const riderPayload = {
      user: user._id,
      address,
      workCity,
      workZone,
      vehicle,
      documents: processedDocuments,
      bankDetails,
      permanentAddress,
      localAddress,
      emergencyContactNumber,
      currentLocation: location || undefined,
      verificationStatus: "pending",
      riderVerified: false,
      rejectionReason: undefined,
      rejectionDate: undefined,
      rejectedBy: undefined,
    };
    const rider = reuseRejected
      ? await Rider.findByIdAndUpdate(existing._id, riderPayload, {
        new: true,
        runValidators: true,
      })
      : await Rider.create(riderPayload);
    res.status(201).json({
      success: true,
      message: "Rider onboarding submitted. Waiting for admin approval.",
      rider
    });
  } catch (error) {
    return sendError(res, 500, "Failed to submit rider onboarding", error.message);
  }
};
exports.toggleStatus = async (req, res) => {
  try {
    const { available } = req.body;
    console.log('🔄 Toggle Status Request:', { userId: req.user._id, available });
    const rider = await Rider.findOne({ user: req.user._id }).populate('user', 'name email');
    if (!rider) {
      console.error('❌ Rider not found for user:', req.user._id);
      return res.status(404).json({
        success: false,
        message: "Rider profile not found"
      });
    }
    const newStatus = typeof available === 'boolean' ? available : !rider.isAvailable;
    console.log('📊 Status Update:', { current: rider.isAvailable, new: newStatus });
    if (newStatus === true) {
      if (!rider.riderVerified) {
        console.warn('⚠️ Rider not verified:', rider._id);
        return res.status(403).json({
          success: false,
          message: "You must complete your rider verification first",
          verificationStatus: rider.verificationStatus,
          reason: 'Rider not verified'
        });
      }
      if (rider.verificationStatus !== 'approved') {
        console.warn('⚠️ Verification status not approved:', rider.verificationStatus);
        return res.status(403).json({
          success: false,
          message: rider.verificationStatus === 'pending'
            ? "Your verification is still pending approval. Please wait for admin approval."
            : rider.verificationStatus === 'rejected'
              ? "Your verification was rejected. Please contact support."
              : "Your account verification is restricted. Please contact support.",
          verificationStatus: rider.verificationStatus
        });
      }
      if (rider.vehicle && !rider.vehicle.vehicleVerified) {
        console.warn('⚠️ Vehicle not verified:', rider.vehicle.number);
        return res.status(403).json({
          success: false,
          message: "Your vehicle is not verified. Please complete vehicle verification first.",
          vehicleVerified: false
        });
      }
    }
    const updateData = {
      isAvailable: newStatus,
      isOnline: newStatus === true ? true : false
    };
    if (newStatus === true) {
      updateData.breakMode = false;
    }
    const updatedRider = await Rider.findByIdAndUpdate(
      rider._id,
      { $set: updateData },
      { new: true, runValidators: false } // Skip validators to avoid rating field issues
    );
    console.log('✅ Status updated successfully:', {
      riderId: updatedRider._id,
      isAvailable: updatedRider.isAvailable,
      isOnline: updatedRider.isOnline
    });
    try {
      socketService.emitToRider(req.user._id.toString(), 'rider:status_changed', {
        isAvailable: updatedRider.isAvailable,
        isOnline: updatedRider.isOnline,
        message: updatedRider.isAvailable
          ? 'You are now available to receive orders. Location tracking will start automatically.'
          : 'You are now offline. Location tracking has stopped.',
        requireLocationTracking: updatedRider.isOnline,
        timestamp: new Date()
      });
      socketService.emitToAdmin('rider:status_update', {
        riderId: req.user._id.toString(),
        riderName: rider.user?.name || 'Unknown',
        riderEmail: rider.user?.email || 'Unknown',
        status: updatedRider.isAvailable ? 'available' : 'offline',
        timestamp: new Date()
      });
    } catch (socketErr) {
      console.warn('⚠️ Socket notification failed:', socketErr.message);
    }
    res.json({
      success: true,
      message: `You are now ${updatedRider.isAvailable ? 'available to receive orders' : 'offline'}`,
      isAvailable: updatedRider.isAvailable,
      isOnline: updatedRider.isOnline,
      locationTrackingRequired: updatedRider.isOnline,
      instructions: updatedRider.isAvailable
        ? 'You will now receive new delivery orders. Ensure location permissions are enabled.'
        : 'Location tracking has been disabled.'
    });
  } catch (error) {
    console.error('❌ Error in toggleStatus:', error);
    console.error('❌ Error details:', {
      name: error.name,
      message: error.message,
      code: error.code
    });
    res.status(500).json({
      success: false,
      message: 'Failed to update availability status',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};
exports.getRiderStatus = async (req, res) => {
  try {
    const rider = await Rider.findOne({ user: req.user._id })
      .select('isOnline isAvailable breakMode verificationStatus riderVerified vehicle');
    if (!rider) {
      return res.status(404).json({
        success: false,
        message: "Rider not found"
      });
    }
    const hasVehicle = !!rider.vehicle;
    const isVehicleVerified = rider.vehicle?.vehicleVerified || false;
    res.json({
      success: true,
      isOnline: rider.isOnline,
      isAvailable: rider.isAvailable,
      breakMode: rider.breakMode,
      verificationStatus: rider.verificationStatus,
      riderVerified: rider.riderVerified,
      locationTrackingRequired: rider.isOnline,
      diagnostics: {
        hasVehicle,
        isVehicleVerified,
        canGoOnline: rider.riderVerified && rider.verificationStatus === 'approved' && isVehicleVerified,
        reasons: {
          riderNotVerified: !rider.riderVerified,
          statusNotApproved: rider.verificationStatus !== 'approved',
          vehicleNotVerified: hasVehicle && !isVehicleVerified
        }
      }
    });
  } catch (error) {
    console.error('❌ Error in getRiderStatus:', error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};
exports.toggleBreak = async (req, res) => {
  try {
    const { reason } = req.body;
    const rider = await Rider.findOne({ user: req.user._id });
    if (!rider) return res.status(404).json({ message: "Rider not found" });
    rider.breakMode = !rider.breakMode;
    rider.breakReason = reason || rider.breakReason;
    if (rider.breakMode) {
      rider.isAvailable = false;
    } else {
      const canGoAvailable = rider.riderVerified && rider.verificationStatus === 'approved' && (rider.vehicle?.vehicleVerified || false);
      rider.isAvailable = canGoAvailable;
    }
    await rider.save();
    res.json({ message: `Break mode ${rider.breakMode ? 'enabled' : 'disabled'}`, breakMode: rider.breakMode });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};
exports.getEarningsSummary = async (req, res) => {
  try {
    const period = req.query.period || 'day';
    const RiderWallet = require('../models/RiderWallet');
    const riderProfile = await Rider.findOne({ user: req.user._id });
    if (!riderProfile) {
      return sendError(res, 404, "Rider profile not found");
    }
    const match = { rider: riderProfile._id, status: 'delivered' };
    let groupId = null;
    if (period === 'week') groupId = { $isoWeek: '$deliveredAt' };
    else if (period === 'month') groupId = { $dateToString: { format: '%Y-%m', date: '$deliveredAt' } };
    else groupId = { $dateToString: { format: '%Y-%m-%d', date: '$deliveredAt' } };
    const [agg, wallet] = await Promise.all([
      Order.aggregate([
        { $match: match },
        { $group: { _id: groupId, earnings: { $sum: '$riderEarning' }, orders: { $sum: 1 } } },
        { $sort: { _id: -1 } }
      ]),
      RiderWallet.findOne({ rider: riderProfile._id }),
    ]);
    const totals = agg.reduce(
      (acc, cur) => ({ earnings: acc.earnings + (cur.earnings || 0), orders: acc.orders + (cur.orders || 0) }),
      { earnings: 0, orders: 0 }
    );
    res.status(200).json({
      success: true,
      period,
      aggregation: agg,
      totals,
      wallet: wallet ? {
        availableBalance: Number((wallet.availableBalance || 0).toFixed(2)),
        totalEarnings: Number((wallet.totalEarnings || 0).toFixed(2)),
        cashInHand: Number((wallet.cashInHand || 0).toFixed(2)),
        cashLimit: wallet.cashLimit || 2000,
        isFrozen: wallet.isFrozen || false,
        frozenReason: wallet.frozenReason || null,
        lastPayoutAt: wallet.lastPayoutAt || null,
        lastPayoutAmount: wallet.lastPayoutAmount || 0,
      } : null,
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};
exports.getEarningsHistory = async (req, res) => {
  try {
    const riderProfile = await Rider.findOne({ user: req.user._id });
    if (!riderProfile) {
      return sendError(res, 404, "Rider profile not found");
    }
    const orders = await Order.find({ rider: riderProfile._id, status: 'delivered' }).sort({ deliveredAt: -1 });
    res.status(200).json(orders);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};
exports.riderSettlementReport = async (req, res) => {
  try {
    const { from, to, detail = 'summary', format = 'json' } = req.query;
    const Order = require('../models/Order');
    const riderProfile = await Rider.findOne({ user: req.user._id });
    if (!riderProfile) {
      return sendError(res, 404, "Rider profile not found");
    }
    const match = { rider: riderProfile._id, status: 'delivered' };
    if (from) match.deliveredAt = { $gte: new Date(from) };
    if (to) match.deliveredAt = match.deliveredAt ? { ...match.deliveredAt, $lte: new Date(to) } : { $lte: new Date(to) };
    if (detail === 'orders') {
      const orders = await Order.find(match).sort({ deliveredAt: -1 });
      if (format === 'csv') {
        let csv = 'orderId,date,totalAmount,riderEarning,cashCollected,paymentMethod,deliveredAt\n';
        orders.forEach(o => {
          csv += `${o._id},${o.createdAt.toISOString().split('T')[0]},${(o.totalAmount || 0).toFixed(2)},${(o.riderEarning || 0).toFixed(2)},${(o.cashCollected || 0).toFixed(2)},${o.paymentMethod || ''},${o.deliveredAt ? o.deliveredAt.toISOString() : ''}\n`;
        });
        res.header('Content-Type', 'text/csv');
        res.header('Content-Disposition', `attachment; filename="rider-settlements-${from || 'all'}-${to || 'now'}.csv"`);
        return res.send(csv);
      }
      return res.status(200).json({ orders });
    }
    const agg = await Order.aggregate([
      { $match: match },
      { $group: { _id: { $dateToString: { format: '%Y-%m-%d', date: '$deliveredAt' } }, orders: { $sum: 1 }, earnings: { $sum: '$riderEarning' }, cashCollected: { $sum: '$cashCollected' } } },
      { $sort: { _id: -1 } }
    ]);
    if (format === 'csv') {
      let csv = 'date,orders,earnings,cashCollected\n';
      agg.forEach(row => {
        csv += `${row._id},${row.orders},${(row.earnings || 0).toFixed(2)},${(row.cashCollected || 0).toFixed(2)}\n`;
      });
      res.header('Content-Type', 'text/csv');
      res.header('Content-Disposition', `attachment; filename="rider-daily-settlements-${from || 'all'}-${to || 'now'}.csv"`);
      return res.send(csv);
    }
    res.status(200).json({ aggregation: agg });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};
// exports.adminRiderSettlements = async (req, res) => {
//   try {
//     const { from, to, riderId, detail = 'summary', format = 'json' } = req.query;
//     const Order = require('../models/Order');
//     const match = { status: 'delivered' };
//     if (from) match.deliveredAt = { $gte: new Date(from) };
//     if (to) match.deliveredAt = match.deliveredAt ? { ...match.deliveredAt, $lte: new Date(to) } : { $lte: new Date(to) };
//     if (riderId) match.rider = require('mongoose').Types.ObjectId(riderId);
//     if (detail === 'orders') {
//       const orders = await Order.find(match).populate('rider', 'user').populate('rider.user', 'name').sort({ deliveredAt: -1 });
//       if (format === 'csv') {
//         let csv = 'orderId,riderId,riderName,date,totalAmount,riderEarning,cashCollected,deliveredAt\n';
//         orders.forEach(o => {
//           const riderName = o.rider && o.rider.user && o.rider.user.name ? o.rider.user.name : '';
//           csv += `${o._id},${o.rider || ''},${riderName},${o.createdAt.toISOString().split('T')[0]},${(o.totalAmount || 0).toFixed(2)},${(o.riderEarning || 0).toFixed(2)},${(o.cashCollected || 0).toFixed(2)},${o.deliveredAt ? o.deliveredAt.toISOString() : ''}\n`;
//         });
//         res.header('Content-Type', 'text/csv');
//         res.header('Content-Disposition', `attachment; filename="admin-rider-orders-${from || 'all'}-${to || 'now'}.csv"`);
//         return res.send(csv);
//       }
//       return res.status(200).json({ orders });
//     }
//     const agg = await Order.aggregate([
//       { $match: match },
//       { $group: { _id: '$rider', orders: { $sum: 1 }, earnings: { $sum: '$riderEarning' }, cashCollected: { $sum: '$cashCollected' } } },
//       { $sort: { earnings: -1 } }
//     ]);
//     const results = [];
//     for (const r of agg) {
//       const user = await User.findById(r._id).select('name mobile email');
//       results.push({ rider: r._id, name: user ? user.name : '', mobile: user ? user.mobile : '', orders: r.orders, earnings: r.earnings || 0, cashCollected: r.cashCollected || 0 });
//     }
//     if (format === 'csv') {
//       let csv = 'riderId,name,mobile,orders,earnings,cashCollected\n';
//       results.forEach(row => {
//         csv += `${row.rider},${row.name || ''},${row.mobile || ''},${row.orders},${(row.earnings || 0).toFixed(2)},${(row.cashCollected || 0).toFixed(2)}\n`;
//       });
//       res.header('Content-Type', 'text/csv');
//       res.header('Content-Disposition', `attachment; filename="admin-rider-settlements-${from || 'all'}-${to || 'now'}.csv"`);
//       return res.send(csv);
//     }
//     res.status(200).json({ results });
//   } catch (error) {
//     res.status(500).json({ message: error.message });
//   }
// };
exports.adminRiderSettlements = async (req, res) => {
  try {
    const { from, to, riderId, detail = 'summary', format = 'json' } = req.query;
    const Order = require('../models/Order');
    const match = { status: 'delivered' };
    if (from) match.deliveredAt = { $gte: new Date(from) };
    if (to) match.deliveredAt = match.deliveredAt ? { ...match.deliveredAt, $lte: new Date(to) } : { $lte: new Date(to) };
    if (riderId) match.rider = require('mongoose').Types.ObjectId(riderId);
    if (detail === 'orders') {
      const orders = await Order.find(match).populate('rider', 'user').populate('rider.user', 'name').sort({ deliveredAt: -1 });
      if (format === 'csv') {
        let csv = 'orderId,riderId,riderName,date,totalAmount,riderEarning,cashCollected,deliveredAt\n';
        orders.forEach(o => {
          const riderName = o.rider && o.rider.user && o.rider.user.name ? o.rider.user.name : '';
          csv += `${o._id},${o.rider || ''},${riderName},${o.createdAt.toISOString().split('T')[0]},${(o.totalAmount || 0).toFixed(2)},${(o.riderEarning || 0).toFixed(2)},${(o.cashCollected || 0).toFixed(2)},${o.deliveredAt ? o.deliveredAt.toISOString() : ''}\n`;
        });
        res.header('Content-Type', 'text/csv');
        res.header('Content-Disposition', `attachment; filename="admin-rider-orders-${from || 'all'}-${to || 'now'}.csv"`);
        return res.send(csv);
      }
      return res.status(200).json({ orders });
    }
    const agg = await Order.aggregate([
      { $match: match },
      { $group: { _id: '$rider', orders: { $sum: 1 }, earnings: { $sum: '$riderEarning' }, cashCollected: { $sum: '$cashCollected' } } },
      { $sort: { earnings: -1 } }
    ]);
    const results = [];
    for (const r of agg) {
      const riderDoc = await Rider.findById(r._id).populate('user', 'name mobile email');
      const riderUser = riderDoc?.user;
      const earnings = Number(r.earnings || 0);
      const cashCollected = Number(r.cashCollected || 0);

      results.push({
        rider: r._id,
        riderId: r._id,
        name: riderUser?.name || '',
        riderName: riderUser?.name || '',
        mobile: riderUser?.mobile || '',
        phone: riderUser?.mobile || '',
        email: riderUser?.email || '',
        orders: r.orders,
        totalOrders: r.orders,
        earnings,
        totalEarnings: earnings,
        cashCollected,
        deductions: cashCollected,
        netSettlement: earnings - cashCollected,
      });
    }
    if (format === 'csv') {
      let csv = 'riderId,name,mobile,orders,earnings,cashCollected\n';
      results.forEach(row => {
        csv += `${row.rider},${row.name || ''},${row.mobile || ''},${row.orders},${(row.earnings || 0).toFixed(2)},${(row.cashCollected || 0).toFixed(2)}\n`;
      });
      res.header('Content-Type', 'text/csv');
      res.header('Content-Disposition', `attachment; filename="admin-rider-settlements-${from || 'all'}-${to || 'now'}.csv"`);
      return res.send(csv);
    }
    res.status(200).json({ results });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

exports.requestWithdrawal = async (req, res) => {
  try {
    const { amount, method, bankDetails } = req.body;
    if (!amount || amount <= 0) return res.status(400).json({ message: 'Invalid amount' });
    const user = await User.findById(req.user._id);
    if (!user) return res.status(404).json({ message: 'User not found' });
    if (user.walletBalance < amount) return res.status(400).json({ message: 'Insufficient balance' });
    const Withdrawal = require('../models/WithdrawalRequest');
    const reqObj = await Withdrawal.create({ user: req.user._id, amount, method, bankDetails });
    res.status(201).json({ message: 'Withdrawal requested', request: reqObj });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};
exports.getWithdrawals = async (req, res) => {
  try {
    const Withdrawal = require('../models/WithdrawalRequest');
    const requests = await Withdrawal.find({ user: req.user._id }).sort({ createdAt: -1 });
    res.status(200).json(requests);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};
exports.createTicket = async (req, res) => {
  try {
    const { subject, message } = req.body;
    const Ticket = require('../models/SupportTicket');
    const ticket = await Ticket.create({ user: req.user._id, userType: 'rider', subject, message });
    res.status(201).json({ message: 'Ticket created', ticket });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};
exports.getTickets = async (req, res) => {
  try {
    const Ticket = require('../models/SupportTicket');
    const tickets = await Ticket.find({ user: req.user._id }).sort({ createdAt: -1 });
    res.status(200).json(tickets);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};
exports.getTrainingMaterials = async (req, res) => {
  try {
    const Training = require('../models/TrainingMaterial');
    const materials = await Training.find().sort({ createdAt: -1 });
    res.status(200).json(materials);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};
exports.triggerSOS = async (req, res) => {
  try {
    const { message, location } = req.body;
    const rider = await Rider.findOne({ user: req.user._id });
    if (!rider) return res.status(404).json({ message: 'Rider profile not found' });
    rider.sosActive = true;
    rider.sosLastAt = new Date();
    if (location && location.long !== undefined && location.lat !== undefined) {
      rider.sosLocation = { type: 'Point', coordinates: [location.long, location.lat] };
    } else if (rider.currentLocation && rider.currentLocation.coordinates) {
      rider.sosLocation = rider.currentLocation;
    }
    await rider.save();
    const ticket = await SupportTicket.create({ user: req.user._id, userType: 'rider', subject: 'SOS Alert', message: `SOS triggered by rider ${req.user._id} - ${message || 'No message provided'}` });
    const admins = await User.find({ role: 'admin' });
    const user = await User.findById(req.user._id).select('name mobile');
    const notifTitle = 'SOS Alert - Rider';
    const notifBody = `${user ? user.name : 'Rider'} triggered SOS. Check support tickets.`;
    for (const a of admins) {
      try { await sendNotification(a._id, notifTitle, notifBody, { rider: rider._id, ticketId: ticket._id }); } catch (e) { }
    }
    res.status(200).json({ message: 'SOS triggered and admins notified', rider, ticket });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};
exports.clearSOS = async (req, res) => {
  try {
    const { note } = req.body;
    const rider = await Rider.findOne({ user: req.user._id });
    if (!rider) return res.status(404).json({ message: 'Rider profile not found' });
    rider.sosActive = false;
    rider.sosLastAt = new Date();
    await rider.save();
    await SupportTicket.updateMany({ user: req.user._id, subject: 'SOS Alert', status: 'open' }, { status: 'resolved', $push: { reply: { by: 'rider', message: note || 'Cleared SOS', createdAt: new Date() } } });
    const admins = await User.find({ role: 'admin' });
    const user = await User.findById(req.user._id).select('name mobile');
    for (const a of admins) {
      try { await sendNotification(a._id, 'SOS Cleared', `${user ? user.name : 'Rider'} cleared SOS`); } catch (e) { }
    }
    res.status(200).json({ message: 'SOS cleared', rider });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};
exports.updateDocuments = async (req, res) => {
  try {
    let { documents, permanentAddress, localAddress, emergencyContactNumber } = req.body;
    documents = parseIfString(documents);
    const bracketDocuments = extractBracketObject(req.body, 'documents');
    documents = deepMergeObjects(documents || {}, bracketDocuments);

    if (documents !== undefined && !isPlainObject(documents)) {
      return res.status(400).json({ message: 'Invalid documents format' });
    }

    permanentAddress = parseIfString(permanentAddress);
    localAddress = parseIfString(localAddress);
    if (permanentAddress !== undefined && !isPlainObject(permanentAddress)) {
      return res.status(400).json({ message: 'Invalid permanentAddress format' });
    }
    if (localAddress !== undefined && !isPlainObject(localAddress)) {
      return res.status(400).json({ message: 'Invalid localAddress format' });
    }

    const rider = await Rider.findOne({ user: req.user._id });
    if (!rider) return res.status(404).json({ message: 'Rider profile not found' });

    const updatedDocuments = deepMergeObjects(rider.documents || {}, documents || {});

    if (req.files) {
      if (req.files.licenseFrontImage && req.files.licenseFrontImage[0]) {
        updatedDocuments.license = updatedDocuments.license || {};
        updatedDocuments.license.frontImage = getFileUrl(req.files.licenseFrontImage[0]);
      }
      if (req.files.licenseBackImage && req.files.licenseBackImage[0]) {
        updatedDocuments.license = updatedDocuments.license || {};
        updatedDocuments.license.backImage = getFileUrl(req.files.licenseBackImage[0]);
      }
      if (req.files.rcImage && req.files.rcImage[0]) {
        updatedDocuments.rc = updatedDocuments.rc || {};
        updatedDocuments.rc.image = getFileUrl(req.files.rcImage[0]);
      }
      if (req.files.insuranceImage && req.files.insuranceImage[0]) {
        updatedDocuments.insurance = updatedDocuments.insurance || {};
        updatedDocuments.insurance.image = getFileUrl(req.files.insuranceImage[0]);
      }
      if (req.files.medicalCertificate && req.files.medicalCertificate[0]) {
        updatedDocuments.medicalCertificate = updatedDocuments.medicalCertificate || {};
        updatedDocuments.medicalCertificate.image = getFileUrl(req.files.medicalCertificate[0]);
      }
      if (req.files.panCardImage && req.files.panCardImage[0]) {
        updatedDocuments.panCard = updatedDocuments.panCard || {};
        updatedDocuments.panCard.image = getFileUrl(req.files.panCardImage[0]);
      }
      if (req.files.aadharCardImage && req.files.aadharCardImage[0]) {
        updatedDocuments.aadharCard = updatedDocuments.aadharCard || {};
        updatedDocuments.aadharCard.image = getFileUrl(req.files.aadharCardImage[0]);
      }
      if (req.files.policyVerification && req.files.policyVerification[0]) {
        updatedDocuments.policyVerification = updatedDocuments.policyVerification || {};
        updatedDocuments.policyVerification.image = getFileUrl(req.files.policyVerification[0]);
      }
    }

    rider.documents = updatedDocuments;
    if (permanentAddress !== undefined) rider.permanentAddress = deepMergeObjects(rider.permanentAddress || {}, permanentAddress);
    if (localAddress !== undefined) rider.localAddress = deepMergeObjects(rider.localAddress || {}, localAddress);
    if (emergencyContactNumber !== undefined) rider.emergencyContactNumber = emergencyContactNumber;

    rider.verificationStatus = 'pending';
    rider.riderVerified = false;

    await rider.save();
    const admins = await User.find({ role: 'admin' });
    const user = await User.findById(req.user._id).select('name');
    for (const a of admins) {
      try { await sendNotification(a._id, 'Rider Documents Updated', `${user ? user.name : 'A rider'} updated their documents`); } catch (e) { }
    }
    res.status(200).json({ message: 'Documents uploaded, verification pending', rider });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};
exports.updateVehicle = async (req, res) => {
  try {
    let { vehicle } = req.body; // Expect { type, model, number }
    vehicle = parseIfString(vehicle);

    if (!vehicle || typeof vehicle !== 'object') {
      return res.status(400).json({ message: 'Vehicle details are required' });
    }

    const rider = await Rider.findOne({ user: req.user._id });
    if (!rider) return res.status(404).json({ message: 'Rider profile not found' });
    if (vehicle && vehicle.type && typeof vehicle.type === 'string') {
      const VehicleModel = require('../models/Vehicle');
      const foundVehicle = await VehicleModel.findOne({ $or: [{ name: vehicle.type }, { type: vehicle.type }] });
      if (foundVehicle) vehicle.type = foundVehicle.type || foundVehicle.name || vehicle.type;
    }
    rider.vehicle = { ...(rider.vehicle || {}), ...(vehicle || {}) };
    rider.vehicle.vehicleApproval = rider.vehicle.vehicleApproval || {};
    rider.vehicle.vehicleApproval.status = 'pending';
    rider.vehicle.vehicleVerified = false;
    rider.verificationStatus = 'pending';
    rider.riderVerified = false;
    await rider.save();
    const admins = await User.find({ role: 'admin' });
    const user = await User.findById(req.user._id).select('name');
    for (const a of admins) {
      try { await sendNotification(a._id, 'Rider Vehicle Updated', `${user ? user.name : 'A rider'} updated vehicle info`); } catch (e) { }
    }
    res.status(200).json({ message: 'Vehicle updated, approval pending', rider });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};
exports.updateRiderBankDetails = async (req, res) => {
  try {
    let { bankDetails } = req.body;
    bankDetails = parseIfString(bankDetails);
    if (!bankDetails || !isPlainObject(bankDetails)) {
      return res.status(400).json({ message: 'Bank details are required' });
    }
    const rider = await Rider.findOne({ user: req.user._id });
    if (!rider) return res.status(404).json({ message: 'Rider profile not found' });
    rider.bankDetails = {
      ...(rider.bankDetails || {}),
      ...bankDetails,
      verified: false,
      verificationStatus: 'pending',
      rejectionReason: undefined,
      approvedAt: undefined,
      approvedBy: undefined
    };
    rider.verificationStatus = 'pending';
    rider.riderVerified = false;
    await rider.save();
    const admins = await User.find({ role: 'admin' });
    const user = await User.findById(req.user._id).select('name');
    for (const a of admins) {
      try {
        await sendNotification(
          a._id,
          'Rider Bank Details Updated',
          `${user ? user.name : 'A rider'} updated their bank details and requires approval`
        );
      } catch (e) { }
    }
    res.status(200).json({
      success: true,
      message: 'Bank details submitted for admin approval',
      rider
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};
exports.verifyRiderVehicle = async (req, res) => {
  try {
    const { status, reason } = req.body; // status = 'approved'|'rejected'|'pending'
    if (!['pending', 'approved', 'rejected'].includes(status)) return res.status(400).json({ message: 'Invalid status' });
    const rider = await Rider.findById(req.params.id).populate('user', 'name');
    if (!rider) return res.status(404).json({ message: 'Rider not found' });
    rider.vehicle.vehicleApproval = rider.vehicle.vehicleApproval || {};
    rider.vehicle.vehicleApproval.status = status;
    rider.vehicle.vehicleApproval.reason = reason || '';
    if (status === 'approved') {
      rider.vehicle.vehicleApproval.approvedAt = new Date();
      rider.vehicle.vehicleApproval.approvedBy = req.user._id;
      rider.vehicle.vehicleVerified = true;
    } else if (status === 'rejected') {
      rider.vehicle.vehicleVerified = false;
      rider.verificationStatus = 'rejected';
    } else {
      rider.vehicle.vehicleVerified = false;
    }
    if (rider.riderVerified && rider.vehicle.vehicleVerified) {
      rider.verificationStatus = 'approved';
    } else if (status !== 'rejected') {
      rider.verificationStatus = 'pending';
    }
    await rider.save();
    try { await sendNotification(rider.user, 'Vehicle Verification Update', `Your vehicle verification status: ${status}`); } catch (e) { }
    res.status(200).json({
      message: status === 'approved'
        ? (rider.verificationStatus === 'approved'
          ? 'Vehicle verified. Rider fully approved!'
          : 'Vehicle verified. Awaiting rider documents verification.')
        : 'Vehicle verification updated',
      rider
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};
exports.verifyRiderBankDetails = async (req, res) => {
  try {
    const { status, reason } = req.body; // status = 'approved'|'rejected'
    if (!['approved', 'rejected'].includes(status)) {
      return res.status(400).json({ message: 'Invalid status. Use approved or rejected' });
    }
    const rider = await Rider.findById(req.params.id).populate('user', 'name');
    if (!rider) return res.status(404).json({ message: 'Rider not found' });
    if (!rider.bankDetails) {
      return res.status(400).json({ message: 'No bank details found for this rider' });
    }
    rider.bankDetails.verificationStatus = status;
    if (status === 'approved') {
      rider.bankDetails.verified = true;
      rider.bankDetails.approvedAt = new Date();
      rider.bankDetails.approvedBy = req.user._id;
      rider.bankDetails.rejectionReason = undefined;
    } else if (status === 'rejected') {
      rider.bankDetails.verified = false;
      rider.bankDetails.rejectionReason = reason || 'Bank details rejected';
      rider.verificationStatus = 'rejected';
    }
    await rider.save();
    try {
      await sendNotification(
        rider.user,
        'Bank Details Verification',
        status === 'approved'
          ? 'Your bank details have been approved'
          : `Your bank details were rejected: ${reason || 'Please update and resubmit'}`
      );
    } catch (e) { }
    res.status(200).json({
      success: true,
      message: `Bank details ${status}`,
      rider
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};
exports.adminGetActiveSOS = async (req, res) => {
  try {
    const active = await Rider.find({ sosActive: true }).populate('user', 'name mobile');
    res.status(200).json(active);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};
exports.adminClearSOS = async (req, res) => {
  try {
    const rider = await Rider.findById(req.params.id);
    if (!rider) return res.status(404).json({ message: 'Rider not found' });
    rider.sosActive = false;
    rider.sosLastAt = new Date();
    await rider.save();
    await SupportTicket.updateMany({ user: rider.user, subject: 'SOS Alert', status: 'open' }, { status: 'resolved', $push: { reply: { by: 'admin', message: 'Resolved by admin', createdAt: new Date() } } });
    try { await sendNotification(rider.user, 'SOS Cleared by Admin', 'Your SOS has been cleared by support'); } catch (e) { }
    res.status(200).json({ message: 'SOS cleared for rider', rider });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};
exports.updateLocation = async (req, res) => {
  try {
    const { long, lat } = req.body;
    const longitude = Number(long);
    const latitude = Number(lat);

    if (!Number.isFinite(longitude) || !Number.isFinite(latitude)) {
      return res.status(400).json({ message: 'Invalid coordinates' });
    }
    if (longitude < -180 || longitude > 180 || latitude < -90 || latitude > 90) {
      return res.status(400).json({ message: 'Coordinates out of range' });
    }

    const locationUtils = require('../utils/locationUtils');
    const rider = await Rider.findOneAndUpdate(
      { user: req.user._id },
      {
        currentLocation: {
          type: 'Point',
          coordinates: [longitude, latitude]
        },
        lastLocationUpdateAt: new Date() // ✅ CHANGED: field name
      },
      { new: true }
    ).populate('user', 'name');
    if (!rider) {
      return res.status(404).json({ message: 'Rider not found' });
    }
    res.status(200).send("Location Updated");
    setImmediate(async () => {
      try {
        const activeOrders = await Order.find({
          rider: rider._id,
          status: { $in: ['assigned', 'accepted_by_rider', 'reached_restaurant', 'arrived_restaurant', 'picked_up', 'delivery_arrived'] }
        });
        for (const order of activeOrders) {
          try {
            const eta = locationUtils.calculateETA(
              [longitude, latitude],
              order.deliveryAddress.coordinates,
              order.status
            );
            socketService.emitToCustomer(order.customer.toString(), 'rider:location_updated', {
              orderId: order._id,
              riderLocation: {
                lat: latitude,
                long: longitude
              },
              eta: eta,
              riderName: rider.user.name,
              riderPhone: rider.user?.mobile || 'Not provided'
            });
          } catch (err) {
            logger.error('Error emitting location to customer', { orderId: order._id, error: err.message });
          }
        }
        if (activeOrders.some(o => o.status === 'picked_up')) {
          try {
            socketService.emitToRestaurant(
              activeOrders[0].restaurant.toString(),
              'rider:on_way',
              {
                riderLocation: { lat: latitude, long: longitude },
                riderName: rider.user.name
              }
            );
          } catch (err) {
            logger.error('Error emitting location to restaurant', { error: err.message });
          }
        }
        try {
          const adminLocationPayload = {
            riderId: rider._id,
            riderName: rider.user.name,
            latitude,
            longitude,
            activeOrders: activeOrders.length,
            timestamp: new Date()
          };
          socketService.emitToAdmin('rider:location_update', adminLocationPayload);
          socketService.emitToAdmin('rider:location_updated', adminLocationPayload);
        } catch (err) {
          logger.error('Error emitting location to admin', { error: err.message });
        }
      } catch (socketError) {
        logger.error('Socket emission error in background:', socketError);
      }
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};
exports.createRiderByAdmin = async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();
  try {
    let {
      name, email, mobile, password,
      address, workCity, workZone, vehicle, documents, bankDetails,
      permanentAddress, localAddress, emergencyContactNumber
    } = req.body;
    address = parseIfString(address);
    vehicle = parseIfString(vehicle);
    documents = parseIfString(documents);
    bankDetails = parseIfString(bankDetails);
    permanentAddress = parseIfString(permanentAddress);
    localAddress = parseIfString(localAddress);

    if (!password || String(password).length < 6) {
      throw new Error('Password is required and must be at least 6 characters');
    }
    if (address !== undefined && !isPlainObject(address)) {
      throw new Error('Invalid address format');
    }
    if (vehicle !== undefined && !isPlainObject(vehicle)) {
      throw new Error('Invalid vehicle format');
    }
    if (documents !== undefined && !isPlainObject(documents)) {
      throw new Error('Invalid documents format');
    }
    if (bankDetails !== undefined && !isPlainObject(bankDetails)) {
      throw new Error('Invalid bank details format');
    }
    const userExists = await User.findOne({ $or: [{ email }, { mobile }] });
    if (userExists) {
      throw new Error('User with this email or mobile already exists');
    }
    let profilePic = '';
    if (req.files && req.files.profilePic && req.files.profilePic[0]) {
      profilePic = getFileUrl(req.files.profilePic[0]);
    }
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);
    const [newUser] = await User.create([{
      name, email, mobile, password: hashedPassword, role: 'rider', profilePic, isVerified: true
    }], { session });
    if (!vehicle || !vehicle.type) {
      throw new Error("Vehicle type is required (bike | car | scooter | other)");
    }
    vehicle.vehicleVerified = true; // Admin created = Auto Verified
    vehicle.approvedAt = new Date();
    vehicle.approvedBy = req.user._id;
    vehicle.vehicleApproval = {
      status: 'approved',
      approvedAt: new Date(),
      approvedBy: req.user._id
    };
    const processedDocuments = documents || {};
    if (req.files) {
      if (req.files.licenseFrontImage && req.files.licenseFrontImage[0]) {
        processedDocuments.license = processedDocuments.license || {};
        processedDocuments.license.frontImage = getFileUrl(req.files.licenseFrontImage[0]);
      }
      if (req.files.licenseBackImage && req.files.licenseBackImage[0]) {
        processedDocuments.license = processedDocuments.license || {};
        processedDocuments.license.backImage = getFileUrl(req.files.licenseBackImage[0]);
      }
      if (req.files.rcImage && req.files.rcImage[0]) {
        processedDocuments.rc = processedDocuments.rc || {};
        processedDocuments.rc.image = getFileUrl(req.files.rcImage[0]);
      }
      if (req.files.insuranceImage && req.files.insuranceImage[0]) {
        processedDocuments.insurance = processedDocuments.insurance || {};
        processedDocuments.insurance.image = getFileUrl(req.files.insuranceImage[0]);
      }
      if (req.files.medicalCertificate && req.files.medicalCertificate[0]) {
        processedDocuments.medicalCertificate = processedDocuments.medicalCertificate || {};
        processedDocuments.medicalCertificate.image = getFileUrl(req.files.medicalCertificate[0]);
      }
      if (req.files.panCardImage && req.files.panCardImage[0]) {
        processedDocuments.panCard = processedDocuments.panCard || {};
        processedDocuments.panCard.image = getFileUrl(req.files.panCardImage[0]);
      }
      if (req.files.aadharCardImage && req.files.aadharCardImage[0]) {
        processedDocuments.aadharCard = processedDocuments.aadharCard || {};
        processedDocuments.aadharCard.image = getFileUrl(req.files.aadharCardImage[0]);
      }
      if (req.files.policyVerification && req.files.policyVerification[0]) {
        processedDocuments.policyVerification = processedDocuments.policyVerification || {};
        processedDocuments.policyVerification.image = getFileUrl(req.files.policyVerification[0]);
      }
    }
    
    const [newRider] = await Rider.create([{
      user: newUser._id,
      address,
      workCity,
      workZone,
      vehicle,
      documents: processedDocuments,
      bankDetails,
      permanentAddress: permanentAddress || {},
      localAddress: localAddress || {},
      emergencyContactNumber: emergencyContactNumber || "",
      verificationStatus: 'approved', // Admin created = Auto Approved
      riderVerified: true,
      currentLocation: {
        type: 'Point',
        coordinates: [0, 0] // Default coords to satisfy 2dsphere index
      }
    }], { session });
    await session.commitTransaction();
    session.endSession();
    res.status(201).json({
      message: "Rider created successfully by Admin",
      user: newUser,
      rider: newRider
    });
  } catch (error) {
    await session.abortTransaction();
    session.endSession();
    res.status(500).json({ message: error.message });
  }
};
exports.getPendingRiders = async (req, res) => {
  try {
    const pendingRiders = await Rider.find({ verificationStatus: 'pending' })
      .populate('user', 'name email mobile profilePic');
    res.status(200).json(pendingRiders);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};
exports.verifyRider = async (req, res) => {
  try {
    const { status, reason } = req.body; // Expecting: { status: 'approved' | 'rejected' }
    const rider = await Rider.findById(req.params.id);
    if (!rider) return res.status(404).json({ message: "Rider not found" });
    const newStatus = status || 'approved';
    if (!['pending', 'approved', 'rejected', 'suspended'].includes(newStatus)) {
      return res.status(400).json({ message: "Invalid status" });
    }
    if (newStatus === 'approved') {
      rider.riderVerified = true;
    } else if (newStatus === 'rejected') {
      rider.riderVerified = false;
      rider.verificationStatus = 'rejected';
      if (reason) {
        rider.rejectionReason = reason;
      }
    } else {
      rider.riderVerified = false;
    }
    if (rider.riderVerified && rider.vehicle && rider.vehicle.vehicleVerified) {
      rider.verificationStatus = 'approved';
    } else if (newStatus !== 'rejected') {
      rider.verificationStatus = 'pending';
    }
    await rider.save();
    res.json({
      message: newStatus === 'approved'
        ? (rider.verificationStatus === 'approved'
          ? 'Rider fully verified (documents & vehicle approved)'
          : 'Rider documents approved. Awaiting vehicle verification.')
        : `Rider ${newStatus} successfully`,
      rider
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};
exports.rejectRider = async (req, res) => {
  try {
    const { reason } = req.body;
    const rider = await Rider.findById(req.params.id)
      .populate('user', 'name email mobile');
    if (!rider) {
      return res.status(404).json({ message: "Rider not found" });
    }
    if (!reason || reason.trim().length === 0) {
      return res.status(400).json({
        message: "Rejection reason is required",
        error: "Please provide a reason for rejecting this rider"
      });
    }
    rider.riderVerified = false;
    rider.verificationStatus = 'rejected';
    rider.rejectionReason = reason;
    rider.rejectionDate = new Date();
    rider.rejectedBy = req.user._id;
    await rider.save();
    try {
      await sendNotification(
        rider.user._id,
        "Application Rejected",
        `Your rider application has been rejected. Reason: ${reason}`,
        { riderId: rider._id, reason }
      );
    } catch (notifyError) {
      console.error('Failed to send rejection notification:', notifyError);
    }
    res.status(200).json({
      success: true,
      message: "Rider rejected successfully",
      rider: {
        _id: rider._id,
        name: rider.user.name,
        verificationStatus: rider.verificationStatus,
        rejectionReason: rider.rejectionReason,
        rejectionDate: rider.rejectionDate
      }
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};
exports.getAllRiders = async (req, res) => {
  try {
    const { page, limit, skip } = getPaginationParams(req, 50);
    const { status } = req.query;
    const search = req.query.search || '';
    let query = {};
    if (status) {
      query.verificationStatus = status;
    }
    if (search) {
      query.$or = [
        { 'address.city': { $regex: search, $options: 'i' } },
        { workCity: { $regex: search, $options: 'i' } }
      ];
    }
    const total = await Rider.countDocuments(query);
    const riders = await Rider.find(query)
      .populate('user', 'name email mobile profilePic')
      .skip(skip)
      .limit(limit)
      .sort({ createdAt: -1 });
    res.status(200).json({
      riders,
      total,
      page,
      limit,
      pages: Math.ceil(total / limit)
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};
exports.getActiveRidersWithLocations = async (req, res) => {
  try {
    const { isOnline } = req.query; // Optional filter: true/false
    let query = {
      'currentLocation.coordinates.0': { $exists: true },
      'currentLocation.coordinates.1': { $exists: true },
      verificationStatus: 'approved'
    };
    if (isOnline !== undefined) {
      query.isOnline = isOnline === 'true';
    } else {
      query.isOnline = true;
    }
    const ridersWithLocations = await Rider.find(query)
      .populate('user', 'name email mobile')
      .lean();
    const enrichedRiders = await Promise.all(
      ridersWithLocations.map(async (rider) => {
        const activeOrders = await Order.find({
          rider: rider._id,
          status: { $in: ['assigned', 'accepted_by_rider', 'reached_restaurant', 'arrived_restaurant', 'picked_up', 'delivery_arrived'] }
        })
          .lean()
          .select('_id customer restaurant deliveryAddress status pickupAddress');
        const [longitude, latitude] = rider.currentLocation?.coordinates || [0, 0];
        const riderStatus = rider.isOnline
          ? (rider.breakMode ? 'break' : (rider.isAvailable ? 'online' : 'busy'))
          : 'offline';
        return {
          riderId: rider._id,
          riderName: rider.user?.name || 'Unknown',
          riderPhone: rider.user?.mobile || rider.contactNumber,
          status: riderStatus,
          coordinates: {
            latitude,
            longitude
          },
          accuracy: rider.accuracy || null,
          speed: rider.speed || 0,
          heading: rider.heading || null,
          lastLocationUpdate: rider.lastLocationUpdateAt || rider.updatedAt,
          isAvailable: rider.isAvailable,
          onBreak: rider.breakMode,
          activeOrders: activeOrders.map(o => ({
            orderId: o._id,
            status: o.status,
            customerCity: o.pickupAddress?.city || 'N/A',
            deliveryCity: o.deliveryAddress?.city || 'N/A'
          })),
          orderCount: activeOrders.length,
          vehicle: {
            type: rider.vehicle?.type,
            number: rider.vehicle?.number
          }
        };
      })
    );
    res.status(200).json({
      success: true,
      count: enrichedRiders.length,
      riders: enrichedRiders.sort((a, b) => b.orderCount - a.orderCount), // Show busiest riders first
      timestamp: new Date()
    });
  } catch (error) {
    console.error('Error fetching active riders:', error);
    res.status(500).json({ message: error.message });
  }
};
exports.getRiderLiveTracking = async (req, res) => {
  try {
    const { riderId } = req.params;
    const rider = await Rider.findById(riderId)
      .populate('user', 'name email mobile profilePic')
      .lean();
    if (!rider) {
      return res.status(404).json({ message: 'Rider not found' });
    }
    const activeOrders = await Order.find({
      rider: riderId,
      status: { $in: ['assigned', 'accepted_by_rider', 'reached_restaurant', 'arrived_restaurant', 'picked_up', 'delivery_arrived'] }
    })
      .populate('customer', 'name mobile')
      .populate('restaurant', 'name address')
      .lean();
    const [longitude, latitude] = rider.currentLocation?.coordinates || [0, 0];
    const riderStatus = rider.isOnline
      ? (rider.breakMode ? 'break' : (rider.isAvailable ? 'online' : 'busy'))
      : 'offline';
    res.status(200).json({
      success: true,
      rider: {
        riderId: rider._id,
        riderName: rider.user?.name,
        riderPhone: rider.user?.mobile,
        riderProfilePic: rider.user?.profilePic,
        currentLocation: {
          latitude,
          longitude,
          accuracy: rider.accuracy,
          speed: rider.speed,
          heading: rider.heading,
          address: rider.address || {}
        },
        status: riderStatus,
        isAvailable: rider.isAvailable,
        onBreak: rider.breakMode,
        breakReason: rider.breakReason,
        vehicle: {
          type: rider.vehicle?.type,
          number: rider.vehicle?.number,
          color: rider.vehicle?.color
        },
        stats: {
          totalDeliveries: rider.stats?.totalDeliveries || 0,
          successfulOrders: rider.stats?.successfulOrders || 0,
          ordersRejected: rider.stats?.ordersRejected || 0,
          rating: rider.rating || 0
        },
        lastLocationUpdate: rider.lastLocationUpdateAt,
        updatedAt: rider.updatedAt
      },
      activeOrders: activeOrders.map(order => ({
        orderId: order._id,
        customerName: order.customer?.name,
        customerPhone: order.customer?.mobile,
        restaurantName: order.restaurant?.name,
        restaurantAddress: order.restaurant?.address,
        pickupLocation: order.pickupAddress || {},
        deliveryLocation: order.deliveryAddress || {},
        status: order.status,
        estimatedDelivery: order.estimatedDeliveryTime
      })),
      totalActiveOrders: activeOrders.length,
      timestamp: new Date()
    });
  } catch (error) {
    console.error('Error fetching rider tracking:', error);
    res.status(500).json({ message: error.message });
  }
};
exports.getRiderDetails = async (req, res) => {
  try {
    const rider = await Rider.findById(req.params.id)
      .populate('user', 'name email mobile profilePic');
    if (!rider) return res.status(404).json({ message: "Rider not found" });
    res.status(200).json(rider);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};
exports.updateRiderByAdmin = async (req, res) => {
  try {
    let { address, workCity, workZone, vehicle, documents, bankDetails, permanentAddress, localAddress, emergencyContactNumber } = req.body;
    
    // Parse incoming JSON strings from FormData
    address = parseIfString(address);
    vehicle = parseIfString(vehicle);
    documents = parseIfString(documents);
    bankDetails = parseIfString(bankDetails);
    permanentAddress = parseIfString(permanentAddress);
    localAddress = parseIfString(localAddress);

    const bracketDocuments = extractBracketObject(req.body, 'documents');
    documents = deepMergeObjects(documents || {}, bracketDocuments);

    if (address !== undefined && !isPlainObject(address)) {
      return res.status(400).json({ message: 'Invalid address format' });
    }
    if (vehicle !== undefined && !isPlainObject(vehicle)) {
      return res.status(400).json({ message: 'Invalid vehicle format' });
    }
    if (documents !== undefined && !isPlainObject(documents)) {
      return res.status(400).json({ message: 'Invalid documents format' });
    }
    if (bankDetails !== undefined && !isPlainObject(bankDetails)) {
      return res.status(400).json({ message: 'Invalid bank details format' });
    }
    if (permanentAddress !== undefined && !isPlainObject(permanentAddress)) {
      return res.status(400).json({ message: 'Invalid permanentAddress format' });
    }
    if (localAddress !== undefined && !isPlainObject(localAddress)) {
      return res.status(400).json({ message: 'Invalid localAddress format' });
    }

    const existingRider = await Rider.findById(req.params.id);
    if (!existingRider) return res.status(404).json({ message: "Rider not found" });
    
    // Handle profile picture update for User model
    let profilePicUrl = null;
    if (req.files && req.files.profilePic && req.files.profilePic[0]) {
      profilePicUrl = getFileUrl(req.files.profilePic[0]);
    }
    
    // Handle file uploads for documents
    if (req.files) {
      documents = deepMergeObjects(existingRider.documents || {}, documents || {});
      if (req.files.licenseFrontImage && req.files.licenseFrontImage[0]) {
        documents.license = documents.license || {};
        documents.license.frontImage = getFileUrl(req.files.licenseFrontImage[0]);
      }
      if (req.files.licenseBackImage && req.files.licenseBackImage[0]) {
        documents.license = documents.license || {};
        documents.license.backImage = getFileUrl(req.files.licenseBackImage[0]);
      }
      if (req.files.rcImage && req.files.rcImage[0]) {
        documents.rc = documents.rc || {};
        documents.rc.image = getFileUrl(req.files.rcImage[0]);
      }
      if (req.files.insuranceImage && req.files.insuranceImage[0]) {
        documents.insurance = documents.insurance || {};
        documents.insurance.image = getFileUrl(req.files.insuranceImage[0]);
      }
      if (req.files.medicalCertificate && req.files.medicalCertificate[0]) {
        documents.medicalCertificate = documents.medicalCertificate || {};
        documents.medicalCertificate.image = getFileUrl(req.files.medicalCertificate[0]);
      }
      if (req.files.panCardImage && req.files.panCardImage[0]) {
        documents.panCard = documents.panCard || {};
        documents.panCard.image = getFileUrl(req.files.panCardImage[0]);
      }
      if (req.files.aadharCardImage && req.files.aadharCardImage[0]) {
        documents.aadharCard = documents.aadharCard || {};
        documents.aadharCard.image = getFileUrl(req.files.aadharCardImage[0]);
      }
      if (req.files.policyVerification && req.files.policyVerification[0]) {
        documents.policyVerification = documents.policyVerification || {};
        documents.policyVerification.image = getFileUrl(req.files.policyVerification[0]);
      }
    }
    
    // Handle vehicle type lookup (after parsing)
    if (vehicle && vehicle.type && typeof vehicle.type === 'string') {
      const VehicleModel = require('../models/Vehicle');
      const foundVehicle = await VehicleModel.findOne({ $or: [{ name: vehicle.type }, { type: vehicle.type }] });
      if (foundVehicle) vehicle.type = foundVehicle.type || foundVehicle.name || vehicle.type;
    }
    
    // Build update payload
    const updatePayload = {};
    if (workCity !== undefined) updatePayload.workCity = workCity;
    if (workZone !== undefined) updatePayload.workZone = workZone;
    if (address !== undefined) updatePayload.address = deepMergeObjects(existingRider.address || {}, address || {});
    if (vehicle !== undefined) updatePayload.vehicle = deepMergeObjects(existingRider.vehicle || {}, vehicle || {});
    if (documents !== undefined) updatePayload.documents = deepMergeObjects(existingRider.documents || {}, documents || {});
    if (bankDetails !== undefined) updatePayload.bankDetails = deepMergeObjects(existingRider.bankDetails || {}, bankDetails || {});
    if (permanentAddress !== undefined) updatePayload.permanentAddress = deepMergeObjects(existingRider.permanentAddress || {}, permanentAddress || {});
    if (localAddress !== undefined) updatePayload.localAddress = deepMergeObjects(existingRider.localAddress || {}, localAddress || {});
    if (emergencyContactNumber !== undefined) updatePayload.emergencyContactNumber = emergencyContactNumber;

    const verificationSensitiveUpdate =
      updatePayload.documents !== undefined ||
      updatePayload.vehicle !== undefined ||
      updatePayload.bankDetails !== undefined;
    if (verificationSensitiveUpdate) {
      updatePayload.verificationStatus = 'pending';
      updatePayload.riderVerified = false;
    }
    
    const updatedRider = await Rider.findByIdAndUpdate(
      req.params.id,
      updatePayload,
      { new: true, runValidators: true }
    );
    if (!updatedRider) return res.status(404).json({ message: "Rider not found" });
    
    // Update User's profile picture if provided
    if (profilePicUrl && updatedRider.user) {
      await User.findByIdAndUpdate(updatedRider.user, { profilePic: profilePicUrl });
    }
    
    res.status(200).json({ message: "Rider details updated", rider: updatedRider });
  } catch (error) {
    console.error('Update rider error:', error.message);
    res.status(500).json({ message: error.message });
  }
};
exports.deleteRider = async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();
  try {
    const rider = await Rider.findById(req.params.id).session(session);
    if (!rider) {
      await session.abortTransaction();
      return res.status(404).json({ message: "Rider not found" });
    }
    await User.findByIdAndDelete(rider.user).session(session);
    await Rider.findByIdAndDelete(req.params.id).session(session);
    await session.commitTransaction();
    session.endSession();
    res.status(200).json({ message: "Rider and associated User account deleted successfully" });
  } catch (error) {
    await session.abortTransaction();
    session.endSession();
    res.status(500).json({ message: error.message });
  }
};
exports.sendSOS = async (req, res) => {
  try {
    const { latitude, longitude, message, orderId } = req.body;
    const latNum = Number(latitude);
    const longNum = Number(longitude);
    const rider = await Rider.findOne({ user: req.user._id })
      .populate('user', 'name mobile');
    if (!rider) {
      return res.status(404).json({ message: 'Rider profile not found' });
    }
    if (!Number.isFinite(latNum) || !Number.isFinite(longNum)) {
      return res.status(400).json({ message: 'Location coordinates required for SOS' });
    }
    if (longNum < -180 || longNum > 180 || latNum < -90 || latNum > 90) {
      return res.status(400).json({ message: 'Location coordinates out of range' });
    }
    rider.currentLocation = {
      type: 'Point',
      coordinates: [longNum, latNum]
    };
    rider.lastLocationUpdateAt = new Date();
    await rider.save();
    const sosData = {
      riderId: rider._id,
      riderName: rider.user.name,
      riderMobile: rider.user.mobile,
      latitude: latNum,
      longitude: longNum,
      message: message || 'Emergency - immediate assistance needed',
      orderId: orderId || null,
      timestamp: new Date(),
      urgent: true,
      type: 'SOS'
    };
    socketService.emitToAdmin('rider:sos_alert', sosData);
    const sosTicket = await SupportTicket.create({
      user: req.user._id,
      subject: 'EMERGENCY SOS ALERT',
      message: `${sosData.message}\n\nLocation: ${latNum}, ${longNum}\nOrder ID: ${orderId || 'N/A'}`,
      category: 'emergency',
      priority: 'urgent',
      status: 'open'
    });
    try {
      const admins = await User.find({ role: 'admin' });
      for (const admin of admins) {
        await sendNotification(
          admin._id,
          'RIDER SOS ALERT',
          `${rider.user.name} needs immediate assistance! Location: ${latNum}, ${longNum}`,
          { riderId: rider._id, ticketId: sosTicket._id, latitude: latNum, longitude: longNum }
        );
      }
    } catch (notifyError) {
      console.error('Failed to send SOS notifications:', notifyError);
    }
    res.status(200).json({
      success: true,
      message: 'SOS alert sent successfully - help is on the way',
      ticketId: sosTicket._id,
      sosData
    });
  } catch (error) {
    console.error('SOS alert error:', error);
    res.status(500).json({ message: error.message });
  }
};
exports.resolveSOS = async (req, res) => {
  try {
    const { ticketId, resolution } = req.body;
    const rider = await Rider.findOne({ user: req.user._id })
      .populate('user', 'name');
    if (!rider) {
      return res.status(404).json({ message: 'Rider not found' });
    }
    if (ticketId) {
      await SupportTicket.findByIdAndUpdate(ticketId, {
        status: 'resolved',
        resolution: resolution || 'SOS resolved by rider',
        resolvedAt: new Date()
      });
    }
    socketService.emitToAdmin('rider:sos_resolved', {
      riderId: rider._id,
      riderName: rider.user.name,
      ticketId,
      resolution: resolution || 'Situation resolved',
      timestamp: new Date()
    });
    res.status(200).json({
      success: true,
      message: 'SOS resolved successfully'
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};
exports.respondToRideRequest = async (req, res) => {
  try {
    const { requestId, action } = req.params;
    const validActions = ['accept', 'reject'];
    if (!validActions.includes(action)) {
      return res.status(400).json({ message: "Invalid action. Use 'accept' or 'reject'" });
    }
    const riderDispatchService = require('../services/riderDispatchService');
    const serviceAction = action === 'accept' ? 'accepted' : 'rejected';
    const result = await riderDispatchService.handleRiderResponse(req.user._id, requestId, serviceAction);
    res.status(200).json(result);
  } catch (error) {
    if (error.code === 'ORDER_ALREADY_TAKEN' || error.statusCode === 409) {
      return res.status(409).json({
        success: false,
        code: 'ORDER_ALREADY_TAKEN',
        message: 'This order was already accepted by another rider'
      });
    }
    if (error.code === 'RIDER_ALREADY_ASSIGNED') {
      return res.status(409).json({
        success: false,
        code: 'RIDER_ALREADY_ASSIGNED',
        message: 'You already have an active order. Complete it before accepting a new one.'
      });
    }
    res.status(500).json({ message: error.message });
  }
};
exports.verifyPickup = async (req, res) => {
  try {
    const { orderId, otp } = req.body;
    const Order = require('../models/Order');
    const orderStateValidator = require('../utils/orderStateValidator');
    const socketService = require('../services/socketService');
    const order = await Order.findById(orderId);
    if (!order) return res.status(404).json({ message: "Order not found" });
    const riderProfile = await Rider.findOne({ user: req.user._id });
    if (!riderProfile) return res.status(404).json({ message: "Rider profile not found" });
    const riderCheck = orderStateValidator.validateRiderPickup(order, riderProfile._id);
    if (!riderCheck.valid) return res.status(400).json({ message: riderCheck.error });
    if (new Date() > order.pickupOtpExpiresAt) {
      return res.status(400).json({
        message: "Pickup OTP expired. Request new one.",
        code: "OTP_EXPIRED"
      });
    }
    if (order.pickupOtp !== otp) {
      return res.status(400).json({ message: "Invalid Pickup OTP" });
    }
    const oldStatus = order.status;
    order.status = 'picked_up';
    order.pickupOtpVerifiedAt = new Date();
    order.pickedUpAt = new Date();
    order.timeline.push({
      status: 'picked_up',
      timestamp: new Date(),
      label: "Picked Up",
      by: "rider",
      description: "Rider has picked up your order"
    });
    await order.save();
    const User = require('../models/User');
    const riderUser = await User.findById(req.user._id).select('name phone avatar mobile');
    socketService.emitToCustomer(order.customer.toString(), 'order:status', {
      orderId: order._id,
      status: 'picked_up',
      timestamp: new Date(),
      timeline: order.timeline
    });
    socketService.emitToRestaurant(order.restaurant.toString(), 'order:status', {
      orderId: order._id,
      status: 'picked_up',
      timestamp: new Date(),
      timeline: order.timeline
    });
    socketService.emitToAdmin('order:status', {
      orderId: order._id,
      status: 'picked_up',
      totalAmount: order.totalAmount,
      amount: order.totalAmount,
      timestamp: new Date(),
      timeline: order.timeline
    });
    try {
      const customerUser = await User.findById(order.customer).select('mobile');
      const notificationService = require('../utils/notificationService');
      if (customerUser?.mobile) {
        await notificationService.sendNotification(
          order.customer,
          'Order Picked Up',
          `${riderUser?.name || 'Your rider'} has picked up your order`
        );
      }
    } catch (notifErr) {
      console.error('Notification failed:', notifErr.message);
    }
    res.status(200).json({ success: true, message: "Order Picked Up!", order });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};
exports.verifyDelivery = async (req, res) => {
  try {
    const { orderId, otp } = req.body;
    const Order = require('../models/Order');
    const orderStateValidator = require('../utils/orderStateValidator');
    const socketService = require('../services/socketService');
    const order = await Order.findById(orderId);
    if (!order) return res.status(404).json({ message: "Order not found" });
    const riderProfile = await Rider.findOne({ user: req.user._id });
    if (!riderProfile) return res.status(404).json({ message: "Rider profile not found" });
    const riderCheck = orderStateValidator.validateRiderDelivery(order, riderProfile._id);
    if (!riderCheck.valid) return res.status(400).json({ message: riderCheck.error });
    if (new Date() > order.deliveryOtpExpiresAt) {
      return res.status(400).json({
        message: "Delivery OTP expired. Request new one.",
        code: "OTP_EXPIRED"
      });
    }
    if (order.deliveryOtp !== otp) {
      return res.status(400).json({ message: "Invalid Delivery OTP" });
    }
    const oldStatus = order.status;
    order.status = 'delivered';
    order.deliveryOtpVerifiedAt = new Date();
    order.deliveredAt = new Date();
    order.timeline.push({
      status: 'delivered',
      timestamp: new Date(),
      label: "Delivered",
      by: "system",
      description: "Order has been delivered"
    });
    if (order.paymentMethod === 'cod') {
      order.paymentStatus = 'paid';
      order.cashCollected = order.totalAmount;
      order.cashCollectedAt = new Date();
      order.cashCollectedBy = req.user._id;
    }
    await order.save();
    try {
      const { processCODDelivery, processOnlineDelivery } = require('../services/paymentService');
      const Restaurant = require('../models/Restaurant');
      if (order.paymentMethod === 'cod') {
        await processCODDelivery(order._id);
      } else {
        await processOnlineDelivery(order._id);
      }
      Restaurant.findByIdAndUpdate(order.restaurant, {
        $inc: {
          totalDeliveries: 1,
          successfulOrders: 1,
        }
      }).catch(err => console.error('Restaurant stat update failed:', err.message));
    } catch (payErr) {
      console.error('Failed to trigger earnings on delivery:', payErr.message);
    }
    await Rider.findOneAndUpdate({ user: req.user._id }, { isAvailable: true });
    const RideRequest = require('../models/RideRequest');
    await RideRequest.updateMany(
      { rider: riderProfile._id, status: 'pending' },
      { $set: { status: 'rejected' } }
    );
    socketService.emitToCustomer(order.customer.toString(), 'order:status', {
      orderId: order._id,
      status: 'delivered',
      timestamp: new Date(),
      timeline: order.timeline
    });
    socketService.emitToRestaurant(order.restaurant.toString(), 'order:status', {
      orderId: order._id,
      status: 'delivered',
      timestamp: new Date(),
      timeline: order.timeline
    });
    socketService.emitToAdmin('order:status', {
      orderId: order._id,
      status: 'delivered',
      totalAmount: order.totalAmount,
      amount: order.totalAmount,
      timestamp: new Date(),
      timeline: order.timeline
    });
    try {
      const notificationService = require('../utils/notificationService');
      await notificationService.sendNotification(
        order.customer,
        'Order Delivered',
        'Your order has been delivered successfully'
      );
    } catch (notifErr) {
      console.error('Notification failed:', notifErr.message);
    }
    res.status(200).json({ success: true, message: "Order Delivered Successfully!", order });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};
exports.riderArrivedRestaurant = async (req, res) => {
  try {
    const Order = require('../models/Order');
    const order = await Order.findById(req.params.id);
    const riderProfile = await Rider.findOne({ user: req.user._id });
    if (!riderProfile) {
      return res.status(403).json({ message: "Rider profile not found" });
    }
    if (
      !order ||
      !order.rider ||
      order.rider.toString() !== riderProfile._id.toString()
    )
      return res.status(403).json({ message: "Not assigned to you" });
    if (order.status !== "assigned") {
      return res.status(400).json({
        message: "Order must be in assigned status to mark restaurant arrival",
        currentStatus: order.status,
      });
    }
    order.status = "reached_restaurant";
    order.timeline.push({
      status: "reached_restaurant",
      label: "Rider at Restaurant",
      description: "Rider has arrived at restaurant — waiting for pickup OTP",
      by: "rider",
      timestamp: new Date(),
    });
    await order.save();
    try {
      const restaurantDoc = await Restaurant.findById(order.restaurant).select('owner contactNumber');
      if (restaurantDoc?.owner) {
        const ownerUser = await User.findById(restaurantDoc.owner).select('mobile');
        if (ownerUser?.mobile) await sendOTP(ownerUser.mobile, order.pickupOtp);
      } else if (restaurantDoc?.contactNumber) {
        await sendOTP(restaurantDoc.contactNumber, order.pickupOtp);
      }
    } catch (smsErr) {
      console.error('SMS Gateway failed (arriveRestaurant pickupOtp to restaurant):', smsErr.message);
    }
    socketService.emitToCustomer(order.customer.toString(), 'order:status', {
      orderId: order._id,
      status: 'reached_restaurant',
      timestamp: new Date(),
      timeline: order.timeline
    });
    socketService.emitToRestaurant(order.restaurant.toString(), 'order:status', {
      orderId: order._id,
      status: 'reached_restaurant',
      timestamp: new Date(),
      timeline: order.timeline,
      message: 'Rider has arrived — please verify pickup OTP'
    });
    socketService.emitToAdmin('order:status', {
      orderId: order._id,
      status: 'reached_restaurant',
      totalAmount: order.totalAmount,
      amount: order.totalAmount,
      timestamp: new Date(),
      timeline: order.timeline
    });
    try {
      const notificationService = require('../utils/notificationService');
      const Restaurant = require('../models/Restaurant');
      const restaurantDoc = await Restaurant.findById(order.restaurant).select('owner');
      if (restaurantDoc?.owner) {
        await notificationService.sendNotification(
          restaurantDoc.owner,
          'Rider Arrived',
          'Rider has arrived at restaurant — verify pickup OTP'
        );
      }
    } catch (notifErr) {
      console.error('Notification failed:', notifErr.message);
    }
    res.status(200).json({ message: "Arrived at restaurant", order });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};
exports.riderArrivedCustomer = async (req, res) => {
  try {
    const Order = require('../models/Order');
    const order = await Order.findById(req.params.id);
    const riderProfile = await Rider.findOne({ user: req.user._id });
    if (!riderProfile) {
      return res.status(403).json({ message: "Rider profile not found" });
    }
    if (
      !order ||
      !order.rider ||
      order.rider.toString() !== riderProfile._id.toString()
    )
      return res.status(403).json({ message: "Not assigned to you" });
    if (order.status !== "picked_up") {
      return res.status(400).json({
        message: "Order must be picked up before marking arrival at customer",
        currentStatus: order.status,
      });
    }
    order.status = "delivery_arrived";
    order.timeline.push({
      status: "delivery_arrived",
      label: "Rider Arrived",
      description: "Rider has arrived at your location — please share delivery OTP",
      by: "rider",
      timestamp: new Date(),
    });
    await order.save();
    try {
      const customerUser = await User.findById(order.customer).select('mobile');
      if (customerUser?.mobile) await sendOTP(customerUser.mobile, order.deliveryOtp);
    } catch (smsErr) {
      console.error('SMS Gateway failed (arriveCustomer deliveryOtp reminder):', smsErr.message);
    }
    socketService.emitToCustomer(order.customer.toString(), 'order:status', {
      orderId: order._id,
      status: 'delivery_arrived',
      timestamp: new Date(),
      timeline: order.timeline,
      message: 'Your rider has arrived — please share your delivery OTP'
    });
    socketService.emitToRestaurant(order.restaurant.toString(), 'order:status', {
      orderId: order._id,
      status: 'delivery_arrived',
      timestamp: new Date(),
      timeline: order.timeline
    });
    socketService.emitToAdmin('order:status', {
      orderId: order._id,
      status: 'delivery_arrived',
      totalAmount: order.totalAmount,
      amount: order.totalAmount,
      timestamp: new Date(),
      timeline: order.timeline
    });
    try {
      const notificationService = require('../utils/notificationService');
      await notificationService.sendNotification(
        order.customer,
        'Rider Arrived',
        'Your rider has arrived — please share your delivery OTP'
      );
    } catch (notifErr) {
      console.error('Notification failed:', notifErr.message);
    }
    res.status(200).json({ message: "Arrived at customer location", order });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};
exports.resendPickupOTP = async (req, res) => {
  try {
    const orderId = req.params.id;
    const Order = require('../models/Order');
    const order = await Order.findById(orderId);
    if (!order) return res.status(404).json({ message: "Order not found" });
    const riderProfile = await Rider.findOne({ user: req.user._id });
    if (!riderProfile) return res.status(404).json({ message: "Rider profile not found" });
    if (!order.rider || order.rider.toString() !== riderProfile._id.toString()) {
      return res.status(403).json({ message: "This order is not assigned to you" });
    }
    const allowedStatuses = ['assigned', 'reached_restaurant'];
    if (!allowedStatuses.includes(order.status)) {
      return res.status(400).json({
        message: `Pickup OTP can only be resent before pickup. Current status: ${order.status}`,
      });
    }
    const newOtp = Math.floor(1000 + Math.random() * 9000).toString();
    order.pickupOtp = newOtp;
    order.pickupOtpExpiresAt = new Date(Date.now() + 100 * 60 * 1000);
    await order.save();
    try {
      const restaurantDoc = await Restaurant.findById(order.restaurant).select('owner contactNumber');
      if (restaurantDoc?.owner) {
        const ownerUser = await User.findById(restaurantDoc.owner).select('mobile');
        if (ownerUser?.mobile) await sendOTP(ownerUser.mobile, newOtp);
      } else if (restaurantDoc?.contactNumber) {
        await sendOTP(restaurantDoc.contactNumber, newOtp);
      }
    } catch (smsErr) {
      console.error('SMS Gateway failed (resendPickupOTP to restaurant):', smsErr.message);
    }
    socketService.emitToRestaurant(order.restaurant.toString(), 'order:pickup_otp_resent', {
      orderId: order._id,
      message: 'Rider has requested a new pickup OTP',
    });
    res.status(200).json({ success: true, message: "Pickup OTP resent to restaurant", expiresAt: order.pickupOtpExpiresAt });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};
exports.resendDeliveryOTP = async (req, res) => {
  try {
    const orderId = req.params.id;
    const Order = require('../models/Order');
    const order = await Order.findById(orderId);
    if (!order) return res.status(404).json({ message: "Order not found" });
    const riderProfile = await Rider.findOne({ user: req.user._id });
    if (!riderProfile) return res.status(404).json({ message: "Rider profile not found" });
    if (!order.rider || order.rider.toString() !== riderProfile._id.toString()) {
      return res.status(403).json({ message: "This order is not assigned to you" });
    }
    const allowedStatuses = ['picked_up', 'delivery_arrived'];
    if (!allowedStatuses.includes(order.status)) {
      return res.status(400).json({
        message: `Delivery OTP can only be resent after pickup. Current status: ${order.status}`,
      });
    }
    const newOtp = Math.floor(1000 + Math.random() * 9000).toString();
    order.deliveryOtp = newOtp;
    order.deliveryOtpExpiresAt = new Date(Date.now() + 100 * 60 * 1000);
    await order.save();
    try {
      const customerUser = await User.findById(order.customer).select('mobile');
      if (customerUser?.mobile) await sendOTP(customerUser.mobile, newOtp);
    } catch (smsErr) {
      console.error('SMS Gateway failed (resendDeliveryOTP to customer):', smsErr.message);
    }
    socketService.emitToCustomer(order.customer.toString(), 'order:delivery_otp_resent', {
      orderId: order._id,
      message: 'Your delivery OTP has been resent',
    });
    res.status(200).json({ success: true, message: "Delivery OTP resent to customer", expiresAt: order.deliveryOtpExpiresAt });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};
exports.riderCollectCash = async (req, res) => {
  try {
    const Order = require('../models/Order');
    const { amount } = req.body;
    const order = await Order.findById(req.params.id);
    const riderProfile = await Rider.findOne({ user: req.user._id });
    if (!riderProfile) {
      return res.status(403).json({ message: "Rider profile not found" });
    }
    if (
      !order ||
      !order.rider ||
      order.rider.toString() !== riderProfile._id.toString()
    )
      return res.status(403).json({ message: "Not assigned to you" });
    if (order.paymentMethod !== "cod")
      return res.status(400).json({ message: "Order is not Cash On Delivery" });
    const collected = Number(amount || order.totalAmount);
    order.cashCollected = collected;
    order.cashCollectedAt = new Date();
    order.cashCollectedBy = riderProfile._id; // store rider user id
    order.paymentStatus = 'paid';
    await order.save();
    const socketService = require('../services/socketService');
    socketService.emitToCustomer(order.customer.toString(), 'order:status', {
      orderId: order._id,
      status: order.status,
      paymentStatus: 'paid',
      timestamp: new Date(),
      timeline: order.timeline
    });
    socketService.emitToRestaurant(order.restaurant.toString(), 'order:status', {
      orderId: order._id,
      status: order.status,
      paymentStatus: 'paid',
      timestamp: new Date(),
      timeline: order.timeline
    });
    socketService.emitToAdmin('order:status', {
      orderId: order._id,
      status: order.status,
      paymentStatus: 'paid',
      totalAmount: order.totalAmount,
      amount: order.totalAmount,
      timestamp: new Date(),
      timeline: order.timeline
    });
    res.status(200).json({ message: "Cash collected recorded", order });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};
exports.getAvailableOrders = async (req, res) => {
  try {
    const riderProfile = await Rider.findOne({ user: req.user._id });
    if (!riderProfile) {
      return res.status(400).json({ message: "Rider profile missing" });
    }
    if (
      !riderProfile.currentLocation ||
      !riderProfile.currentLocation.coordinates ||
      riderProfile.currentLocation.coordinates.length !== 2
    ) {
      return res.status(400).json({ message: "Rider location not set. Please update your location." });
    }
    const riderCoords = riderProfile.currentLocation.coordinates;
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.min(50, parseInt(req.query.limit) || 20); // Max 50, default 20
    const skip = (page - 1) * limit;
    const nearbyRestaurants = await Restaurant.find({
      location: {
        $near: {
          $geometry: { type: "Point", coordinates: riderCoords },
          $maxDistance: 100000, // 100km
        },
      },
    }).select('_id');
    const restaurantIds = nearbyRestaurants.map(r => r._id);
    const sixHoursAgo = new Date(Date.now() - 6 * 60 * 60 * 1000);
    const nearbyOrders = await Order.find({
      status: { $in: ["accepted", "preparing", "ready"] }, // ✅ FIXED: Include preparing
      rider: null,         // ✅ Unassigned
      restaurant: { $in: restaurantIds },
      createdAt: { $gte: sixHoursAgo }
    })
      .populate("restaurant", "name address image bannerImage location")
      .populate("customer", "address")
      .sort({ createdAt: -1 }) // Newest first
      .skip(skip)              // ✅ ADD: Pagination - skip
      .limit(limit);           // ✅ ADD: Pagination - limit
    const totalOrders = await Order.countDocuments({
      status: { $in: ["accepted", "preparing", "ready"] }, // ✅ FIXED: Match the find query
      rider: null,
      restaurant: { $in: restaurantIds },
      createdAt: { $gte: sixHoursAgo }
    });
    for (const order of nearbyOrders) {
      const notifEntry = order.riderNotificationStatus?.notifiedRiders?.find(
        r => r.riderId.toString() === riderProfile._id.toString()
      );
      if (notifEntry && notifEntry.status === 'sent') {
        notifEntry.status = 'opened';
        await order.save();
      }
    }
    const formatted = nearbyOrders.map(o => {
      const restaurantCoords = o.restaurant?.location?.coordinates;
      const customerCoords = o.deliveryAddress?.coordinates;
      const pickupDistance = restaurantCoords && restaurantCoords.length === 2
        ? calculateDistance(riderCoords, restaurantCoords)
        : null;
      const deliveryDistance = restaurantCoords && customerCoords && customerCoords.length === 2
        ? calculateDistance(restaurantCoords, customerCoords)
        : null;
      const totalDistance = (pickupDistance || 0) + (deliveryDistance || 0);
      return {
        _id: o._id,
        orderId: o._id,
        restaurantName: o.restaurant.name.en || o.restaurant.name,
        restaurantAddress: o.restaurant.address,
        restaurantLocation: {
          coordinates: restaurantCoords,
          type: "Point"
        },
        customerAddress: o.deliveryAddress ? o.deliveryAddress.addressLine : 'Unknown',
        customerLocation: {
          coordinates: customerCoords,
          type: "Point"
        },
        earning: typeof o.riderEarning === 'number'
          ? o.riderEarning
          : (o.riderCommission || 0) + (o.tip || 0),
        tip: o.tip || 0,
        totalAmount: o.totalAmount,
        status: o.status,
        createdAt: o.createdAt,
        distances: {
          pickupDistance: pickupDistance ? Math.round(pickupDistance * 100) / 100 : null, // Rider to Restaurant (km)
          deliveryDistance: deliveryDistance ? Math.round(deliveryDistance * 100) / 100 : null, // Restaurant to Customer (km)
          totalDistance: totalDistance ? Math.round(totalDistance * 100) / 100 : null, // Total (km)
          totalDistanceMeters: totalDistance ? Math.round(totalDistance * 1000) : null // In meters
        },
        estimatedTime: {
          pickupMinutes: pickupDistance ? Math.ceil(pickupDistance / 1) : null, // Assuming 1kmpm avg speed
          deliveryMinutes: deliveryDistance ? Math.ceil(deliveryDistance / 1) : null,
          totalMinutes: totalDistance ? Math.ceil(totalDistance / 1) : null
        }
      };
    });
    res.status(200).json({
      success: true,
      data: formatted,
      pagination: {
        currentPage: page,
        pageSize: limit,
        totalOrders: totalOrders,
        totalPages: Math.ceil(totalOrders / limit),
        hasNextPage: skip + limit < totalOrders,
        hasPreviousPage: page > 1
      }
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};
exports.acceptOrder = async (req, res) => {
  try {
    const orderId = req.params.id;
    const riderUserId = req.user._id;
    const riderProfile = await Rider.findOne({ user: riderUserId });
    if (!riderProfile) {
      return res.status(404).json({ message: "Rider profile not found" });
    }
    const riderId = riderProfile._id;
    const activeOrder = await Order.findOne({
      rider: riderId,
      status: { $in: ['assigned', 'reached_restaurant', 'picked_up', 'delivery_arrived'] }
    });
    if (activeOrder) {
      return res.status(400).json({
        message: "You already have an active delivery",
        activeOrderId: activeOrder._id,
        currentStatus: activeOrder.status,
        suggestion: "Complete or cancel current order first"
      });
    }
    const orderToValidate = await Order.findById(orderId);
    if (!orderToValidate) {
      return res.status(404).json({ message: "Order not found" });
    }
    const acceptableStatuses = ['accepted', 'preparing', 'ready'];
    if (!acceptableStatuses.includes(orderToValidate.status)) {
      return res.status(400).json({
        message: "Order not available for acceptance",
        error: `Order must be in one of these stages: ${acceptableStatuses.join(', ')}`,
        currentStatus: orderToValidate.status
      });
    }
    if (orderToValidate.status === 'cancelled') {
      return res.status(400).json({ message: "Order has been cancelled" });
    }
    const order = await Order.findOneAndUpdate(
      {
        _id: orderId,
        rider: null,
        status: { $in: acceptableStatuses }  // ✅ FIXED: Allow multiple statuses
      },
      {
        $set: {
          rider: riderId,
          status: "assigned",       // ✅ FIXED: Change to "assigned" when rider accepts
          "riderNotificationStatus.acceptedBy": riderId
        },
        $push: {
          timeline: {
            status: "assigned",
            timestamp: new Date(),
            label: "Rider Assigned",
            by: "rider",
            description: "Rider has accepted the order and is on the way"
          },
        },
      },
      {
        new: true,
      },
    );
    if (!order) {
      return res
        .status(409)
        .json({ message: "Too late! This order was already taken or status changed." });
    }
    if (order.riderNotificationStatus?.notifiedRiders) {
      const notifEntry = order.riderNotificationStatus.notifiedRiders.find(
        r => r.riderId.toString() === riderId.toString()
      );
      if (notifEntry) {
        notifEntry.status = 'accepted';
        await order.save();
      }
    }
    const RideRequest = require('../models/RideRequest');
    await RideRequest.updateMany(
      { rider: riderId, status: 'pending', order: { $ne: order._id } },
      { $set: { status: 'rejected' } }
    );
    const { logRiderAssignment, logOrderTransition } = require("../utils/logger");
    logRiderAssignment(order._id, riderId, order.restaurant, "manual");
    logOrderTransition(
      order._id,
      orderToValidate.status,  // Old status (accepted/preparing/ready)
      "assigned",              // New status
      riderUserId,
      "rider",
    );
    await Rider.findOneAndUpdate({ user: riderUserId }, { isAvailable: false });
    try {
      await sendNotification(
        order.customer,
        "Rider Assigned",
        "A rider has accepted your order.",
      );
    } catch (e) { }
    try {
      const populatedOrder = await Order.findById(order._id)
        .populate("customer", "name")
        .populate("restaurant", "name")
        .populate("rider");
      const assignmentData = {
        orderId: order._id,
        riderId: riderId,
        riderName: riderProfile.name || "Rider",
        status: "assigned",
        timestamp: new Date(),
      };
      socketService.emitToCustomer(
        order.customer.toString(),
        "order:rider_assigned",
        {
          ...assignmentData,
          message: `Rider is on the way to pick up your order`
        },
      );
      socketService.emitToRestaurant(
        order.restaurant.toString(),
        "order:rider_assigned",
        {
          ...assignmentData,
          message: "Rider assigned - prepare for pickup"
        },
      );
      socketService.emitToAdmin("order:rider_assigned", {
        ...assignmentData,
        customerName: populatedOrder.customer.name,
        restaurantName: populatedOrder.restaurant.name,
        orderId: order._id.toString(),
        riderId: riderId.toString(),
        orderStatus: "assigned",
        riderLocation: riderProfile.currentLocation?.coordinates ? {
          latitude: riderProfile.currentLocation.coordinates[1],
          longitude: riderProfile.currentLocation.coordinates[0]
        } : null
      });
      const riderAcceptedPayload = {
        riderId: riderProfile._id.toString(),
        riderUserId: riderUserId.toString(),
        riderName: riderProfile.name,
        orderId: order._id.toString(),
        customerName: populatedOrder.customer.name,
        restaurantName: populatedOrder.restaurant.name,
        orderStatus: "assigned",
        timestamp: new Date(),
        action: "accepted_order",
        location: riderProfile.currentLocation?.coordinates ? {
          latitude: riderProfile.currentLocation.coordinates[1],
          longitude: riderProfile.currentLocation.coordinates[0],
          type: "Point"
        } : null,
        lastLocationUpdate: riderProfile.lastLocationUpdateAt || new Date()
      };
      console.log('🚀 EMITTING rider:order_accepted to admin:', JSON.stringify(riderAcceptedPayload, null, 2));
      socketService.emitToAdmin("rider:order_accepted", riderAcceptedPayload);
      socketService.emitToRider(riderProfile._id.toString(), "order:accepted", {
        ...assignmentData,
        message: "Order accepted - proceed to restaurant",
      });
      const riderCoords = riderProfile.currentLocation?.coordinates;
      if (riderCoords && riderCoords.length === 2) {
        const locationUtils = require('../utils/locationUtils');
        const [initialLong, initialLat] = riderCoords;
        const initialEta = order.deliveryAddress?.coordinates
          ? locationUtils.calculateETA([initialLong, initialLat], order.deliveryAddress.coordinates, 'assigned')
          : null;
        socketService.emitToCustomer(order.customer.toString(), 'rider:location_updated', {
          orderId: order._id,
          riderLocation: {
            lat: initialLat,
            long: initialLong
          },
          eta: initialEta,
          timestamp: new Date()
        });
        socketService.emitToOrder(order._id.toString(), 'rider:location', {
          riderId: riderUserId.toString(),
          latitude: initialLat,
          longitude: initialLong,
          eta: initialEta,
          timestamp: new Date()
        });
        socketService.emitToAdmin('rider:location_updated', {
          riderId: riderProfile._id.toString(),
          riderName: riderProfile.name || 'Rider',
          latitude: initialLat,
          longitude: initialLong,
          activeOrders: 1,
          timestamp: new Date()
        });
      }
    } catch (socketError) {
      console.error("Socket emission error:", socketError);
    }
    const restaurantCoords = order.restaurant?.location?.coordinates;
    const riderCoords = riderProfile.currentLocation?.coordinates;
    const customerCoords = order.deliveryAddress?.coordinates;
    let distanceInfo = null;
    if (restaurantCoords && riderCoords && customerCoords) {
      const pickupDistance = calculateDistance(riderCoords, restaurantCoords);
      const deliveryDistance = calculateDistance(restaurantCoords, customerCoords);
      const totalDistance = pickupDistance + deliveryDistance;
      distanceInfo = {
        pickupDistance: Math.round(pickupDistance * 100) / 100,
        deliveryDistance: Math.round(deliveryDistance * 100) / 100,
        totalDistance: Math.round(totalDistance * 100) / 100,
        totalDistanceMeters: Math.round(totalDistance * 1000),
        estimatedTime: {
          pickupMinutes: Math.ceil(pickupDistance / 1),
          deliveryMinutes: Math.ceil(deliveryDistance / 1),
          totalMinutes: Math.ceil(totalDistance / 1)
        }
      };
    }
    res.status(200).json({
      message: "Order Accepted! Go pick it up.",
      order,
      ...(distanceInfo && { distances: distanceInfo })
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};
exports.rejectOrder = async (req, res) => {
  try {
    const orderId = req.params.id;
    const riderUserId = req.user._id;
    const { reason } = req.body;
    if (!reason || reason.trim().length === 0) {
      return res.status(400).json({
        message: "Please provide a reason for rejecting this order"
      });
    }
    const riderProfile = await Rider.findOne({ user: riderUserId });
    if (!riderProfile) {
      return res.status(404).json({ message: "Rider profile not found" });
    }
    const riderId = riderProfile._id;
    const order = await Order.findById(orderId)
      .populate('customer', 'name')
      .populate('restaurant', 'name');
    if (!order) {
      return res.status(404).json({ message: "Order not found" });
    }
    const rejectableStatuses = ['accepted', 'preparing', 'ready'];
    if (!rejectableStatuses.includes(order.status)) {
      return res.status(400).json({
        message: "Order cannot be rejected at this stage",
        currentStatus: order.status
      });
    }
    if (order.rider && order.rider.toString() !== riderId.toString()) {
      return res.status(400).json({
        message: "This order has been assigned to another rider"
      });
    }
    if (order.riderNotificationStatus?.notifiedRiders) {
      const notifEntry = order.riderNotificationStatus.notifiedRiders.find(
        r => r.riderId.toString() === riderId.toString()
      );
      if (notifEntry) {
        notifEntry.status = 'rejected';
        notifEntry.rejectedAt = new Date();
        notifEntry.rejectionReason = reason;
      } else {
        order.riderNotificationStatus.notifiedRiders.push({
          riderId: riderId,
          status: 'rejected',
          notifiedAt: new Date(),
          rejectedAt: new Date(),
          rejectionReason: reason
        });
      }
      await order.save();
    }
    await Rider.findByIdAndUpdate(riderId, {
      $inc: { cancelledOrders: 1 }
    });
    const { logRiderAction } = require("../utils/logger");
    logRiderAction(order._id, riderId, "rejected", reason);
    try {
      socketService.emitToAdmin("rider:order_rejected", {
        riderId: riderId.toString(),
        riderUserId: riderUserId.toString(),
        riderName: riderProfile.name,
        orderId: order._id.toString(),
        customerName: order.customer?.name || "Customer",
        restaurantName: order.restaurant?.name || "Restaurant",
        orderStatus: order.status,
        reason: reason,
        timestamp: new Date(),
        action: "rejected_order"
      });
      socketService.emitToRestaurant(
        order.restaurant._id.toString(),
        "rider:order_rejected",
        {
          orderId: order._id,
          riderName: riderProfile.name,
          reason: reason,
          message: "Rider rejected the order - finding another rider",
          timestamp: new Date()
        }
      );
      socketService.emitToOrder(
        order._id.toString(),
        "order:rider_rejected",
        {
          orderId: order._id,
          riderId: riderId,
          riderName: riderProfile.name,
          reason: reason,
          timestamp: new Date()
        }
      );
    } catch (socketError) {
      console.error("Socket emission error:", socketError);
    }
    const riderDispatchService = require('../services/riderDispatchService');
    try {
      await riderDispatchService.dispatchToNearbyRiders(order._id);
    } catch (dispatchError) {
      console.error("Re-dispatch error:", dispatchError);
    }
    res.status(200).json({
      success: true,
      message: "Order rejected successfully",
      orderId: order._id,
      reason: reason,
      note: "Order will be offered to other available riders"
    });
  } catch (error) {
    console.error("Reject order error:", error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};
exports.getMyActiveOrder = async (req, res) => {
  try {
    const riderUserId = req.user._id;
    const riderProfile = await Rider.findOne({ user: riderUserId });
    if (!riderProfile) {
      return res.status(404).json({ message: "Rider profile not found" });
    }
    const order = await Order.findOne({
      rider: riderProfile._id,
      status: { $in: ['assigned', 'reached_restaurant', 'picked_up', 'delivery_arrived'] }
    })
      .populate('customer', 'name phone')
      .populate('restaurant', 'name address location contactNumber')
      .populate('rider', 'user currentLocation vehicle')
      .populate('rider.user', 'name mobile');
    if (!order) {
      return res.status(200).json({
        success: true,
        hasActiveOrder: false,
        message: "No active delivery at the moment"
      });
    }
    const { calculateDistance } = require('../utils/locationUtils');
    const riderCoords = riderProfile.currentLocation?.coordinates;
    const restaurantCoords = order.restaurant?.location?.coordinates;
    const customerCoords = order.deliveryAddress?.coordinates;
    let distanceInfo = null;
    if (riderCoords && restaurantCoords && customerCoords) {
      const distanceToRestaurant = calculateDistance(riderCoords, restaurantCoords);
      const distanceToCustomer = calculateDistance(riderCoords, customerCoords);
      const totalDistance = distanceToRestaurant + distanceToCustomer;
      distanceInfo = {
        toRestaurant: {
          km: Math.round(distanceToRestaurant * 100) / 100,
          meters: Math.round(distanceToRestaurant * 1000),
          etaMinutes: Math.ceil(distanceToRestaurant / 0.33) // 20 km/h = 0.33 km/min
        },
        toCustomer: {
          km: Math.round(distanceToCustomer * 100) / 100,
          meters: Math.round(distanceToCustomer * 1000),
          etaMinutes: Math.ceil(distanceToCustomer / 0.33)
        },
        total: {
          km: Math.round(totalDistance * 100) / 100,
          meters: Math.round(totalDistance * 1000),
          etaMinutes: Math.ceil(totalDistance / 0.33)
        }
      };
    }
    let nextAction = {
      action: '',
      instruction: '',
      requiredOtp: null
    };
    switch (order.status) {
      case 'assigned':
        nextAction = {
          action: 'GO_TO_RESTAURANT',
          instruction: 'Navigate to restaurant to pick up the order',
          endpoint: `/api/riders/orders/${order._id}/arrive-restaurant`,
          requiredOtp: null
        };
        break;
      case 'picked_up':
        nextAction = {
          action: 'GO_TO_CUSTOMER',
          instruction: 'Navigate to customer to deliver the order',
          endpoint: `/api/riders/orders/${order._id}/arrive-customer`,
          requiredOtp: null
        };
        break;
      case 'delivery_arrived':
        nextAction = {
          action: 'VERIFY_DELIVERY',
          instruction: 'Verify delivery OTP from customer to complete delivery',
          endpoint: '/api/riders/orders/verify-delivery',
          requiredOtp: 'deliveryOtp'
        };
        break;
    }
    const response = {
      success: true,
      hasActiveOrder: true,
      order: {
        _id: order._id,
        orderId: order.orderId,
        status: order.status,
        totalAmount: order.totalAmount,
        paymentMethod: order.paymentMethod,
        paymentStatus: order.paymentStatus,
        items: order.items.map(item => ({
          name: item.name,
          quantity: item.quantity,
          price: item.price
        })),
        restaurant: {
          _id: order.restaurant._id,
          name: order.restaurant.name,
          address: order.restaurant.address,
          phone: order.restaurant.contactNumber,
          location: order.restaurant.location
        },
        customer: {
          _id: order.customer._id,
          name: order.customer.name,
          phone: order.customer.phone,
          deliveryAddress: order.deliveryAddress
        },
        earnings: {
          riderEarning: order.riderEarning || 0,
          tip: order.tip || 0,
          total: (order.riderEarning || 0) + (order.tip || 0)
        },
        timeline: order.timeline,
        createdAt: order.createdAt,
        specialInstructions: order.specialInstructions || null,
        deliveryInstructions: order.deliveryInstructions || null
      },
      ...(distanceInfo && { distances: distanceInfo }),
      nextAction
    };
    res.status(200).json(response);
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};
