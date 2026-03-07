const path = require('path');
const axios = require('axios');
const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
const User = require('../models/User');
const Rider = require('../models/Rider');
const Order = require('../models/Order');
const Restaurant = require('../models/Restaurant');
const BASE_URL = process.env.BASE_URL || 'http://192.168.43.215:5000';
const makeToken = (user) =>
  jwt.sign({ _id: user._id, role: user.role }, process.env.JWT_SECRET, {
    expiresIn: '30m',
  });
const callApi = async ({ label, method, url, token, data }) => {
  try {
    const response = await axios({
      method,
      url,
      data,
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      timeout: 15000,
      validateStatus: () => true,
    });
    return {
      label,
      ok: response.status >= 200 && response.status < 300,
      status: response.status,
      body: response.data,
    };
  } catch (error) {
    return {
      label,
      ok: false,
      status: 0,
      body: { message: error.message },
    };
  }
};
const findOrderWithRoleData = async (statuses) => {
  const order = await Order.findOne({
    status: { $in: statuses },
    rider: { $ne: null },
  })
    .sort({ updatedAt: -1 })
    .lean();
  if (!order) return null;
  const [riderProfile, restaurant, customer] = await Promise.all([
    Rider.findById(order.rider).lean(),
    Restaurant.findById(order.restaurant).select('owner contactNumber').lean(),
    User.findById(order.customer).select('_id role name mobile').lean(),
  ]);
  if (!riderProfile || !restaurant?.owner || !customer) return null;
  const [riderUser, ownerUser] = await Promise.all([
    User.findById(riderProfile.user).select('_id role name mobile').lean(),
    User.findById(restaurant.owner).select('_id role name mobile').lean(),
  ]);
  if (!riderUser || !ownerUser) return null;
  return {
    order,
    riderUser,
    ownerUser,
    customerUser: customer,
  };
};
const run = async () => {
  if (!process.env.MONGO_URI || !process.env.JWT_SECRET) {
    throw new Error('Missing MONGO_URI or JWT_SECRET in Backend/.env');
  }
  await mongoose.connect(process.env.MONGO_URI);
  const assignedCtx = await findOrderWithRoleData(['assigned', 'reached_restaurant']);
  const deliveryCtx = await findOrderWithRoleData(['picked_up', 'delivery_arrived']);
  const tests = [];
  if (assignedCtx) {
    const riderToken = makeToken(assignedCtx.riderUser);
    const ownerToken = makeToken(assignedCtx.ownerUser);
    tests.push(
      await callApi({
        label: 'Pickup resend as Rider (generic endpoint)',
        method: 'post',
        url: `${BASE_URL}/api/orders/${assignedCtx.order._id}/resend-otp`,
        token: riderToken,
        data: { otpType: 'pickup' },
      })
    );
    tests.push(
      await callApi({
        label: 'Pickup resend as Restaurant Owner (generic endpoint)',
        method: 'post',
        url: `${BASE_URL}/api/orders/${assignedCtx.order._id}/resend-otp`,
        token: ownerToken,
        data: { otpType: 'pickup' },
      })
    );
    tests.push(
      await callApi({
        label: 'Pickup resend as Rider (rider endpoint)',
        method: 'post',
        url: `${BASE_URL}/api/riders/orders/${assignedCtx.order._id}/resend-pickup-otp`,
        token: riderToken,
        data: {},
      })
    );
  } else {
    tests.push({
      label: 'Assigned order context',
      ok: false,
      status: 0,
      body: { message: 'No assigned/reached_restaurant order with rider+owner found' },
    });
  }
  if (deliveryCtx) {
    const riderToken = makeToken(deliveryCtx.riderUser);
    const customerToken = makeToken(deliveryCtx.customerUser);
    tests.push(
      await callApi({
        label: 'Delivery resend as Rider (generic endpoint)',
        method: 'post',
        url: `${BASE_URL}/api/orders/${deliveryCtx.order._id}/resend-otp`,
        token: riderToken,
        data: { otpType: 'delivery' },
      })
    );
    tests.push(
      await callApi({
        label: 'Delivery resend as Customer (generic endpoint)',
        method: 'post',
        url: `${BASE_URL}/api/orders/${deliveryCtx.order._id}/resend-otp`,
        token: customerToken,
        data: { otpType: 'delivery' },
      })
    );
    tests.push(
      await callApi({
        label: 'Delivery resend as Rider (rider endpoint)',
        method: 'post',
        url: `${BASE_URL}/api/riders/orders/${deliveryCtx.order._id}/resend-delivery-otp`,
        token: riderToken,
        data: {},
      })
    );
  } else {
    tests.push({
      label: 'Delivery order context',
      ok: false,
      status: 0,
      body: { message: 'No picked_up/delivery_arrived order with rider+customer found' },
    });
  }
  console.log('\n=== OTP Flow API Check Results ===');
  tests.forEach((result, index) => {
    const marker = result.ok ? '✅' : '❌';
    console.log(`\n${index + 1}. ${marker} ${result.label}`);
    console.log(`   Status: ${result.status}`);
    if (result.body?.message) {
      console.log(`   Message: ${result.body.message}`);
    }
    if (result.body?.data?.expiresAt) {
      console.log(`   ExpiresAt: ${result.body.data.expiresAt}`);
    } else if (result.body?.expiresAt) {
      console.log(`   ExpiresAt: ${result.body.expiresAt}`);
    }
  });
  const passed = tests.filter((t) => t.ok).length;
  console.log(`\nSummary: ${passed}/${tests.length} passed`);
  await mongoose.disconnect();
};
run()
  .then(() => process.exit(0))
  .catch(async (error) => {
    console.error('\nOTP API check failed:', error.message);
    try {
      await mongoose.disconnect();
    } catch (_) {}
    process.exit(1);
  });
