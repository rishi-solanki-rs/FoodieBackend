const axios = require('axios');

const SMS_BASE_URL = process.env.SMS_BASE_URL || 'http://sms.infinibs.com/http-tokenkeyapi.php';
const SMS_AUTH_KEY = process.env.SMS_AUTH_KEY || '34385665674166666169723834331767177401';
const SMS_SENDER_ID = process.env.SMS_SENDER_ID || 'VEGAFF';
const SMS_ROUTE = process.env.SMS_ROUTE || '1';
const SMS_TEMPLATE_ID = process.env.SMS_TEMPLATE_ID || '1707176701177441483';

const normalizePhoneNumber = (input) => {
  const digits = String(input || '').replace(/\D/g, '');

  // Accept +91XXXXXXXXXX, 91XXXXXXXXXX, or direct 10-digit mobile numbers.
  if (digits.length === 12 && digits.startsWith('91')) {
    return digits.slice(2);
  }

  if (digits.length === 10) {
    return digits;
  }

  throw new Error(`Invalid mobile number format: ${input}`);
};

const buildSmsUrl = (phoneNumber, message) => {
  // Use encodeURIComponent (spaces → %20) instead of URLSearchParams (spaces → +).
  // The infinibs gateway expects %20 encoding — matching the working test-sms-send.js.
  const query = [
    `authentic-key=${encodeURIComponent(SMS_AUTH_KEY)}`,
    `senderid=${encodeURIComponent(SMS_SENDER_ID)}`,
    `route=${encodeURIComponent(SMS_ROUTE)}`,
    `number=${encodeURIComponent(phoneNumber)}`,
    `message=${encodeURIComponent(message)}`,
    `templateid=${encodeURIComponent(SMS_TEMPLATE_ID)}`,
  ].join('&');

  return `${SMS_BASE_URL}?${query}`;
};

const assertGatewaySuccess = (gatewayResponse) => {
  const text = String(gatewayResponse || '').trim();

  // Provider success sample: "msg-id : NTI2NjA5Mg=="
  if (/msg-id\s*:/i.test(text)) {
    return;
  }

  throw new Error(`SMS gateway rejected request. Response: ${text || 'empty response'}`);
};

/**
 * Sends an SMS using the custom HTTP SMS Gateway
 * @param {string} phoneNumber - The recipient's phone number
 * @param {string} message - The message content to send
 * @returns {Promise<object>} The API response
 */
const sendSMS = async (phoneNumber, message) => {
  try {
    const normalizedPhone = normalizePhoneNumber(phoneNumber);
    const url = buildSmsUrl(normalizedPhone, message);

    const response = await axios.get(url);
    assertGatewaySuccess(response.data);

    // Log for debugging if needed
    // console.log(`SMS sent to ${normalizedPhone}. Response:`, response.data);

    return response.data;
  } catch (error) {
    console.error('SMS Gateway Error:', error.message);
    throw new Error(`Failed to send SMS: ${error.message}`);
  }
};

/**
 * Wrapper for sendOTP to maintain compatibility with existing controllers
 * @param {string} mobile - The recipient's mobile number
 * @param {string} otp - The OTP to send
 * @returns {Promise<object>}
 */
const sendOTP = async (mobile, otp) => {
  const message = `Welcome! Your OTP to authenticate login/signup in Foodie app is ${otp}. Expires in 15 minutes - Veg Affair. www.foodievegaffair.com`;
  return sendSMS(mobile, message);
};

module.exports = { sendSMS, sendOTP, normalizePhoneNumber };
