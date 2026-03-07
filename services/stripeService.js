const Stripe = require('stripe');
const stripeSecret = process.env.STRIPE_SECRET_KEY;
if (!stripeSecret) {
    console.warn("WARNING: STRIPE_SECRET_KEY is not defined in environment variables!");
}
const stripe = new Stripe(stripeSecret, {
    apiVersion: '2024-06-20', // Upgraded API version to support automatic_payment_methods
});
module.exports = stripe;
