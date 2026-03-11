const { admin, isInitialized } = require("../config/firebaseConfig");
const User = require("../models/User");
const socketService = require("../services/socketService");
const { logger } = require("./logger"); // Assuming a logger exists, or we use console
exports.sendNotification = async (userId, title, message, data = {}) => {
  try {
    if (!userId) {
      console.warn("⚠️ sendNotification: userId is required (undefined/null provided)");
      return false;
    }
    
    // Extract _id if an object is passed (e.g., {_id: ObjectId, name: 'User'})
    const actualUserId = userId._id ? userId._id : userId;
    const userIdStr = actualUserId.toString ? actualUserId.toString() : String(actualUserId);
    try {
      socketService.emitToUser(userIdStr, "notification:new", {
        title,
        message,
        data,
        timestamp: new Date(),
      });
      console.log(`🔌 Socket notification sent to user ${userIdStr}`);
    } catch (socketError) {
      console.error(
        `❌ Failed to send socket notification to ${userIdStr}:`,
        socketError.message,
      );
    }
    if (isInitialized && admin) {
      try {
        const user = await User.findById(userIdStr).select("fcmToken name");
        if (user && user.fcmToken) {
          const payload = {
            notification: {
              title: title,
              body: message,
            },
            data: {
              ...data,
              click_action: "FLUTTER_NOTIFICATION_CLICK", // Common for Flutter apps
              sound: "default",
            },
            token: user.fcmToken,
          };
          try {
            await Promise.race([
              admin.messaging().send(payload),
              new Promise((_, reject) => 
                setTimeout(() => reject(new Error('FCM send timeout')), 5000)
              )
            ]);
            console.log(`📲 FCM notification sent to ${user.name} (${userIdStr})`);
          } catch (fcmTimeoutError) {
            if (fcmTimeoutError.message.includes('timeout')) {
              console.warn(`⚠️ FCM timeout for user ${userIdStr}, continuing...`);
            } else {
              throw fcmTimeoutError;
            }
          }
        } else {
            console.log(`ℹ️ No FCM token found for user ${userIdStr}, skipping push.`);
        }
      } catch (fcmError) {
        if (
          fcmError.code === "messaging/registration-token-not-registered" ||
          fcmError.code === "messaging/invalid-argument"
        ) {
          console.warn(
            `⚠️ Invalid FCM token for user ${userIdStr}. Removing from DB.`,
          );
          await User.findByIdAndUpdate(userIdStr, { $unset: { fcmToken: 1 } }).catch(e => console.error("Cleanup error:", e));
        } else {
          console.error(
            `❌ FCM Error for user ${userIdStr}:`,
            fcmError.message,
          );
        }
      }
    } else {
       if (!isInitialized) {
         console.warn("ℹ️ Firebase not initialized, FCM notifications disabled");
       }
    }
    return true;
  } catch (error) {
    console.error("❌ sendNotification Service Error:", error);
    return false;
  }
};
