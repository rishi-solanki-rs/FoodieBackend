const axios = require('axios');

/**
 * Sends an SMS using the custom HTTP SMS Gateway
 * @param {string} phoneNumber - The recipient's phone number
 * @param {string} message - The message content to send
 * @returns {Promise<object>} The API response
 */
const sendSMS = async (phoneNumber, message) => {
  try {
    const encodedMessage = encodeURIComponent(message);
    const url = `http://sms.infinibs.com/http-tokenkeyapi.php?authentic-key=3133494e46494e4942533633351766755055&senderid=VEGAFF&route=1&number=${phoneNumber}&message=${encodedMessage}`;
    
    const response = await axios.get(url);
    
    // Log for debugging if needed
    // console.log(`SMS sent to ${phoneNumber}. Response:`, response.data);
    
    return response.data;
  } catch (error) {
    console.error('SMS Gateway Error:', error.message);
    throw new Error('Failed to send SMS');
  }
};

/**
 * Wrapper for sendOTP to maintain compatibility with existing controllers
 * @param {string} mobile - The recipient's mobile number
 * @param {string} otp - The OTP to send
 * @returns {Promise<object>}
 */
const sendOTP = async (mobile, otp) => {
  const message = `Your OTP is: ${otp}. Valid for 5 minutes. Do not share it with anyone.`;
  return sendSMS(mobile, message);
};

module.exports = { sendSMS, sendOTP };
