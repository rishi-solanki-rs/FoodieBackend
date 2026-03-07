const express = require('express');
const router = express.Router();
const { 
    registerInitiate, 
    registerVerify,
    checkVerificationStatus,
    resendOTP,
    loginUser, 
    logoutUser,
    forgotPasswordInitiate,
    resendForgotPasswordOTP,
    forgotPasswordVerifyOTP,
    resetPassword
} = require('../controllers/authController');
router.post('/register/initiate', registerInitiate);
router.post('/register/verify', registerVerify);
router.post('/check-verification-status', checkVerificationStatus);
router.post('/resend-otp', resendOTP);
router.post('/login', loginUser);
router.post('/logout', logoutUser);
router.post('/forgot-password', forgotPasswordInitiate);
router.post('/forgot-password/resend-otp', resendForgotPasswordOTP);
router.post('/forgot-password/verify-otp', forgotPasswordVerifyOTP);
router.post('/reset-password', resetPassword);
module.exports = router;
