const axios = require('axios');

async function testOTP() {
    const phoneNumber = '9977410569';
    const otp = '998877';

    const message = `Welcome! Your OTP to authenticate login/signup in Foodie app is ${otp}. Expires in 15 minutes - Veg Affair. www.foodievegaffair.com`;

    try {
        const encodedMessage = encodeURIComponent(message);
        const url = `http://sms.infinibs.com/http-tokenkeyapi.php?authentic-key=34385665674166666169723834331767177401&senderid=VEGAFF&route=1&number=${phoneNumber}&message=${encodedMessage}&templateid=1707176701177441483`;

        console.log('Sending exact OTP to 9977410569...');
        const response = await axios.get(url);
        console.log('Success! API Response:', response.data);
        process.exit(0);
    } catch (err) {
        console.error('Failed to send OTP:', err.message);
        process.exit(1);
    }
}

testOTP();
