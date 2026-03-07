
const crypto = require('crypto');
const { sendOTP } = require('../services/smsService');
function generateOTP() {
  return Math.floor(100000 + Math.random() * 900000).toString();
}
function hashOTP(otp) {
  return crypto.createHash('sha256').update(otp).digest('hex');
}
async function sendOTPForProfileUpdate(destination, otp, type = 'email') {
  if (type === 'mobile') {
    try {
      await sendOTP(destination, otp);
    } catch (smsErr) {
      console.error('SMS Gateway failed (profileUpdate):', smsErr.message);
    }
  } else {
    console.log(`📧 OTP for email update to ${destination}: ${otp}`);
  }
}
async function initiateProfileUpdate(model, updates) {
  const otp = generateOTP();
  const hashedOtp = hashOTP(otp);
  const otpExpires = new Date(Date.now() + 5 * 60 * 1000); // 5 minutes
  if (!model.pendingUpdate) {
    model.pendingUpdate = {};
  }
  if (updates.email) {
    model.pendingUpdate.email = updates.email.trim().toLowerCase();
    sendOTPForProfileUpdate(updates.email, otp, 'email');
  }
  if (updates.mobile) {
    model.pendingUpdate.mobile = updates.mobile.trim();
    sendOTPForProfileUpdate(updates.mobile, otp, 'mobile');
  }
  if (updates.contactNumber) {
    model.pendingUpdate.contactNumber = updates.contactNumber.trim();
    sendOTPForProfileUpdate(updates.contactNumber, otp, 'mobile');
  }
  model.pendingUpdate.otp = hashedOtp;
  model.pendingUpdate.otpExpires = otpExpires;
  model.pendingUpdate.otpAttempts = 0;
  await model.save();
  return {
    success: true,
    message: 'OTP sent successfully',
    testOtp: otp, // Remove in production
    expiresIn: '5 minutes',
    destination: updates.email || updates.mobile || updates.contactNumber
  };
}
async function verifyOTPAndApplyUpdate(model, providedOtp, parentModel = null) {
  if (!model.pendingUpdate || !model.pendingUpdate.otp) {
    return {
      success: false,
      message: 'No pending update found. Please request an update first.'
    };
  }
  if (new Date() > model.pendingUpdate.otpExpires) {
    model.pendingUpdate = {}; // Clear expired OTP
    await model.save();
    return {
      success: false,
      message: 'OTP has expired. Please request a new one.'
    };
  }
  if (model.pendingUpdate.otpAttempts >= 3) {
    model.pendingUpdate = {}; // Clear after max attempts
    await model.save();
    return {
      success: false,
      message: 'Too many failed attempts. Please request a new OTP.'
    };
  }
  const hashedProvided = hashOTP(providedOtp);
  if (hashedProvided !== model.pendingUpdate.otp) {
    model.pendingUpdate.otpAttempts += 1;
    await model.save();
    return {
      success: false,
      message: `Invalid OTP. ${3 - model.pendingUpdate.otpAttempts} attempts remaining.`
    };
  }
  const appliedUpdates = {};
  if (model.pendingUpdate.email) {
    if (parentModel) {
      parentModel.email = model.pendingUpdate.email;
      await parentModel.save();
    } else {
      model.email = model.pendingUpdate.email;
    }
    appliedUpdates.email = model.pendingUpdate.email;
  }
  if (model.pendingUpdate.mobile) {
    if (parentModel) {
      parentModel.mobile = model.pendingUpdate.mobile;
      await parentModel.save();
    }
    appliedUpdates.mobile = model.pendingUpdate.mobile;
  }
  if (model.pendingUpdate.contactNumber) {
    model.contactNumber = model.pendingUpdate.contactNumber;
    appliedUpdates.contactNumber = model.pendingUpdate.contactNumber;
  }
  model.pendingUpdate = {};
  await model.save();
  return {
    success: true,
    message: 'Profile updated successfully',
    appliedUpdates
  };
}
async function checkDuplicate(Model, field, value, excludeId) {
  const query = {
    [field]: value.trim().toLowerCase(),
    _id: { $ne: excludeId }
  };
  const exists = await Model.findOne(query);
  return !!exists;
}
module.exports = {
  generateOTP,
  hashOTP,
  sendOTPForProfileUpdate,
  initiateProfileUpdate,
  verifyOTPAndApplyUpdate,
  checkDuplicate
};
