const crypto = require("crypto");
const Order = require("../models/Order");
const Cart = require("../models/Cart");
const Promocode = require("../models/Promocode");
const { getRazorpay } = require("../services/razorpayService");
const socketService = require("../services/socketService");
const { logger, logOrderTransition, logPayment, logCouponUsage } = require("../utils/logger");
const { sendNotification } = require("../utils/notificationService");

/**
 * POST /api/payment/create-order
 * Creates a Razorpay order for an existing app Order.
 * Returns razorpayOrderId, amount, currency, keyId to the frontend.
 */
exports.createRazorpayOrder = async (req, res) => {
    try {
        const { orderId } = req.body;
        if (!orderId) {
            return res.status(400).json({ success: false, message: "Order ID is required" });
        }

        const order = await Order.findById(orderId).populate("restaurant", "name owner");
        if (!order) {
            return res.status(404).json({ success: false, message: "Order not found" });
        }
        if (order.customer.toString() !== req.user._id.toString()) {
            return res.status(403).json({ success: false, message: "Unauthorized access to order" });
        }
        if (order.paymentStatus === "paid" || order.paymentStatus === "completed") {
            return res.status(400).json({ success: false, message: "Order is already paid" });
        }
        if (order.status === "failed" || order.status === "cancelled") {
            return res.status(400).json({ success: false, message: `Order is no longer active (${order.status})` });
        }
        if (order.paymentMethod !== "online") {
            return res.status(400).json({ success: false, message: "Order payment method is not 'online'" });
        }

        // Razorpay expects amount in paise (1 INR = 100 paise)
        const amountInPaise = Math.round(order.totalAmount * 100);

        const razorpayOrder = await getRazorpay().orders.create({
            amount: amountInPaise,
            currency: "INR",
            receipt: `order_${order._id.toString().slice(-10)}`,
            notes: {
                orderId: order._id.toString(),
                customerId: order.customer.toString(),
                restaurantName: order.restaurant?.name || "",
            },
        });

        // Save Razorpay order ID to our order
        order.razorpayOrderId = razorpayOrder.id;
        order.paymentStatus = "processing";
        if (order.status !== "pending") {
            order.status = "pending";
        }

        const lastTimeline = order.timeline[order.timeline.length - 1];
        if (!lastTimeline || lastTimeline.status !== "pending" || !lastTimeline.label?.includes("Processing")) {
            order.timeline.push({
                status: "pending",
                timestamp: new Date(),
                label: "Payment Processing",
                by: "system",
                description: "Payment initiated. Waiting for Razorpay confirmation.",
            });
        }
        await order.save();

        return res.status(200).json({
            success: true,
            razorpayOrderId: razorpayOrder.id,
            amount: razorpayOrder.amount,        // in paise
            currency: razorpayOrder.currency,
            keyId: process.env.RAZORPAY_KEY_ID, // frontend needs this for Razorpay checkout
        });
    } catch (error) {
        console.error("Create Razorpay Order Error:", error);
        return res.status(500).json({ success: false, message: error.message });
    }
};

/**
 * POST /api/payment/verify-payment
 * Called by the frontend after user completes payment on Razorpay checkout popup.
 * Verifies the HMAC-SHA256 signature and marks the order as paid.
 */
exports.verifyRazorpayPayment = async (req, res) => {
    try {
        const { orderId, razorpayOrderId, razorpayPaymentId, razorpaySignature } = req.body;

        if (!orderId || !razorpayOrderId || !razorpayPaymentId || !razorpaySignature) {
            return res.status(400).json({ success: false, message: "Missing required payment verification fields" });
        }

        // Verify HMAC signature
        const expectedSignature = crypto
            .createHmac("sha256", process.env.RAZORPAY_KEY_SECRET)
            .update(`${razorpayOrderId}|${razorpayPaymentId}`)
            .digest("hex");

        if (expectedSignature !== razorpaySignature) {
            return res.status(400).json({ success: false, message: "Payment signature verification failed" });
        }

        const order = await Order.findById(orderId)
            .populate("customer", "name _id")
            .populate("restaurant", "name _id owner");

        if (!order) {
            return res.status(404).json({ success: false, message: "Order not found" });
        }
        if (order.paymentStatus === "paid") {
            return res.status(200).json({ success: true, message: "Order already marked as paid" });
        }

        // Mark as paid
        order.paymentStatus = "paid";
        order.paidAt = new Date();
        order.transactionId = razorpayPaymentId;
        order.status = "placed";
        order.timeline.push({
            status: "placed",
            timestamp: new Date(),
            label: "Order Placed",
            by: "system",
            description: "Payment confirmed via Razorpay. Order forwarded to restaurant.",
        });
        await order.save();

        // Logging
        try {
            logOrderTransition(order._id, "pending", "placed", order.customer._id, "system", "Payment verified by Razorpay signature");
            logPayment(null, order.customer._id, "online", order.totalAmount, "success");
        } catch (e) {
            logger.error("Error logging payment transition", e);
        }

        // Clear cart
        try {
            await Cart.findOneAndDelete({ user: order.customer._id });
        } catch (e) {
            logger.warn("Could not delete cart after payment", { error: e.message, orderId });
        }

        // Coupon usage
        try {
            if (order.couponCode) {
                await Promocode.updateOne({ code: order.couponCode }, { $inc: { usedCount: 1 } });
                logCouponUsage(order.customer._id, order.couponCode, order._id, null, true);
            }
        } catch (e) {
            logger.warn("Could not apply coupon usage after payment", { error: e.message, orderId });
        }

        // Notifications & sockets
        try {
            const restaurantId = order.restaurant._id.toString();
            const restaurantOwnerId = order.restaurant.owner?._id || order.restaurant.owner;

            if (restaurantOwnerId) {
                await sendNotification(
                    restaurantOwnerId,
                    "New Order Received",
                    `Order #${order._id.toString().slice(-6)} - ₹${order.totalAmount} (Online - Paid)`,
                    { orderId: order._id, restaurantId }
                );
            }

            const restaurantOrderPayload = {
                orderId: order._id,
                restaurantId,
                customerId: order.customer._id.toString(),
                customerName: order.customer.name,
                restaurantName: order.restaurant.name,
                itemCount: order.items.length,
                amount: order.totalAmount,
                totalAmount: order.totalAmount,
                paymentMethod: order.paymentMethod,
                paymentStatus: "paid",
                status: "placed",
                timestamp: new Date(),
            };

            socketService.emitToRestaurant(restaurantId, "order:new", restaurantOrderPayload);
            socketService.emitToRestaurant(restaurantId, "restaurant:new_order", restaurantOrderPayload);
            socketService.emitToCustomer(order.customer._id.toString(), "order:status", {
                orderId: order._id,
                status: "placed",
                paymentStatus: "paid",
                message: "Payment confirmed! Your order has been sent to the restaurant.",
                timestamp: new Date(),
            });
            socketService.emitToAdmin("order:new", {
                orderIds: [order._id],
                customerName: order.customer.name,
                restaurantCount: 1,
                totalAmount: order.totalAmount,
                paymentMethod: order.paymentMethod,
                timestamp: new Date(),
            });
        } catch (e) {
            logger.error("Failed to notify restaurant after payment verification", e);
        }

        return res.status(200).json({ success: true, message: "Payment verified successfully" });
    } catch (error) {
        console.error("Verify Razorpay Payment Error:", error);
        return res.status(500).json({ success: false, message: error.message });
    }
};

/**
 * POST /api/payment/razorpay-webhook
 * Server-side webhook from Razorpay for payment.captured / payment.failed events.
 * This is a safety net — verifyRazorpayPayment (client-side) is the primary flow.
 */
exports.handleRazorpayWebhook = async (req, res) => {
    const webhookSecret = process.env.RAZORPAY_WEBHOOK_SECRET;
    const signature = req.headers["x-razorpay-signature"];

    // Verify webhook signature
    try {
        const expectedSignature = crypto
            .createHmac("sha256", webhookSecret)
            .update(JSON.stringify(req.body))
            .digest("hex");

        if (expectedSignature !== signature) {
            console.error("⚠️ Razorpay webhook signature mismatch");
            return res.status(400).json({ success: false, message: "Invalid webhook signature" });
        }
    } catch (err) {
        console.error("Webhook signature verification error:", err.message);
        return res.status(400).json({ success: false, message: "Webhook error" });
    }

    const event = req.body.event;
    const paymentEntity = req.body.payload?.payment?.entity;

    try {
        if (event === "payment.captured") {
            await handleWebhookPaymentSuccess(paymentEntity);
        } else if (event === "payment.failed") {
            await handleWebhookPaymentFailed(paymentEntity);
        } else {
            console.log(`Unhandled Razorpay event: ${event}`);
        }
        return res.status(200).json({ success: true });
    } catch (error) {
        console.error("Error processing Razorpay webhook:", error);
        return res.status(500).json({ success: false });
    }
};

async function handleWebhookPaymentSuccess(paymentEntity) {
    const orderId = paymentEntity?.notes?.orderId;
    if (!orderId) return;

    const order = await Order.findById(orderId)
        .populate("customer", "name _id")
        .populate("restaurant", "name _id owner");

    if (!order) return;
    if (order.paymentStatus === "paid") return; // Already handled by verifyRazorpayPayment

    order.paymentStatus = "paid";
    order.paidAt = new Date();
    order.transactionId = paymentEntity.id;
    order.status = "placed";
    order.timeline.push({
        status: "placed",
        timestamp: new Date(),
        label: "Order Placed",
        by: "system",
        description: "Payment confirmed via Razorpay webhook.",
    });
    await order.save();

    try {
        logOrderTransition(order._id, "pending", "placed", order.customer._id, "system", "Payment confirmed by Razorpay webhook");
        logPayment(null, order.customer._id, "online", order.totalAmount, "success");
    } catch (e) { }

    try {
        await Cart.findOneAndDelete({ user: order.customer._id });
    } catch (e) { }

    try {
        if (order.couponCode) {
            await Promocode.updateOne({ code: order.couponCode }, { $inc: { usedCount: 1 } });
        }
    } catch (e) { }

    try {
        const restaurantId = order.restaurant._id.toString();
        const restaurantOwnerId = order.restaurant.owner?._id || order.restaurant.owner;
        if (restaurantOwnerId) {
            await sendNotification(restaurantOwnerId, "New Order Received",
                `Order #${order._id.toString().slice(-6)} - ₹${order.totalAmount} (Online - Paid)`,
                { orderId: order._id, restaurantId }
            );
        }
        socketService.emitToRestaurant(restaurantId, "order:new", { orderId: order._id, status: "placed", paymentStatus: "paid" });
        socketService.emitToCustomer(order.customer._id.toString(), "order:status", {
            orderId: order._id, status: "placed", paymentStatus: "paid",
            message: "Payment confirmed! Your order has been sent to the restaurant.", timestamp: new Date(),
        });
    } catch (e) { }
}

async function handleWebhookPaymentFailed(paymentEntity) {
    const orderId = paymentEntity?.notes?.orderId;
    if (!orderId) return;

    const order = await Order.findById(orderId);
    if (!order || order.paymentStatus === "paid") return;

    order.paymentStatus = "failed";
    order.status = "failed";
    order.cancellationInitiatedBy = "system";
    order.cancelledAt = new Date();
    order.timeline.push({
        status: "failed",
        timestamp: new Date(),
        label: "Payment Failed",
        by: "system",
        description: "The Razorpay payment failed.",
    });
    await order.save();

    try {
        socketService.emitToCustomer(order.customer.toString(), "order:status", {
            orderId: order._id, status: "failed",
            message: "Your payment failed. Please try placing a new order.", timestamp: new Date(),
        });
    } catch (e) { }

    try {
        logOrderTransition(order._id, null, "failed", order.customer, "system", "Razorpay payment failed");
        logPayment(null, order.customer, "online", order.totalAmount, "failed");
    } catch (e) { }
}
