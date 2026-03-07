const admin = require("firebase-admin");
const path = require("path");
const fs = require("fs");
let firebaseInitialized = false;
try {
  const serviceAccountPath = path.join(__dirname, "serviceAccountKey.json");
  if (fs.existsSync(serviceAccountPath)) {
    const serviceAccount = require(serviceAccountPath);
    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount),
    });
    firebaseInitialized = true;
    console.log("✅ Firebase Admin SDK initialized successfully.");
  } else {
    console.warn(
      "⚠️ Firebase serviceAccountKey.json not found in config/ folder. Push notifications via FCM will not work.",
    );
  }
} catch (error) {
  console.error(" Error initializing Firebase Admin SDK:", error.message);
}
module.exports = {
  admin: firebaseInitialized ? admin : null,
  isInitialized: firebaseInitialized,
};
