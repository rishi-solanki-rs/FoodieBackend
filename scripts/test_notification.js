const mongoose = require('mongoose');
const User = require('../models/User');
const { sendNotification } = require('../utils/notificationService');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });
console.log('--- Starting Notification Test for Specific User ---');
async function test() {
    try {
        if (!process.env.MONGO_URI) {
            throw new Error('MONGO_URI not found in .env');
        }
        await mongoose.connect(process.env.MONGO_URI);
        console.log('✅ Connected to MongoDB');
        const targetMobile = "7240801181";
        const user = await User.findOne({ mobile: targetMobile });
        if (!user) {
            console.log(`❌ User with mobile ${targetMobile} not found in DB.`);
            return;
        }
        console.log(`👤 Found User: ${user.name} (${user._id})`);
        if (!user.fcmToken) {
             console.log(`⚠️ This user does NOT have an FCM Token saved. Push notification cannot be sent to their device.`);
             console.log(`ℹ️ They must login to the mobile app first to generate a token.`);
        } else {
             console.log(`📱 FCM Token found: ${user.fcmToken.substring(0, 20)}...`);
        }
        console.log('🚀 Attempting to send notification via Service...');
        const result = await sendNotification(user._id, 'Hello from Admin', 'This is a test message for your mobile number', { test: true });
        if (result === true) {
            console.log('✅ sendNotification executed successfully');
        } else {
            console.error('❌ sendNotification failed');
        }
    } catch (err) {
        console.error('CRITICAL FAILURE:', err);
    } finally {
        await mongoose.disconnect();
        process.exit(0);
    }
}
test();
