const User = require("../models/User");
const Restaurant = require("../models/Restaurant");
const Rider = require("../models/Rider");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const crypto = require("crypto");
const { sendOTP } = require("../services/smsService");
const generateToken = (res, user) => {
  const token = jwt.sign(
    { _id: user._id, role: user.role },
    process.env.JWT_SECRET,
    { expiresIn: "7d" }
  );
  const options = {
    expires: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: process.env.NODE_ENV === "production" ? "none" : "lax",
  };
  res.cookie("token", token, options);
  return token;
};
exports.registerInitiate = async (req, res) => {
  try {
    const { name, email, password, mobile, role } = req.body;
    if (!name || !email || !password || !mobile) {
      return res.status(400).json({ message: "All fields are required" });
    }
    const allowedRoles = ["customer", "restaurant_owner", "rider"];
    if (role && !allowedRoles.includes(role)) {
      return res.status(400).json({ message: "Invalid role" });
    }
    const existingUser = await User.findOne({ $or: [{ email }, { mobile }] });
    if (existingUser && !existingUser.isDeleted) {
      return res
        .status(400)
        .json({ message: "User already registered. Please Login." });
    }
    const otp = crypto.randomInt(100000, 999999).toString();
    const otpExpires = new Date(Date.now() + 5 * 60 * 1000); // 5 mins
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);
    if (existingUser && existingUser.isDeleted) {
      existingUser.name = name;
      existingUser.email = email;
      existingUser.mobile = mobile;
      existingUser.password = hashedPassword;
      existingUser.role = role || existingUser.role || "customer";
      existingUser.otp = otp;
      existingUser.otpExpires = otpExpires;
      existingUser.isVerified = false;
      existingUser.isDeleted = false;
      existingUser.deletedAt = undefined;
      existingUser.isBlocked = false;
      existingUser.blockedAt = undefined;
      existingUser.blockReason = "";
      await existingUser.save();
    } else {
      await User.create({
        name,
        email,
        mobile,
        password: hashedPassword,
        role: role || "customer",
        otp: otp,
        otpExpires,
        isVerified: false,
      });
    }
    try {
      await sendOTP(mobile, otp);
    } catch (smsErr) {
      console.error("SMS Gateway failed (registerInitiate):", smsErr.message);
    }
    res.status(200).json({
      message: "OTP sent to mobile. Verify to complete registration.",
      mobile: mobile,
      testOtp: otp,
    });
  } catch (error) {
    console.error("Register Initiate Error:", error);
    res.status(500).json({ message: error.message });
  }
};
exports.registerVerify = async (req, res) => {
  try {
    const { mobile, otp } = req.body;
    if (!mobile || !otp) {
      return res.status(400).json({ message: "Mobile and OTP are required" });
    }
    const user = await User.findOne({ mobile });
    if (!user) {
      return res.status(400).json({ message: "User not found" });
    }
    if (user.isVerified) {
      return res
        .status(200)
        .json({ message: "User already verified. Please login." });
    }
    if (user.otpExpires < Date.now()) {
      return res
        .status(400)
        .json({ message: "OTP expired. Please register again." });
    }
    const isMatch = otp === user.otp;
    if (!isMatch) {
      return res.status(400).json({ message: "Invalid OTP" });
    }
    user.isVerified = true;
    user.otp = undefined;
    user.otpExpires = undefined;
    await user.save();
    const token = generateToken(res, user);
    res.status(200).json({
      message: "Registration Verified & Logged In Successfully",
      token,
      user: {
        _id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
      },
    });
  } catch (error) {
    console.error("Verify Error:", error);
    res.status(500).json({ message: error.message });
  }
};
exports.checkVerificationStatus = async (req, res) => {
  try {
    const { mobile, email } = req.body;
    if (!mobile && !email) {
      return res.status(400).json({ message: "Mobile or Email is required" });
    }
    const user = await User.findOne({
      $or: [
        { mobile: mobile || null },
        { email: email || null }
      ]
    });
    if (!user) {
      return res.status(404).json({
        message: "User not found",
        exists: false
      });
    }
    res.status(200).json({
      exists: true,
      isVerified: user.isVerified,
      name: user.name,
      email: user.email,
      mobile: user.mobile,
      needsOTP: !user.isVerified,
      message: user.isVerified
        ? "User is verified. You can login."
        : "User needs OTP verification. Call resend-otp endpoint."
    });
  } catch (error) {
    console.error("Check Status Error:", error);
    res.status(500).json({ message: error.message });
  }
};
exports.resendOTP = async (req, res) => {
  try {
    const { mobile, email } = req.body;
    if (!mobile && !email) {
      return res.status(400).json({ message: "Mobile or Email is required" });
    }
    const user = await User.findOne({
      $or: [
        { mobile: mobile || null },
        { email: email || null }
      ]
    });
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }
    if (user.isVerified) {
      return res.status(400).json({
        message: "User already verified. Please login."
      });
    }
    const newOtp = crypto.randomInt(100000, 999999).toString();
    const otpExpires = new Date(Date.now() + 5 * 60 * 1000); // 5 minutes
    user.otp = newOtp;
    user.otpExpires = otpExpires;
    await user.save();
    try {
      await sendOTP(user.mobile, newOtp);
    } catch (smsErr) {
      console.error("SMS Gateway failed (resendOTP):", smsErr.message);
    }
    res.status(200).json({
      message: "OTP resent successfully",
      mobile: user.mobile,
      email: user.email,
      testOtp: newOtp, // Remove in production
      expiresIn: "5 minutes"
    });
  } catch (error) {
    console.error("Resend OTP Error:", error);
    res.status(500).json({ message: error.message });
  }
};
exports.loginUser = async (req, res) => {
  try {
    const { email, mobile, password } = req.body;
    if ((!email && !mobile) || !password) {
      return res.status(400).json({ message: "Credentials required" });
    }
    const user = await User.findOne({
      $or: [
        { email: email || null },
        { mobile: mobile || null }
      ]
    });
    if (!user) return res.status(401).json({ message: "Invalid credentials" });
    if (user.isDeleted) {
      return res.status(403).json({ message: "Account is deleted" });
    }
    if (user.isBlocked) {
      return res.status(403).json({
        message: "Account is blocked",
        blockReason: user.blockReason || "",
      });
    }
    if (!user.isVerified) {
      return res
        .status(401)
        .json({
          message: "Account not verified. Please verify OTP first.",
          needsOTP: true,
          email: user.email,
          mobile: user.mobile,
          nextStep: "Call /resend-otp endpoint to get new OTP, then call /register/verify"
        });
    }
    const match = await bcrypt.compare(password, user.password);
    if (!match) return res.status(401).json({ message: "Invalid credentials" });
    const [restaurantDoc, riderDoc] = await Promise.all([
      Restaurant.findOne({ owner: user._id }).select("_id"),
      Rider.findOne({ user: user._id }).select("_id"),
    ]);
    const token = generateToken(res, user);
    res.status(200).json({
      token,
      user: {
        _id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
        restaurantId: restaurantDoc?._id || null,
        riderId: riderDoc?._id || null,
      },
      message: "Login Successfully",
    });
  } catch (err) {
    res.status(500).json({ message: "Server Error" + err });
  }
};
exports.logoutUser = (req, res) => {
  res.cookie("token", null, {
    expires: new Date(Date.now()),
    httpOnly: true,
  });
  res.status(200).json({ message: "Logged Out Successfully" });
};
exports.forgotPasswordInitiate = async (req, res) => {
  try {
    const { email, mobile } = req.body;
    if (!email && !mobile) {
      return res.status(400).json({ message: "Email or Mobile is required" });
    }
    const user = await User.findOne({
      $or: [
        { email: email || null },
        { mobile: mobile || null }
      ]
    });
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }
    if (!user.isVerified) {
      return res.status(400).json({
        message: "Account not verified. Complete registration first.",
        needsRegistration: true
      });
    }
    const otp = crypto.randomInt(100000, 999999).toString();
    const otpExpires = new Date(Date.now() + 10 * 60 * 1000); // 10 mins
    user.otp = otp;
    user.otpExpires = otpExpires;
    await user.save();
    try {
      await sendOTP(user.mobile, otp);
    } catch (smsErr) {
      console.error("SMS Gateway failed (forgotPasswordInitiate):", smsErr.message);
    }
    res.status(200).json({
      message: "Password reset OTP sent successfully",
      email: user.email,
      mobile: user.mobile,
      testOtp: otp, // Remove in production
      expiresIn: "10 minutes"
    });
  } catch (error) {
    console.error("Forgot Password Initiate Error:", error);
    res.status(500).json({ message: error.message });
  }
};
exports.resendForgotPasswordOTP = async (req, res) => {
  try {
    const { email, mobile } = req.body;
    if (!email && !mobile) {
      return res.status(400).json({ message: "Email or Mobile is required" });
    }
    const user = await User.findOne({
      $or: [
        { email: email || null },
        { mobile: mobile || null }
      ]
    });
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }
    if (!user.isVerified) {
      return res.status(400).json({
        message: "Account not verified. Complete registration first.",
        needsRegistration: true
      });
    }
    const otp = crypto.randomInt(100000, 999999).toString();
    const otpExpires = new Date(Date.now() + 10 * 60 * 1000); // 10 mins
    user.otp = otp;
    user.otpExpires = otpExpires;
    await user.save();
    try {
      await sendOTP(user.mobile, otp);
    } catch (smsErr) {
      console.error("SMS Gateway failed (resendForgotPasswordOTP):", smsErr.message);
    }
    res.status(200).json({
      message: "Password reset OTP resent successfully",
      email: user.email,
      mobile: user.mobile,
      testOtp: otp, // Remove in production
      expiresIn: "10 minutes"
    });
  } catch (error) {
    console.error("Resend Forgot Password OTP Error:", error);
    res.status(500).json({ message: error.message });
  }
};
exports.forgotPasswordVerifyOTP = async (req, res) => {
  try {
    const { email, mobile, otp } = req.body;
    if ((!email && !mobile) || !otp) {
      return res.status(400).json({ message: "Email/Mobile and OTP are required" });
    }
    const user = await User.findOne({
      $or: [
        { email: email || null },
        { mobile: mobile || null }
      ]
    });
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }
    if (!user.otp || user.otp !== otp) {
      return res.status(400).json({ message: "Invalid OTP" });
    }
    if (user.otpExpires < Date.now()) {
      return res.status(400).json({
        message: "OTP expired. Please request a new one.",
        expired: true
      });
    }
    const resetToken = jwt.sign(
      { _id: user._id, purpose: "reset-password" },
      process.env.JWT_SECRET,
      { expiresIn: "15m" }
    );
    user.otp = undefined;
    user.otpExpires = undefined;
    await user.save();
    res.status(200).json({
      message: "OTP verified successfully",
      resetToken,
      email: user.email,
      mobile: user.mobile,
      expiresIn: "15 minutes"
    });
  } catch (error) {
    console.error("Forgot Password Verify Error:", error);
    res.status(500).json({ message: error.message });
  }
};
exports.resetPassword = async (req, res) => {
  try {
    const { resetToken, newPassword } = req.body;
    if (!resetToken || !newPassword) {
      return res.status(400).json({ message: "Reset token and new password are required" });
    }
    if (newPassword.length < 6) {
      return res.status(400).json({ message: "Password must be at least 6 characters" });
    }
    let decoded;
    try {
      decoded = jwt.verify(resetToken, process.env.JWT_SECRET);
    } catch (err) {
      return res.status(400).json({ message: "Invalid or expired reset token" });
    }
    if (!decoded || decoded.purpose !== "reset-password") {
      return res.status(400).json({ message: "Invalid reset token" });
    }
    const user = await User.findById(decoded._id);
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(newPassword, salt);
    user.password = hashedPassword;
    await user.save();
    res.status(200).json({
      message: "Password reset successfully. You can now login with your new password.",
      email: user.email
    });
  } catch (error) {
    console.error("Reset Password Error:", error);
    res.status(500).json({ message: error.message });
  }
};
