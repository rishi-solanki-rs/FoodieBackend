const { admin, isInitialized } = require("../config/firebaseConfig");
const User = require("../models/User");
const socketService = require("../services/socketService");

function normalizeUserId(userId) {
  if (!userId) return null;
  const actualUserId = userId._id ? userId._id : userId;
  return actualUserId.toString ? actualUserId.toString() : String(actualUserId);
}

function normalizeNotificationValue(value) {
  if (value === undefined || value === null) return null;
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean" || typeof value === "bigint") {
    return String(value);
  }

  try {
    return JSON.stringify(value);
  } catch (error) {
    return String(value);
  }
}

function buildFcmDataPayload(data = {}) {
  const payload = {
    click_action: "FLUTTER_NOTIFICATION_CLICK",
    sound: "default",
  };

  Object.entries(data).forEach(([key, value]) => {
    const normalizedValue = normalizeNotificationValue(value);
    if (normalizedValue !== null) {
      payload[key] = normalizedValue;
    }
  });

  return payload;
}

exports.sendNotification = async (userId, title, message, data = {}) => {
  try {
    if (!userId) {
      console.warn("⚠️ sendNotification: userId is required (undefined/null provided)");
      return false;
    }

    const userIdStr = normalizeUserId(userId);

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
              title: String(title),
              body: String(message),
            },
            data: buildFcmDataPayload(data),
            token: user.fcmToken,
          };

          try {
            await Promise.race([
              admin.messaging().send(payload),
              new Promise((_, reject) =>
                setTimeout(() => reject(new Error("FCM send timeout")), 5000)
              )
            ]);
            console.log(`📲 FCM notification sent to ${user.name} (${userIdStr})`);
          } catch (fcmTimeoutError) {
            if (fcmTimeoutError.message.includes("timeout")) {
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
          await User.findByIdAndUpdate(userIdStr, { $unset: { fcmToken: 1 } }).catch((cleanupError) =>
            console.error("Cleanup error:", cleanupError)
          );
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
