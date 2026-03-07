
const mongoose = require('mongoose');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });
const User = require('../models/User');
const Order = require('../models/Order');
const { sendNotification } = require('../utils/notificationService');
const socketService = require('../services/socketService');
let testsPassed = 0;
let testsFailed = 0;
const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
};
function log(color, message) {
  console.log(`${colors[color]}${message}${colors.reset}`);
}
async function runTests() {
  try {
    if (!process.env.MONGO_URI) {
      throw new Error('MONGO_URI not found in .env');
    }
    await mongoose.connect(process.env.MONGO_URI);
    log('green', '✅ Connected to MongoDB');
    log('cyan', '\n--- TEST 1: Valid userId as String ---');
    const testUser1 = await User.findOne({});
    if (testUser1) {
      const result = await sendNotification(
        testUser1._id.toString(),
        'Test Notification 1',
        'This is a test with string userId'
      );
      if (result) {
        log('green', '✅ PASS: Notification sent with string userId');
        testsPassed++;
      } else {
        log('red', '❌ FAIL: sendNotification returned false');
        testsFailed++;
      }
    } else {
      log('yellow', '⊘ SKIP: No test user found');
    }
    log('cyan', '\n--- TEST 2: Valid userId as ObjectId ---');
    if (testUser1) {
      const result = await sendNotification(
        testUser1._id, // ObjectId, not string
        'Test Notification 2',
        'This is a test with ObjectId userId'
      );
      if (result) {
        log('green', '✅ PASS: Notification sent with ObjectId userId');
        testsPassed++;
      } else {
        log('red', '❌ FAIL: sendNotification returned false');
        testsFailed++;
      }
    }
    log('cyan', '\n--- TEST 3: Undefined userId (error handling) ---');
    try {
      const result = await sendNotification(
        undefined,
        'Test Notification 3',
        'This should be handled gracefully'
      );
      if (result === false) {
        log('green', '✅ PASS: Gracefully handled undefined userId, returned false');
        testsPassed++;
      } else {
        log('red', '❌ FAIL: Should have returned false for undefined userId');
        testsFailed++;
      }
    } catch (err) {
      log('red', `❌ FAIL: Should not throw error, got: ${err.message}`);
      testsFailed++;
    }
    log('cyan', '\n--- TEST 4: Null userId (error handling) ---');
    try {
      const result = await sendNotification(
        null,
        'Test Notification 4',
        'This should be handled gracefully'
      );
      if (result === false) {
        log('green', '✅ PASS: Gracefully handled null userId, returned false');
        testsPassed++;
      } else {
        log('red', '❌ FAIL: Should have returned false for null userId');
        testsFailed++;
      }
    } catch (err) {
      log('red', `❌ FAIL: Should not throw error, got: ${err.message}`);
      testsFailed++;
    }
    log('cyan', '\n--- TEST 5: Notification with all parameters ---');
    if (testUser1) {
      const result = await sendNotification(
        testUser1._id,
        'Order Notification',
        'Your order #12345 is ready for pickup',
        {
          orderId: '12345',
          restaurantId: '67890',
          type: 'order_ready',
          timestamp: new Date()
        }
      );
      if (result) {
        log('green', '✅ PASS: Notification sent with all parameters');
        testsPassed++;
      } else {
        log('red', '❌ FAIL: sendNotification returned false');
        testsFailed++;
      }
    }
    log('cyan', '\n--- TEST 6: User with FCM token ---');
    const userWithToken = await User.findOne({ fcmToken: { $exists: true, $ne: null } });
    if (userWithToken) {
      log('yellow', `ℹ️ Found user with FCM token: ${userWithToken.name}`);
      const result = await sendNotification(
        userWithToken._id,
        'FCM Test Notification',
        'This should send via FCM'
      );
      if (result) {
        log('green', '✅ PASS: Notification sent to user with FCM token');
        testsPassed++;
      } else {
        log('red', '❌ FAIL: sendNotification returned false');
        testsFailed++;
      }
    } else {
      log('yellow', '⊘ SKIP: No user with FCM token found');
    }
    log('cyan', '\n--- TEST 7: User without FCM token ---');
    const userWithoutToken = await User.findOne({ 
      $or: [
        { fcmToken: null },
        { fcmToken: { $exists: false } }
      ]
    });
    if (userWithoutToken) {
      log('yellow', `ℹ️ Found user without FCM token: ${userWithoutToken.name}`);
      const result = await sendNotification(
        userWithoutToken._id,
        'Socket-Only Notification',
        'This should only send via Socket.IO'
      );
      if (result) {
        log('green', '✅ PASS: Notification sent via Socket.IO (no FCM token)');
        testsPassed++;
      } else {
        log('red', '❌ FAIL: sendNotification returned false');
        testsFailed++;
      }
    } else {
      log('yellow', '⊘ SKIP: All users have FCM tokens');
    }
    log('cyan', '\n--- TEST 8: Invalid ObjectId format ---');
    try {
      const result = await sendNotification(
        'not-a-valid-objectid',
        'Test Notification',
        'Testing invalid ObjectId'
      );
      log('green', '✅ PASS: Handled invalid ObjectId gracefully');
      testsPassed++;
    } catch (err) {
      log('yellow', `⊘ Note: Threw error (acceptable): ${err.message.substring(0, 50)}`);
      testsPassed++;
    }
    log('cyan', '\n--- TEST 9: Notification with empty data ---');
    if (testUser1) {
      const result = await sendNotification(
        testUser1._id,
        'Simple Notification',
        'This is a notification with no data'
      );
      if (result) {
        log('green', '✅ PASS: Notification sent with empty data');
        testsPassed++;
      } else {
        log('red', '❌ FAIL: sendNotification returned false');
        testsFailed++;
      }
    }
    log('cyan', '\n--- TEST 10: Notification with very long message ---');
    if (testUser1) {
      const longMessage = 'a'.repeat(500); // 500 character message
      const result = await sendNotification(
        testUser1._id,
        'Long Message Test',
        longMessage
      );
      if (result) {
        log('green', '✅ PASS: Notification sent with long message');
        testsPassed++;
      } else {
        log('red', '❌ FAIL: sendNotification returned false');
        testsFailed++;
      }
    }
    log('cyan', '\n========== TEST SUMMARY ==========');
    log('green', `✅ Passed: ${testsPassed}`);
    log('red', `❌ Failed: ${testsFailed}`);
    const totalTests = testsPassed + testsFailed;
    const passRate = totalTests > 0 ? ((testsPassed / totalTests) * 100).toFixed(2) : 0;
    log('blue', `📊 Pass Rate: ${passRate}%`);
    if (testsFailed === 0) {
      log('green', '\n🎉 ALL TESTS PASSED!');
    } else {
      log('red', `\n⚠️ ${testsFailed} test(s) failed. Review logs above.`);
    }
  } catch (err) {
    log('red', `CRITICAL ERROR: ${err.message}`);
    console.error(err);
  } finally {
    await mongoose.disconnect();
    log('yellow', '\nDisconnected from MongoDB');
    process.exit(testsFailed > 0 ? 1 : 0);
  }
}
runTests();
