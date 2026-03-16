const admin = require("firebase-admin");
const path = require("path");
const fs = require("fs");

let firebaseInitialized = false;

function parseServiceAccountFromEnv() {
  try {
    if (process.env.FIREBASE_SERVICE_ACCOUNT_JSON) {
      const parsed = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON);
      if (parsed && parsed.project_id && parsed.client_email && parsed.private_key) {
        return parsed;
      }
    }

    if (process.env.FIREBASE_SERVICE_ACCOUNT_BASE64) {
      const decoded = Buffer.from(process.env.FIREBASE_SERVICE_ACCOUNT_BASE64, "base64").toString("utf8");
      const parsed = JSON.parse(decoded);
      if (parsed && parsed.project_id && parsed.client_email && parsed.private_key) {
        return parsed;
      }
    }

    if (
      process.env.FIREBASE_PROJECT_ID
      && process.env.FIREBASE_CLIENT_EMAIL
      && process.env.FIREBASE_PRIVATE_KEY
    ) {
      return {
        project_id: process.env.FIREBASE_PROJECT_ID,
        client_email: process.env.FIREBASE_CLIENT_EMAIL,
        private_key: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, "\n"),
      };
    }
  } catch (error) {
    console.error("Error parsing Firebase credentials from environment:", error.message);
  }

  return null;
}

try {
  const serviceAccountPath = path.join(__dirname, "serviceAccountKey.json");
  if (admin.apps.length > 0) {
    firebaseInitialized = true;
    console.log("ℹ️ Firebase Admin SDK already initialized. Reusing existing app.");
  } else {
    const envServiceAccount = parseServiceAccountFromEnv();
    if (envServiceAccount) {
      admin.initializeApp({
        credential: admin.credential.cert(envServiceAccount),
      });
      firebaseInitialized = true;
      console.log("✅ Firebase Admin SDK initialized from environment variables.");
    } else if (fs.existsSync(serviceAccountPath)) {
      const serviceAccount = require(serviceAccountPath);
      admin.initializeApp({
        credential: admin.credential.cert(serviceAccount),
      });
      firebaseInitialized = true;
      console.log("✅ Firebase Admin SDK initialized successfully from file.");
    } else {
      console.warn(
        "⚠️ Firebase serviceAccountKey.json not found in config/ folder and no Firebase env credentials found. Push notifications via FCM will not work.",
      );
    }
  }
} catch (error) {
  console.error(" Error initializing Firebase Admin SDK:", error.message);
}

module.exports = {
  admin: firebaseInitialized ? admin : null,
  isInitialized: firebaseInitialized,
};
