const nodemailer = require('nodemailer');
let transporter = null;
const getTransporter = () => {
  if (!transporter) {
    if (!process.env.EMAIL_USER || !process.env.EMAIL_PASS) {
      console.warn('⚠️  Email credentials not configured in .env');
      return null;
    }
    transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS,
      },
    });
    transporter.verify((error, success) => {
      if (error) {
        console.error('❌ Email service configuration error:', error.message);
        console.error('Make sure to use Gmail App Password (not regular password)');
        console.error('Generate App Password: https://myaccount.google.com/apppasswords');
      } else {
        console.log('✅ Email service initialized and ready to send messages');
      }
    });
  }
  return transporter;
};
exports.sendOTPEmail = async (email, otp, name = 'User', purpose = 'registration') => {
  try {
    const transport = getTransporter();
    if (!transport) {
      console.warn('⚠️  Email service not initialized, skipping OTP email');
      return false;
    }
    const subject = purpose === 'registration' 
      ? '🔐 Verify Your Account - OTP Code'
      : purpose === 'reset'
      ? '🔒 Password Reset - OTP Code'
      : '🔐 Your OTP Code';
    const mailOptions = {
      from: process.env.EMAIL_FROM || process.env.EMAIL_USER,
      to: email,
      subject: subject,
      html: `
        <!DOCTYPE html>
        <html>
        <head>
          <style>
            body {
              font-family: 'Arial', sans-serif;
              background-color: #f4f4f4;
              margin: 0;
              padding: 0;
            }
            .container {
              max-width: 600px;
              margin: 40px auto;
              background-color: #ffffff;
              border-radius: 10px;
              box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
              overflow: hidden;
            }
            .header {
              background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
              color: white;
              padding: 30px;
              text-align: center;
            }
            .header h1 {
              margin: 0;
              font-size: 28px;
            }
            .content {
              padding: 40px 30px;
            }
            .otp-box {
              background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
              color: white;
              font-size: 36px;
              font-weight: bold;
              text-align: center;
              padding: 20px;
              border-radius: 8px;
              letter-spacing: 8px;
              margin: 30px 0;
            }
            .info-text {
              color: #666;
              font-size: 14px;
              line-height: 1.6;
              margin: 20px 0;
            }
            .warning {
              background-color: #fff3cd;
              border-left: 4px solid #ffc107;
              padding: 15px;
              margin: 20px 0;
              border-radius: 4px;
            }
            .footer {
              background-color: #f8f9fa;
              padding: 20px;
              text-align: center;
              color: #666;
              font-size: 12px;
            }
            .button {
              display: inline-block;
              background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
              color: white;
              padding: 12px 30px;
              text-decoration: none;
              border-radius: 5px;
              margin: 10px 0;
            }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h1>🍔 Food Delivery App</h1>
            </div>
            <div class="content">
              <h2>Hello ${name}!</h2>
              <p class="info-text">
                ${purpose === 'registration' 
                  ? 'Thank you for registering with us. Please use the OTP code below to verify your account.'
                  : purpose === 'reset'
                  ? 'You requested to reset your password. Please use the OTP code below to proceed.'
                  : 'Please use the OTP code below to complete your verification.'}
              </p>
              <div class="otp-box">${otp}</div>
              <p class="info-text">
                This OTP is valid for <strong>10 minutes</strong>. Please do not share this code with anyone.
              </p>
              <div class="warning">
                ⚠️ <strong>Security Alert:</strong> If you did not request this OTP, please ignore this email or contact our support team immediately.
              </div>
              <p class="info-text">
                Need help? Contact us at <a href="mailto:${process.env.EMAIL_USER}">${process.env.EMAIL_USER}</a>
              </p>
            </div>
            <div class="footer">
              <p>&copy; ${new Date().getFullYear()} Food Delivery App. All rights reserved.</p>
              <p>This is an automated message. Please do not reply to this email.</p>
            </div>
          </div>
        </body>
        </html>
      `,
      text: `
Hello ${name}!
${purpose === 'registration' 
  ? 'Thank you for registering with us. Please use the OTP code below to verify your account.'
  : purpose === 'reset'
  ? 'You requested to reset your password. Please use the OTP code below to proceed.'
  : 'Please use the OTP code below to complete your verification.'}
Your OTP Code: ${otp}
This OTP is valid for 10 minutes. Please do not share this code with anyone.
If you did not request this OTP, please ignore this email or contact our support team.
Best regards,
Food Delivery App Team
      `
    };
    const info = await transporter.sendMail(mailOptions);
    console.log(`✅ OTP email sent to ${email} - Message ID: ${info.messageId}`);
    return true;
  } catch (error) {
    console.error(`❌ Failed to send OTP email to ${email}:`, error.message);
    return false;
  }
};
exports.sendWelcomeEmail = async (email, name) => {
  try {
    const transport = getTransporter();
    if (!transport) {
      console.warn('⚠️  Email service not initialized, skipping welcome email');
      return false;
    }
    const mailOptions = {
      from: process.env.EMAIL_FROM || process.env.EMAIL_USER,
      to: email,
      subject: '🎉 Welcome to Food Delivery App!',
      html: `
        <!DOCTYPE html>
        <html>
        <head>
          <style>
            body {
              font-family: 'Arial', sans-serif;
              background-color: #f4f4f4;
              margin: 0;
              padding: 0;
            }
            .container {
              max-width: 600px;
              margin: 40px auto;
              background-color: #ffffff;
              border-radius: 10px;
              box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
              overflow: hidden;
            }
            .header {
              background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
              color: white;
              padding: 40px;
              text-align: center;
            }
            .content {
              padding: 40px 30px;
            }
            .footer {
              background-color: #f8f9fa;
              padding: 20px;
              text-align: center;
              color: #666;
              font-size: 12px;
            }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h1>🎉 Welcome!</h1>
            </div>
            <div class="content">
              <h2>Hello ${name}!</h2>
              <p>Welcome to Food Delivery App! Your account has been successfully verified.</p>
              <p>You can now enjoy delicious food from your favorite restaurants delivered right to your door.</p>
              <p>Start exploring and place your first order today!</p>
            </div>
            <div class="footer">
              <p>&copy; ${new Date().getFullYear()} Food Delivery App. All rights reserved.</p>
            </div>
          </div>
        </body>
        </html>
      `
    };
    const info = await transporter.sendMail(mailOptions);
    console.log(`✅ Welcome email sent to ${email}`);
    return true;
  } catch (error) {
    console.error(`❌ Failed to send welcome email to ${email}:`, error.message);
    return false;
  }
};
exports.sendOrderConfirmationEmail = async (email, name, orderId, amount) => {
  try {
    const transport = getTransporter();
    if (!transport) {
      console.warn('⚠️  Email service not initialized, skipping order confirmation email');
      return false;
    }
    const mailOptions = {
      from: process.env.EMAIL_FROM || process.env.EMAIL_USER,
      to: email,
      subject: `✅ Order Confirmed - #${orderId}`,
      html: `
        <!DOCTYPE html>
        <html>
        <head>
          <style>
            body {
              font-family: 'Arial', sans-serif;
              background-color: #f4f4f4;
              margin: 0;
              padding: 0;
            }
            .container {
              max-width: 600px;
              margin: 40px auto;
              background-color: #ffffff;
              border-radius: 10px;
              box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
              overflow: hidden;
            }
            .header {
              background: linear-gradient(135deg, #10b981 0%, #059669 100%);
              color: white;
              padding: 30px;
              text-align: center;
            }
            .content {
              padding: 40px 30px;
            }
            .order-details {
              background-color: #f8f9fa;
              padding: 20px;
              border-radius: 8px;
              margin: 20px 0;
            }
            .footer {
              background-color: #f8f9fa;
              padding: 20px;
              text-align: center;
              color: #666;
              font-size: 12px;
            }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h1>✅ Order Confirmed!</h1>
            </div>
            <div class="content">
              <h2>Hi ${name}!</h2>
              <p>Your order has been confirmed and is being prepared.</p>
              <div class="order-details">
                <h3>Order Details</h3>
                <p><strong>Order ID:</strong> ${orderId}</p>
                <p><strong>Total Amount:</strong> ₹${amount}</p>
              </div>
              <p>We'll notify you when your order is on its way!</p>
            </div>
            <div class="footer">
              <p>&copy; ${new Date().getFullYear()} Food Delivery App. All rights reserved.</p>
            </div>
          </div>
        </body>
        </html>
      `
    };
    await transport.sendMail(mailOptions);
    console.log(`✅ Order confirmation email sent to ${email}`);
    return true;
  } catch (error) {
    console.error(`❌ Failed to send order confirmation to ${email}:`, error.message);
    return false;
  }
};
module.exports = {
  sendOTPEmail: exports.sendOTPEmail,
  sendWelcomeEmail: exports.sendWelcomeEmail,
  sendOrderConfirmationEmail: exports.sendOrderConfirmationEmail,
  getTransporter
};
