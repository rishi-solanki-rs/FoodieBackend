const Razorpay = require('razorpay');

let _razorpay = null;

/**
 * Lazily initializes Razorpay so the server can start even if keys
 * are not yet set in .env (e.g., during development setup).
 */
function getRazorpay() {
    if (_razorpay) return _razorpay;

    const keyId = process.env.RAZORPAY_KEY_ID;
    const keySecret = process.env.RAZORPAY_KEY_SECRET;

    if (!keyId || !keySecret) {
        throw new Error("RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET must be set in .env before processing payments.");
    }

    _razorpay = new Razorpay({ key_id: keyId, key_secret: keySecret });
    return _razorpay;
}

module.exports = { getRazorpay };
