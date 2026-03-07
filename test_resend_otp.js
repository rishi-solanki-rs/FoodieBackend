
const axios = require('axios');
const BASE_URL = 'http://192.168.1.67:5000/api/orders';
const RIDER_TOKEN = 'your_rider_jwt_token';
const RESTAURANT_TOKEN = 'your_restaurant_jwt_token';
const CUSTOMER_TOKEN = 'your_customer_jwt_token';
const ORDER_ID = 'your_order_id';
async function testResendPickupOTP() {
  console.log('\n========== TEST: Resend Pickup OTP (As Rider) ==========\n');
  try {
    const response = await axios.post(
      `${BASE_URL}/${ORDER_ID}/resend-otp`,
      {
        otpType: 'pickup'
      },
      {
        headers: {
          'Authorization': `Bearer ${RIDER_TOKEN}`,
          'Content-Type': 'application/json'
        }
      }
    );
    console.log('✅ Success:', response.data);
    console.log('New Pickup OTP:', response.data.data.otp);
    console.log('Expires At:', response.data.data.expiresAt);
  } catch (error) {
    console.error('❌ Error:', error.response?.data || error.message);
  }
}
async function testResendDeliveryOTP() {
  console.log('\n========== TEST: Resend Delivery OTP (As Customer) ==========\n');
  try {
    const response = await axios.post(
      `${BASE_URL}/${ORDER_ID}/resend-otp`,
      {
        otpType: 'delivery'
      },
      {
        headers: {
          'Authorization': `Bearer ${CUSTOMER_TOKEN}`,
          'Content-Type': 'application/json'
        }
      }
    );
    console.log('✅ Success:', response.data);
    console.log('New Delivery OTP:', response.data.data.otp);
    console.log('Expires At:', response.data.data.expiresAt);
  } catch (error) {
    console.error('❌ Error:', error.response?.data || error.message);
  }
}
async function testInvalidOTPType() {
  console.log('\n========== TEST: Invalid OTP Type ==========\n');
  try {
    const response = await axios.post(
      `${BASE_URL}/${ORDER_ID}/resend-otp`,
      {
        otpType: 'invalid'
      },
      {
        headers: {
          'Authorization': `Bearer ${RIDER_TOKEN}`,
          'Content-Type': 'application/json'
        }
      }
    );
    console.log('Response:', response.data);
  } catch (error) {
    console.error('❌ Expected Error:', error.response?.data?.message);
  }
}
async function testRateLimiting() {
  console.log('\n========== TEST: Rate Limiting (Spam Prevention) ==========\n');
  try {
    console.log('Request 1...');
    const response1 = await axios.post(
      `${BASE_URL}/${ORDER_ID}/resend-otp`,
      { otpType: 'pickup' },
      {
        headers: {
          'Authorization': `Bearer ${RIDER_TOKEN}`,
          'Content-Type': 'application/json'
        }
      }
    );
    console.log('✅ First request succeeded');
    console.log('\nRequest 2 (immediate)...');
    const response2 = await axios.post(
      `${BASE_URL}/${ORDER_ID}/resend-otp`,
      { otpType: 'pickup' },
      {
        headers: {
          'Authorization': `Bearer ${RIDER_TOKEN}`,
          'Content-Type': 'application/json'
        }
      }
    );
    console.log('Response:', response2.data);
  } catch (error) {
    console.error('❌ Rate Limited (Expected):', error.response?.data?.message);
    console.log('Wait Time:', error.response?.data?.waitSeconds, 'seconds');
  }
}
async function runAllTests() {
  console.log('\n╔════════════════════════════════════════╗');
  console.log('║   OTP RESEND ENDPOINT TEST SUITE      ║');
  console.log('╚════════════════════════════════════════╝');
  console.log('\n⚠️  Make sure to update the following variables:');
  console.log('   - RIDER_TOKEN');
  console.log('   - RESTAURANT_TOKEN');
  console.log('   - CUSTOMER_TOKEN');
  console.log('   - ORDER_ID (order must have assigned rider)');
  console.log('\nPress Ctrl+C to cancel or wait 3 seconds to continue...\n');
  await new Promise(resolve => setTimeout(resolve, 3000));
  await testResendPickupOTP();
  await testResendDeliveryOTP();
  await testInvalidOTPType();
  await testRateLimiting();
  console.log('\n\n✅ All tests completed!');
}
function printCurlExamples() {
  console.log('\n╔════════════════════════════════════════╗');
  console.log('║      MANUAL TESTING WITH CURL          ║');
  console.log('╚════════════════════════════════════════╝\n');
  console.log('1. Resend Pickup OTP (As Rider):');
  console.log(`curl -X POST ${BASE_URL}/{orderId}/resend-otp \\
  -H "Authorization: Bearer {rider_token}" \\
  -H "Content-Type: application/json" \\
  -d '{"otpType": "pickup"}'\n`);
  console.log('2. Resend Pickup OTP (As Restaurant):');
  console.log(`curl -X POST ${BASE_URL}/{orderId}/resend-otp \\
  -H "Authorization: Bearer {restaurant_token}" \\
  -H "Content-Type: application/json" \\
  -d '{"otpType": "pickup"}'\n`);
  console.log('3. Resend Delivery OTP (As Customer):');
  console.log(`curl -X POST ${BASE_URL}/{orderId}/resend-otp \\
  -H "Authorization: Bearer {customer_token}" \\
  -H "Content-Type: application/json" \\
  -d '{"otpType": "delivery"}'\n`);
  console.log('4. Resend Delivery OTP (As Rider):');
  console.log(`curl -X POST ${BASE_URL}/{orderId}/resend-otp \\
  -H "Authorization: Bearer {rider_token}" \\
  -H "Content-Type: application/json" \\
  -d '{"otpType": "delivery"}'\n`);
}
if (process.argv[2] === 'curl') {
  printCurlExamples();
} else {
  runAllTests();
}
