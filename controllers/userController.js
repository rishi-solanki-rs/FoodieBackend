const mongoose = require('mongoose');
const User = require('../models/User');
const Product = require('../models/Product');
const Restaurant = require('../models/Restaurant');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const { getFileUrl } = require('../utils/upload');
const { sendOTP } = require('../services/smsService');
const isValidObjectId = (id) => mongoose.Types.ObjectId.isValid(id);
exports.getProfile = async (req, res) => {
    try {
        const user = await User.findById(req.user._id).select('-password');
        if (!user || user.isDeleted) {
            return res.status(404).json({ message: "User not found or account deleted" });
        }
        res.status(200).json(user);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};
exports.updateProfile = async (req, res) => {
    try {
        const { name, email, mobile, language } = req.body;
        const user = await User.findById(req.user._id);
        if (!user) return res.status(404).json({ message: "User not found" });
        const emailChanged = email && email !== user.email;
        const mobileChanged = mobile && mobile !== user.mobile;
        if (emailChanged || mobileChanged) {
            if (emailChanged) {
                const existingEmail = await User.findOne({
                    email,
                    _id: { $ne: user._id }
                });
                if (existingEmail) {
                    return res.status(400).json({
                        message: "Email already in use by another account"
                    });
                }
                const existingRestaurantEmail = await Restaurant.findOne({
                    email,
                    owner: { $ne: user._id }
                });
                if (existingRestaurantEmail) {
                    return res.status(400).json({
                        message: "Email already in use by another restaurant"
                    });
                }
            }
            if (mobileChanged) {
                const existingMobile = await User.findOne({
                    mobile,
                    _id: { $ne: user._id }
                });
                if (existingMobile) {
                    return res.status(400).json({
                        message: "Mobile number already in use by another account"
                    });
                }
            }
            const otp = crypto.randomInt(100000, 999999).toString();
            const otpExpires = new Date(Date.now() + 5 * 60 * 1000); // 5 minutes
            user.pendingProfileUpdate = {
                email: emailChanged ? email : undefined,
                mobile: mobileChanged ? mobile : undefined,
                name: name || undefined,
                language: language || undefined,
                profilePic: req.file ? getFileUrl(req.file) : undefined
            };
            user.otp = otp;
            user.otpExpires = otpExpires;
            await user.save();
            if (mobileChanged) {
                try {
                    await sendOTP(mobile, otp);
                } catch (smsErr) {
                    console.error('SMS Gateway failed (profileUpdate mobile):', smsErr.message);
                }
            }
            if (emailChanged) {
                console.log(`📧 OTP for email update (${email}) is: ${otp}`);
            }
            return res.status(200).json({
                message: "OTP sent to verify your new contact information",
                requiresOTP: true,
                updatedFields: {
                    email: emailChanged,
                    mobile: mobileChanged
                },
                testOtp: otp, // Remove in production
                expiresIn: "5 minutes"
            });
        }
        if (name) user.name = name;
        if (language) user.language = language;
        if (req.file) {
            user.profilePic = getFileUrl(req.file);
        }
        await user.save();
        res.status(200).json({ message: "Profile updated successfully", user });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};
exports.verifyProfileUpdateOTP = async (req, res) => {
    try {
        const { otp } = req.body;
        const user = await User.findById(req.user._id);
        if (!user) {
            return res.status(404).json({ message: "User not found" });
        }
        if (!user.otp || !user.otpExpires) {
            return res.status(400).json({
                message: "No pending profile update. Please initiate profile update first."
            });
        }
        if (user.otpExpires < Date.now()) {
            user.otp = undefined;
            user.otpExpires = undefined;
            user.pendingProfileUpdate = undefined;
            await user.save();
            return res.status(400).json({
                message: "OTP expired. Please request a new one."
            });
        }
        if (otp !== user.otp) {
            return res.status(400).json({ message: "Invalid OTP" });
        }
        if (user.pendingProfileUpdate) {
            const updates = user.pendingProfileUpdate;
            if (updates.email) user.email = updates.email;
            if (updates.mobile) user.mobile = updates.mobile;
            if (updates.name) user.name = updates.name;
            if (updates.language) user.language = updates.language;
            if (updates.profilePic) user.profilePic = updates.profilePic;
        }
        user.otp = undefined;
        user.otpExpires = undefined;
        user.pendingProfileUpdate = undefined;
        await user.save();
        if (user.email) {
            await Restaurant.updateMany(
                { owner: user._id },
                { $set: { email: user.email } }
            );
        }
        res.status(200).json({
            message: "Profile updated successfully",
            user: {
                _id: user._id,
                name: user.name,
                email: user.email,
                mobile: user.mobile,
                language: user.language,
                profilePic: user.profilePic
            }
        });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};
exports.resendProfileUpdateOTP = async (req, res) => {
    try {
        const user = await User.findById(req.user._id);
        if (!user) {
            return res.status(404).json({ message: "User not found" });
        }
        if (!user.pendingProfileUpdate) {
            return res.status(400).json({
                message: "No pending profile update found"
            });
        }
        const newOtp = crypto.randomInt(100000, 999999).toString();
        const otpExpires = new Date(Date.now() + 5 * 60 * 1000);
        user.otp = newOtp;
        user.otpExpires = otpExpires;
        await user.save();
        if (updates.mobile) {
            try {
                await sendOTP(updates.mobile, newOtp);
            } catch (smsErr) {
                console.error('SMS Gateway failed (profileUpdate resend mobile):', smsErr.message);
            }
        }
        if (updates.email) {
            console.log(`📧 Resend OTP for email update (${updates.email}) is: ${newOtp}`);
        }
        res.status(200).json({
            message: "OTP resent successfully",
            testOtp: newOtp, // Remove in production
            expiresIn: "5 minutes"
        });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};
exports.addAddress = async (req, res) => {
    try {
        const {
            label, addressLine, city, zipCode,
            location, deliveryInstructions, isDefault
        } = req.body;
        const user = await User.findById(req.user._id);
        if (isDefault) {
            user.savedAddresses.forEach(a => a.isDefault = false);
        }
        user.savedAddresses.push({
            label, addressLine, city, zipCode, location, deliveryInstructions, isDefault
        });
        await user.save();
        res.status(201).json({ message: "Address added", addresses: user.savedAddresses });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};
exports.getAddresses = async (req, res) => {
    try {
        const user = await User.findById(req.user._id).select('savedAddresses');
        if (!user) return res.status(404).json({ message: "User not found" });
        res.status(200).json({ addresses: user.savedAddresses || [] });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};
exports.updateAddress = async (req, res) => {
    try {
        const user = await User.findById(req.user._id);
        const address = user.savedAddresses.id(req.params.id);
        if (!address) return res.status(404).json({ message: "Address not found" });
        const updates = req.body;
        if (updates.label) address.label = updates.label;
        if (updates.addressLine) address.addressLine = updates.addressLine;
        if (updates.city) address.city = updates.city;
        if (updates.zipCode) address.zipCode = updates.zipCode;
        if (updates.location) address.location = updates.location;
        if (updates.deliveryInstructions) address.deliveryInstructions = updates.deliveryInstructions;
        if (updates.isDefault) {
            user.savedAddresses.forEach(a => a.isDefault = false);
            address.isDefault = true;
        }
        await user.save();
        res.status(200).json({ message: "Address updated", addresses: user.savedAddresses });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};
exports.deleteAddress = async (req, res) => {
    try {
        const user = await User.findById(req.user._id);
        user.savedAddresses = user.savedAddresses.filter(
            addr => addr._id.toString() !== req.params.id
        );
        await user.save();
        res.status(200).json({ message: "Address removed", addresses: user.savedAddresses });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};
exports.addPaymentMethod = async (req, res) => {
    try {
        const { type, provider, token, last4, isDefault } = req.body;
        const user = await User.findById(req.user._id);
        if (isDefault) {
            user.savedPaymentMethods.forEach(p => p.isDefault = false);
        }
        user.savedPaymentMethods.push({ type, provider, token, last4, isDefault });
        await user.save();
        res.status(201).json({ message: "Payment method saved", methods: user.savedPaymentMethods });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};
exports.getPaymentMethods = async (req, res) => {
    try {
        const user = await User.findById(req.user._id).select('savedPaymentMethods');
        if (!user) return res.status(404).json({ message: "User not found" });
        res.status(200).json({ methods: user.savedPaymentMethods || [] });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};
exports.toggleFavoriteRestaurant = async (req, res) => {
    try {
        const restId = req.params.id;
        if (!isValidObjectId(restId)) {
            return res.status(400).json({ message: "Invalid restaurant id" });
        }
        const restaurant = await Restaurant.findById(restId).select('_id');
        if (!restaurant) {
            return res.status(404).json({ message: "Restaurant not found" });
        }
        const user = await User.findById(req.user._id);
        if (!user) return res.status(404).json({ message: "User not found" });
        if (!user.favoriteRestaurants) user.favoriteRestaurants = [];
        const index = user.favoriteRestaurants.findIndex(
            (id) => id.toString() === restId
        );
        if (index === -1) {
            user.favoriteRestaurants.push(restId);
            await user.save();
            return res.json({ message: "Added to favorites", isFavorite: true });
        }
        user.favoriteRestaurants.splice(index, 1);
        await user.save();
        return res.json({ message: "Removed from favorites", isFavorite: false });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};
exports.getFavoriteRestaurants = async (req, res) => {
    try {
        const user = await User.findById(req.user._id)
            .select('favoriteRestaurants')
            .populate('favoriteRestaurants');
        if (!user) return res.status(404).json({ message: "User not found" });
        res.status(200).json({
            favorites: user.favoriteRestaurants || []
        });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};
exports.toggleFavoriteProduct = async (req, res) => {
    try {
        const productId = req.params.id;
        if (!isValidObjectId(productId)) {
            return res.status(400).json({ message: "Invalid product id" });
        }
        const product = await Product.findById(productId).select('_id');
        if (!product) {
            return res.status(404).json({ message: "Product not found" });
        }
        const user = await User.findById(req.user._id);
        if (!user) return res.status(404).json({ message: "User not found" });
        if (!user.favoriteProducts) user.favoriteProducts = [];
        const index = user.favoriteProducts.findIndex(
            (id) => id.toString() === productId
        );
        if (index === -1) {
            user.favoriteProducts.push(productId);
            await user.save();
            return res.json({ message: "Added to favorites", isFavorite: true });
        }
        user.favoriteProducts.splice(index, 1);
        await user.save();
        return res.json({ message: "Removed from favorites", isFavorite: false });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};
exports.getFavoriteProducts = async (req, res) => {
    try {
        const user = await User.findById(req.user._id)
            .select('favoriteProducts')
            .populate({
                path: 'favoriteProducts',
                populate: { path: 'restaurant', select: '_id name image' }
            });
        if (!user) return res.status(404).json({ message: "User not found" });
        res.status(200).json({
            favorites: user.favoriteProducts || []
        });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};
exports.deleteAccount = async (req, res) => {
    try {
        await User.findByIdAndUpdate(req.user._id, {
            isDeleted: true,
            deletedAt: new Date()
        });
        res.status(200).json({ message: "Account successfully deleted." });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};
exports.changePassword = async (req, res) => {
    try {
        const { currentPassword, newPassword } = req.body;
        if (!currentPassword || !newPassword) {
            return res.status(400).json({ message: "Current password and new password are required" });
        }
        if (newPassword.length < 6) {
            return res.status(400).json({ message: "New password must be at least 6 characters" });
        }
        const user = await User.findById(req.user._id);
        if (!user || user.isDeleted) {
            return res.status(404).json({ message: "User not found" });
        }
        const isMatch = await bcrypt.compare(currentPassword, user.password);
        if (!isMatch) {
            return res.status(400).json({ message: "Current password is incorrect" });
        }
        const salt = await bcrypt.genSalt(10);
        user.password = await bcrypt.hash(newPassword, salt);
        await user.save();
        res.status(200).json({ message: "Password updated successfully" });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};
exports.saveFCMToken = async (req, res) => {
    try {
        const { fcmToken } = req.body;
        if (!fcmToken || typeof fcmToken !== 'string') {
            return res.status(400).json({
                message: "Valid FCM token is required",
                success: false
            });
        }
        const user = await User.findById(req.user._id);
        if (!user || user.isDeleted) {
            return res.status(404).json({
                message: "User not found",
                success: false
            });
        }
        const oldToken = user.fcmToken;
        user.fcmToken = fcmToken;
        await user.save();
        console.log(`✅ FCM Token saved for user ${user._id} (${user.name})`);
        if (oldToken && oldToken !== fcmToken) {
            console.log(`   Replaced old token: ${oldToken.substring(0, 20)}...`);
        }
        res.status(200).json({
            success: true,
            message: "Push notification token saved successfully",
            fcmToken: fcmToken.substring(0, 20) + '...' // Return partial token for verification
        });
    } catch (error) {
        console.error('Error saving FCM token:', error.message);
        res.status(500).json({
            message: "Failed to save FCM token",
            success: false,
            error: error.message
        });
    }
};
exports.removeFCMToken = async (req, res) => {
    try {
        const user = await User.findById(req.user._id);
        if (!user || user.isDeleted) {
            return res.status(404).json({
                message: "User not found",
                success: false
            });
        }
        if (!user.fcmToken) {
            return res.status(200).json({
                success: true,
                message: "No FCM token to remove"
            });
        }
        const removedToken = user.fcmToken;
        user.fcmToken = null;
        await user.save();
        console.log(`🗑️ FCM Token removed for user ${user._id} (${user.name})`);
        res.status(200).json({
            success: true,
            message: "Push notification token removed successfully"
        });
    } catch (error) {
        console.error('Error removing FCM token:', error.message);
        res.status(500).json({
            message: "Failed to remove FCM token",
            success: false,
            error: error.message
        });
    }
};
exports.getNotificationStatus = async (req, res) => {
    try {
        const user = await User.findById(req.user._id).select('_id name email fcmToken role');
        if (!user || user.isDeleted) {
            return res.status(404).json({
                message: "User not found",
                success: false
            });
        }
        res.status(200).json({
            success: true,
            notificationStatus: {
                userId: user._id,
                name: user.name,
                email: user.email,
                role: user.role,
                hasFCMToken: !!user.fcmToken,
                fcmTokenPreview: user.fcmToken ? user.fcmToken.substring(0, 20) + '...' : null,
                notificationsEnabled: !!user.fcmToken
            }
        });
    } catch (error) {
        console.error('Error getting notification status:', error.message);
        res.status(500).json({
            message: "Failed to get notification status",
            success: false,
            error: error.message
        });
    }
};
