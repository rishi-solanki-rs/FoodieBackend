const fs = require('fs');
const path = require('path');
const base = path.join('g:', 'WORKING', 'Backend');
const postmanPath = path.join(base, 'Postman_Collection_FoodDelivery_Complete.json');
const remainingPath = path.join(base, 'Postman_Collection_FoodDelivery_Remaining.json');
const postman = JSON.parse(fs.readFileSync(postmanPath, 'utf8'));
const defaultHeaders = (auth = true) => {
  const headers = [{ key: 'Content-Type', value: 'application/json' }];
  if (auth) headers.push({ key: 'Authorization', value: 'Bearer {{TOKEN}}' });
  return headers;
};
const makeUrl = (route) => {
  const clean = route.startsWith('/') ? route.slice(1) : route;
  const parts = clean.split('/');
  return {
    raw: `{{BASE_URL}}/${clean}`,
    host: ['{{BASE_URL}}'],
    path: parts,
  };
};
const makeRequest = (name, method, route, body, auth = true) => {
  const request = {
    method,
    header: defaultHeaders(auth),
    url: makeUrl(route),
  };
  if (body) {
    request.body = { mode: 'raw', raw: JSON.stringify(body, null, 2) };
  }
  return { name, request };
};
const remainingFolder = {
  name: 'Remaining Routes (Auto)',
  item: [
    {
      name: 'Auth (Missing)',
      item: [
        makeRequest('Check Verification Status', 'POST', '/api/auth/check-verification-status', {
          mobile: '9876543210',
          role: 'customer'
        }, false),
        makeRequest('Resend OTP', 'POST', '/api/auth/resend-otp', {
          mobile: '9876543210'
        }, false),
        makeRequest('Forgot Password - Initiate', 'POST', '/api/auth/forgot-password', {
          email: 'test@example.com'
        }, false),
        makeRequest('Forgot Password - Resend OTP', 'POST', '/api/auth/forgot-password/resend-otp', {
          mobile: '9876543210'
        }, false),
        makeRequest('Forgot Password - Verify OTP', 'POST', '/api/auth/forgot-password/verify-otp', {
          mobile: '9876543210',
          otp: '123456'
        }, false),
        makeRequest('Reset Password', 'POST', '/api/auth/reset-password', {
          mobile: '9876543210',
          otp: '123456',
          newPassword: 'NewPassword123!'
        }, false),
      ],
    },
    {
      name: 'Cart (Missing)',
      item: [
        makeRequest('Get Cart (Slash)', 'GET', '/api/cart/', null, true),
        makeRequest('Update Item Quantity', 'PATCH', '/api/cart/item/:itemId/quantity', {
          quantity: 2
        }, true),
        makeRequest('Validate Coupon', 'POST', '/api/cart/validate-coupon', {
          couponCode: 'SAVE20'
        }, true),
      ],
    },
    {
      name: 'Cities/Zones/Food Quantities (Missing)',
      item: [
        makeRequest('Get Public Cities (Slash)', 'GET', '/api/cities/', null, false),
        makeRequest('Get Public Zones (Slash)', 'GET', '/api/zones/', null, false),
        makeRequest('Get Public Food Quantities (Slash)', 'GET', '/api/food-quantities/', null, false),
      ],
    },
    {
      name: 'Home (Missing)',
      item: [
        makeRequest('Get Home Data (Slash)', 'GET', '/api/home/', null, true),
        makeRequest('Get Categories', 'GET', '/api/home/categories', null, true),
        makeRequest('Get Explore Restaurants', 'GET', '/api/home/explore', null, true),
        makeRequest('Get Recommended Restaurants', 'GET', '/api/home/recommended', null, true),
      ],
    },
    {
      name: 'Orders (Missing)',
      item: [
        makeRequest('Get Order Details', 'GET', '/api/orders/:id/details', null, true),
        makeRequest('Reject Order (Restaurant)', 'PUT', '/api/orders/:id/reject', {
          reason: 'Out of stock'
        }, true),
        makeRequest('Resend OTP', 'POST', '/api/orders/:id/resend-otp', {
          otpType: 'pickup'
        }, true),
        makeRequest('Get Pending Restaurant Orders', 'GET', '/api/orders/restaurant/pending', null, true),
      ],
    },
    {
      name: 'Restaurants (Missing)',
      item: [
        makeRequest('Get All Restaurants (Slash)', 'GET', '/api/restaurants/', null, false),
        makeRequest('Get Restaurant Details (Protected)', 'GET', '/api/restaurants/:id/details', null, true),
        makeRequest('Admin Update Restaurant', 'PUT', '/api/restaurants/admin/:id', {
          name: { en: 'Updated Restaurant' },
          deliveryTime: 35
        }, true),
        makeRequest('Admin Update Bank Details', 'PUT', '/api/restaurants/admin/:id/bank', {
          bankDetails: {
            accountName: 'Restaurant Name',
            accountNumber: '1234567890',
            bankName: 'SBI',
            ifsc: 'SBIN0001234'
          }
        }, true),
        makeRequest('Admin Update Documents', 'PUT', '/api/restaurants/admin/:id/documents', {
          documents: {
            license: { number: 'LIC123' },
            pan: { number: 'PAN123' },
            gst: { number: 'GST123' }
          }
        }, true),
        makeRequest('Admin Approved Restaurants', 'GET', '/api/restaurants/admin/approvedlist', null, true),
        makeRequest('Admin Reject Restaurant', 'PUT', '/api/restaurants/admin/reject/:id', {
          reason: 'Incomplete documents'
        }, true),
      ],
    },
    {
      name: 'Reviews (Missing)',
      item: [
        makeRequest('Create Review', 'POST', '/api/reviews/', {
          orderId: 'ORDER_ID',
          restaurantRating: 5,
          riderRating: 5,
          comment: 'Great service',
          photos: []
        }, true),
      ],
    },
    {
      name: 'Search (Missing)',
      item: [
        makeRequest('Global Search (Slash)', 'GET', '/api/search/', null, true),
      ],
    },
    {
      name: 'User (Missing)',
      item: [
        makeRequest('Change Password', 'PUT', '/api/user/change-password', {
          oldPassword: 'OldPassword123!',
          newPassword: 'NewPassword123!'
        }, true),
        makeRequest('Get Favorite Products', 'GET', '/api/user/favorites/products', null, true),
        makeRequest('Toggle Favorite Product', 'POST', '/api/user/favorites/products/:id', null, true),
        makeRequest('Get Favorite Restaurants', 'GET', '/api/user/favorites/restaurants', null, true),
        makeRequest('Toggle Favorite Restaurant', 'POST', '/api/user/favorites/restaurants/:id', null, true),
        makeRequest('Get Payment Methods', 'GET', '/api/user/payment-methods', null, true),
        makeRequest('Profile Update - Verify OTP', 'POST', '/api/user/profile/verify-otp', {
          otp: '123456'
        }, true),
        makeRequest('Profile Update - Resend OTP', 'POST', '/api/user/profile/resend-otp', {
          reason: 'resend'
        }, true),
      ],
    },
    {
      name: 'Wallet (Missing)',
      item: [
        makeRequest('Get Wallet (Slash)', 'GET', '/api/wallet/', null, true),
        makeRequest('Get Wallet By User', 'GET', '/api/wallet/:userId', null, true),
        makeRequest('Get Wallet Transactions', 'GET', '/api/wallet/:userId/transactions', null, true),
        makeRequest('Add Money', 'POST', '/api/wallet/add/money', {
          amount: 500,
          transactionId: 'txn_123456'
        }, true),
        makeRequest('Admin Get All Wallets', 'GET', '/api/wallet/admin/all', null, true),
        makeRequest('Admin Create Wallet', 'POST', '/api/wallet/admin/create', {
          userId: 'USER_ID'
        }, true),
        makeRequest('Admin Update Wallet Balance', 'PUT', '/api/wallet/admin/update-balance', {
          userId: 'USER_ID',
          amount: 100,
          type: 'credit'
        }, true),
        makeRequest('Admin Delete Transaction', 'DELETE', '/api/wallet/admin/transaction/:transactionId', null, true),
      ],
    },
    {
      name: 'Admin (Missing)',
      item: [
        makeRequest('Dashboard Overview', 'GET', '/api/admin/dashboard/overview', null, true),
        makeRequest('Order Dashboard (Alt)', 'GET', '/api/admin/order-dashboard', null, true),
        makeRequest('Pending Menus', 'GET', '/api/admin/pending-menus', null, true),
        makeRequest('Pending Menus By Restaurant', 'GET', '/api/admin/pending-menus/by-restaurant', null, true),
        makeRequest('Menu Stats', 'GET', '/api/admin/menu-stats', null, true),
        makeRequest('Admin Restaurant Menu', 'GET', '/api/admin/menu/:restaurantId', null, true),
        makeRequest('Admin Update Menu Item', 'PUT', '/api/admin/menu/:id', {
          name: { en: 'Updated Item' },
          basePrice: 199
        }, true),
        makeRequest('Admin Delete Menu Item', 'DELETE', '/api/admin/menu/:id', null, true),
        makeRequest('Admin Verify Restaurant Documents', 'PUT', '/api/admin/restaurants/verify/:id', {
          action: 'verify',
          notes: 'Documents verified'
        }, true),
        makeRequest('Admin Addon By ID', 'GET', '/api/admin/addon/:id', null, true),
        makeRequest('Admin Update Addon', 'PUT', '/api/admin/addon/:id', {
          name: 'Extra Cheese',
          price: 50
        }, true),
        makeRequest('Admin Delete Addon', 'DELETE', '/api/admin/addon/:id', null, true),
        makeRequest('Admin Brand By ID', 'GET', '/api/admin/brand/:id', null, true),
        makeRequest('Admin Update Brand', 'PUT', '/api/admin/brand/:id', {
          name: 'Updated Brand',
          status: 'active'
        }, true),
        makeRequest('Admin Delete Brand', 'DELETE', '/api/admin/brand/:id', null, true),
        makeRequest('Admin Cancellation Reason By ID', 'GET', '/api/admin/cancellation-reason/:id', null, true),
        makeRequest('Admin Update Cancellation Reason', 'PUT', '/api/admin/cancellation-reason/:id', {
          reason: 'Updated reason',
          userType: 'customer'
        }, true),
        makeRequest('Admin Delete Cancellation Reason', 'DELETE', '/api/admin/cancellation-reason/:id', null, true),
        makeRequest('Admin Cuisine By ID', 'GET', '/api/admin/cuisine/:id', null, true),
        makeRequest('Admin Update Cuisine', 'PUT', '/api/admin/cuisine/:id', {
          name: 'Updated Cuisine'
        }, true),
        makeRequest('Admin Delete Cuisine', 'DELETE', '/api/admin/cuisine/:id', null, true),
        makeRequest('Admin Document Type By ID', 'GET', '/api/admin/document-type/:id', null, true),
        makeRequest('Admin Update Document Type', 'PUT', '/api/admin/document-type/:id', {
          name: 'License',
          type: 'license',
          hasExpiry: true,
          status: 'active'
        }, true),
        makeRequest('Admin Delete Document Type', 'DELETE', '/api/admin/document-type/:id', null, true),
      ],
    },
    {
      name: 'Reports (Missing)',
      item: [
        makeRequest('Export Report', 'GET', '/api/admin/reports/export/:reportType', null, true),
      ],
    },
  ],
};
const existingIndex = (postman.item || []).findIndex((item) => item.name === remainingFolder.name);
if (existingIndex >= 0) {
  postman.item[existingIndex] = remainingFolder;
} else {
  postman.item = postman.item || [];
  postman.item.push(remainingFolder);
}
fs.writeFileSync(postmanPath, JSON.stringify(postman, null, 2));
const remainingCollection = {
  info: postman.info,
  variable: postman.variable,
  item: [remainingFolder],
};
fs.writeFileSync(remainingPath, JSON.stringify(remainingCollection, null, 2));
console.log('Updated Postman collection and wrote remaining routes file.');
