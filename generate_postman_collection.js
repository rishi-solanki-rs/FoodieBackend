const fs = require('fs');
function createRequest(method, path, name, body = null, auth = false, query = []) {
  const headers = [{ key: 'Content-Type', value: 'application/json' }];
  if (auth) {
    headers.push({ key: 'Authorization', value: 'Bearer {{TOKEN}}' });
  }
  const urlParts = path.split('/').filter(p => p);
  const url = {
    raw: `{{BASE_URL}}/${path}`,
    host: ['{{BASE_URL}}'],
    path: urlParts
  };
  if (query.length > 0) {
    url.query = query;
  }
  const request = {
    method: method.toUpperCase(),
    header: headers,
    url: url
  };
  if (body) {
    request.body = {
      mode: 'raw',
      raw: typeof body === 'string' ? body : JSON.stringify(body, null, 2)
    };
  }
  return {
    name: name,
    request: request
  };
}
const collection = {
  info: {
    name: 'Food Delivery Backend — API Testing',
    description: 'Complete API collection for Food Delivery Backend',
    schema: 'https://schema.getpostman.com/json/collection/v2.1.0/collection.json'
  },
  variable: [
    { key: 'BASE_URL', value: 'http://192.168.43.215:5000', type: 'string' },
    { key: 'TOKEN', value: '', type: 'string' }
  ],
  item: []
};
const authFolder = {
  name: 'Auth',
  item: [
    createRequest('POST', 'api/auth/register/initiate', 'Register Initiate', {
      name: 'Test User',
      email: 'test@example.com',
      password: 'Password123!',
      mobile: '9876543210',
      role: 'customer'
    }),
    createRequest('POST', 'api/auth/register/verify', 'Register Verify', {
      mobile: '9876543210',
      otp: '123456'
    }),
    createRequest('POST', 'api/auth/login', 'Login', {
      email: 'test@example.com',
      password: 'Password123!'
    }),
    createRequest('POST', 'api/auth/logout', 'Logout', null, true)
  ]
};
collection.item.push(authFolder);
const riderAuthFolder = {
  name: 'Rider Auth',
  item: [
    createRequest('POST', 'api/riders/auth/register/initiate', 'Rider Register Initiate', {
      mobile: '9876543210',
      password: 'Rider@123'
    }),
    createRequest('POST', 'api/riders/auth/register/verify', 'Rider Register Verify', {
      mobile: '9876543210',
      otp: '123456'
    })
  ]
};
collection.item.push(riderAuthFolder);
const userFolder = {
  name: 'User',
  item: [
    createRequest('GET', 'api/user/profile', 'Get Profile', null, true),
    createRequest('PUT', 'api/user/profile', 'Update Profile', {
      name: 'Updated Name',
      email: 'updated@example.com',
      mobile: '9876543210',
      language: 'en',
      profilePic: 'https://example.com/pic.jpg'
    }, true),
    createRequest('POST', 'api/user/address', 'Add Address', {
      label: 'Home',
      addressLine: '123 Main St',
      city: 'Indore',
      zipCode: '452001',
      location: { type: 'Point', coordinates: [75.8577, 22.7196] },
      deliveryInstructions: 'Ring doorbell',
      isDefault: true
    }, true),
    createRequest('PUT', 'api/user/address/:id', 'Update Address', {
      label: 'Work',
      addressLine: '456 Office St',
      city: 'Indore',
      zipCode: '452002',
      isDefault: false
    }, true),
    createRequest('DELETE', 'api/user/address/:id', 'Delete Address', null, true),
    createRequest('POST', 'api/user/payment-method', 'Add Payment Method', {
      type: 'Card',
      provider: 'Visa',
      token: 'tok_123456',
      last4: '4242',
      isDefault: true
    }, true),
    createRequest('GET', 'api/user/refunds', 'Get My Refunds', null, true),
    createRequest('DELETE', 'api/user/account', 'Delete Account', null, true)
  ]
};
collection.item.push(userFolder);
const cartFolder = {
  name: 'Cart',
  item: [
    createRequest('GET', 'api/cart', 'Get Cart', null, true),
    createRequest('POST', 'api/cart/item', 'Add to Cart', {
      restaurantId: 'RESTAURANT_ID',
      productId: 'PRODUCT_ID',
      quantity: 2,
      variationId: 'VARIATION_ID',
      addOnsIds: ['ADDON_ID_1', 'ADDON_ID_2']
    }, true),
    createRequest('DELETE', 'api/cart/item/:itemId', 'Remove Item', null, true),
    createRequest('PUT', 'api/cart/meta', 'Update Cart Meta', {
      couponCode: 'SAVE20',
      tip: 10
    }, true)
  ]
};
collection.item.push(cartFolder);
const walletFolder = {
  name: 'Wallet',
  item: [
    createRequest('GET', 'api/wallet', 'Get Wallet Details', null, true),
    createRequest('POST', 'api/wallet/add', 'Add Money to Wallet', {
      amount: 500,
      transactionId: 'txn_123456'
    }, true)
  ]
};
collection.item.push(walletFolder);
const homeFolder = {
  name: 'Home',
  item: [
    createRequest('GET', 'api/home', 'Get Home Data', null, true, [
      { key: 'lat', value: '22.7196' },
      { key: 'long', value: '75.8577' }
    ]),
    createRequest('GET', 'api/home/banners', 'Get Banners', null, true)
  ]
};
collection.item.push(homeFolder);
const searchFolder = {
  name: 'Search',
  item: [
    createRequest('GET', 'api/search/landing', 'Get Search Landing', null, true),
    createRequest('GET', 'api/search/suggestions', 'Get Suggestions', null, false, [
      { key: 'q', value: 'pizza' }
    ]),
    createRequest('GET', 'api/search', 'Global Search', null, true, [
      { key: 'q', value: 'pizza' },
      { key: 'isVeg', value: 'true' },
      { key: 'minPrice', value: '100' },
      { key: 'maxPrice', value: '500' }
    ]),
    createRequest('DELETE', 'api/search/history', 'Clear Search History', null, true)
  ]
};
collection.item.push(searchFolder);
const menuFolder = {
  name: 'Menu',
  item: [
    createRequest('GET', 'api/menu/:restaurantId', 'Get Menu', null, false),
    createRequest('GET', 'api/menu/seasonal/:restaurantId', 'Get Seasonal Menu', null, false, [
      { key: 'tag', value: 'Summer' }
    ]),
    createRequest('POST', 'api/menu/category', 'Add Category', {
      name: { en: 'Starters' }
    }, true),
    createRequest('PUT', 'api/menu/category/:id', 'Edit Category', {
      name: { en: 'Appetizers' },
      image: 'https://example.com/image.jpg'
    }, true),
    createRequest('DELETE', 'api/menu/category/:id', 'Delete Category', null, true),
    createRequest('POST', 'api/menu/item', 'Add Food Item', {
      categoryId: 'CATEGORY_ID',
      name: { en: 'Margherita Pizza' },
      description: { en: 'Classic pizza' },
      basePrice: 299,
      isVeg: true,
      variations: [],
      addOns: []
    }, true),
    createRequest('PUT', 'api/menu/item/:id', 'Edit Product', {
      basePrice: 349,
      name: { en: 'Margherita Pizza Large' },
      available: true
    }, true),
    createRequest('DELETE', 'api/menu/item/:id', 'Delete Product', null, true),
    createRequest('PUT', 'api/menu/bulk/items', 'Bulk Update Products', {
      updates: [
        { productId: 'PRODUCT_ID_1', basePrice: 299, available: true },
        { productId: 'PRODUCT_ID_2', basePrice: 399, available: true }
      ]
    }, true),
    createRequest('PUT', 'api/menu/item/:id/availability', 'Toggle Product Availability', {
      available: false
    }, true),
    createRequest('PUT', 'api/menu/bulk/prices', 'Bulk Update Prices', {
      updates: [{ productId: 'PRODUCT_ID', newPrice: 299 }]
    }, true)
  ]
};
collection.item.push(menuFolder);
const restaurantsFolder = {
  name: 'Restaurants',
  item: [
    createRequest('GET', 'api/restaurants', 'Get All Restaurants', null, false),
    createRequest('GET', 'api/restaurants/:id', 'Get Restaurant By ID', null, false),
    createRequest('POST', 'api/restaurants/:id/favorite', 'Toggle Favorite', null, true),
    createRequest('POST', 'api/restaurants/apply', 'Apply for Restaurant', {
      name: { en: 'My Restaurant' },
      description: { en: 'Great food' },
      cuisine: ['CUISINE_ID'],
      address: '123 Main St',
      city: 'Indore',
      area: 'Area 1',
      location: { type: 'Point', coordinates: [75.8577, 22.7196] },
      contactNumber: '9876543210',
      email: 'restaurant@example.com',
      deliveryTime: 30,
      deliveryType: ['Home Delivery'],
      paymentMethods: 'Both',
      image: 'https://example.com/image.jpg',
      brand: 'BRAND_ID',
      bankDetails: {
        accountName: 'Restaurant Name',
        accountNumber: '1234567890',
        bankName: 'SBI',
        ifsc: 'SBIN0001234'
      },
      timing: {
        monday: { open: '09:00', close: '22:00', isOpen: true },
        tuesday: { open: '09:00', close: '22:00', isOpen: true }
      }
    }, true),
    createRequest('PUT', 'api/restaurants/:id', 'Update Restaurant', {
      name: { en: 'Updated Restaurant Name' },
      deliveryTime: 35
    }, true),
    createRequest('PUT', 'api/restaurants/:id/documents', 'Update Documents', {
      documents: {
        license: { url: 'https://example.com/license.jpg', number: 'LIC123', expiry: '2025-12-31' },
        pan: { url: 'https://example.com/pan.jpg', number: 'PAN123' },
        gst: { url: 'https://example.com/gst.jpg', number: 'GST123' }
      }
    }, true),
    createRequest('PUT', 'api/restaurants/:id/bank', 'Update Bank Details', {
      bankDetails: {
        accountName: 'Restaurant Name',
        accountNumber: '1234567890',
        bankName: 'SBI',
        ifsc: 'SBIN0001234'
      }
    }, true),
    createRequest('GET', 'api/restaurants/dashboard', 'Get Dashboard', null, true),
    createRequest('PUT', 'api/restaurants/:id/settings', 'Update Settings', {
      timing: { monday: { open: '10:00', close: '23:00', isOpen: true } },
      minOrderValue: 100,
      packagingCharge: 10
    }, true),
    createRequest('GET', 'api/restaurants/finance/summary', 'Finance Summary', null, true, [
      { key: 'period', value: 'day' },
      { key: 'from', value: '2024-01-01' },
      { key: 'to', value: '2024-01-31' }
    ]),
    createRequest('GET', 'api/restaurants/finance/bestsellers', 'Best Sellers', null, true),
    createRequest('GET', 'api/restaurants/finance/settlement', 'Settlement Report', null, true, [
      { key: 'from', value: '2024-01-01' },
      { key: 'to', value: '2024-01-31' },
      { key: 'format', value: 'json' }
    ]),
    createRequest('GET', 'api/restaurants/finance/order/:orderId/invoice', 'Get Order Invoice', null, true),
    createRequest('POST', 'api/restaurants/promocode', 'Create Owner Promocode', {
      code: 'OWNER20',
      discountValue: 20,
      offerType: 'percent',
      minOrderValue: 200,
      expiryDate: '2024-12-31'
    }, true),
    createRequest('GET', 'api/restaurants/promocode', 'Get Owner Promocodes', null, true),
    createRequest('PUT', 'api/restaurants/promocode/:id', 'Update Owner Promocode', {
      discountValue: 25,
      expiryDate: '2024-12-31'
    }, true),
    createRequest('DELETE', 'api/restaurants/promocode/:id', 'Delete Owner Promocode', null, true),
    createRequest('POST', 'api/restaurants/admin/create', 'Admin Create Restaurant', {
      ownerName: 'Owner Name',
      ownerEmail: 'owner@example.com',
      ownerMobile: '9876543210',
      ownerPassword: 'Password123!',
      name: { en: 'Restaurant Name' },
      description: { en: 'Description' },
      cuisine: ['CUISINE_ID'],
      address: '123 Main St',
      city: 'Indore',
      area: 'Area 1',
      location: { type: 'Point', coordinates: [75.8577, 22.7196] },
      contactNumber: '9876543210',
      email: 'restaurant@example.com',
      deliveryTime: 30,
      packagingCharge: 10,
      adminCommission: 15,
      isFreeDelivery: true,
      freeDeliveryContribution: 200
    }, true),
    createRequest('GET', 'api/restaurants/admin/pending', 'Get Pending Restaurants', null, true),
    createRequest('PUT', 'api/restaurants/admin/approve/:id', 'Approve Restaurant', null, true),
    createRequest('GET', 'api/restaurants/admin/list', 'Get All Restaurants (Admin)', null, true),
    createRequest('GET', 'api/restaurants/admin/listName', 'Get All Restaurant Names', null, true),
    createRequest('GET', 'api/restaurants/admin/list/active', 'Get Active Restaurants', null, true),
    createRequest('PUT', 'api/restaurants/admin/verify/:id', 'Verify Restaurant Documents', {
      action: 'verify',
      notes: 'Documents verified'
    }, true),
    createRequest('DELETE', 'api/restaurants/:id', 'Delete Restaurant', null, true)
  ]
};
collection.item.push(restaurantsFolder);
const ordersFolder = {
  name: 'Orders',
  item: [
    createRequest('POST', 'api/orders/place', 'Place Order', {
      addressId: 'ADDRESS_ID',
      paymentMethod: 'wallet',
      paymentId: 'PAYMENT_ID'
    }, true),
    createRequest('GET', 'api/orders/my-orders', 'Get My Orders', null, true),
    createRequest('GET', 'api/orders/:id/track', 'Track Order', null, true),
    createRequest('POST', 'api/orders/rate', 'Rate Order', {
      orderId: 'ORDER_ID',
      restaurantRating: 5,
      riderRating: 5,
      comment: 'Great service!',
      photos: []
    }, true),
    createRequest('POST', 'api/orders/:id/reorder', 'Reorder', null, true),
    createRequest('POST', 'api/orders/:id/report', 'Report Issue', {
      issue: 'Food was cold'
    }, true),
    createRequest('GET', 'api/orders/restaurant', 'Get Restaurant Orders', null, true),
    createRequest('PUT', 'api/orders/:id/status', 'Update Order Status', {
      status: 'accepted'
    }, true),
    createRequest('PUT', 'api/orders/:id/ready', 'Mark Order Ready', null, true),
    createRequest('PUT', 'api/orders/:id/owner-cancel', 'Owner Cancel Order', {
      reason: 'Out of stock',
      refundAmount: 0
    }, true),
    createRequest('PUT', 'api/orders/:id/delay', 'Delay Order', {
      delayMinutes: 15
    }, true),
    createRequest('GET', 'api/orders/rider/available', 'Get Available Orders', null, true),
    createRequest('PUT', 'api/orders/:id/accept', 'Accept Order', {}, true),
    createRequest('PUT', 'api/orders/:id/arrive-restaurant', 'Arrive at Restaurant', null, true),
    createRequest('PUT', 'api/orders/:id/pickup', 'Pickup Order', null, true),
    createRequest('PUT', 'api/orders/:id/arrive-customer', 'Arrive at Customer', null, true),
    createRequest('PUT', 'api/orders/:id/collect-cash', 'Collect Cash (COD)', {
      amount: 500
    }, true),
    createRequest('PUT', 'api/orders/:id/deliver', 'Complete Delivery', {
      otp: '1234'
    }, true),
    createRequest('GET', 'api/orders/admin/all', 'Get All Orders (Admin)', null, true, [
      { key: 'status', value: 'placed' },
      { key: 'date', value: '2024-01-01' }
    ]),
    createRequest('GET', 'api/orders/admin/failed', 'Get Failed Orders', null, true),
    createRequest('GET', 'api/orders/admin/:id', 'Get Order Details (Admin)', null, true),
    createRequest('PUT', 'api/orders/admin/:id/assign', 'Admin Assign Rider', {
      riderId: 'RIDER_ID'
    }, true),
    createRequest('PUT', 'api/orders/admin/:id/status', 'Admin Update Status', {
      status: 'delivered'
    }, true),
    createRequest('PUT', 'api/orders/admin/:id/cancel', 'Admin Cancel Order', {
      reason: 'Customer request',
      refundAmount: 500
    }, true),
    createRequest('POST', 'api/orders/admin/:id/retry-payment', 'Admin Retry Payment', {
      result: 'paid',
      note: 'Payment retried successfully'
    }, true),
    createRequest('PUT', 'api/orders/admin/:id/resolve', 'Admin Resolve Failed Order', {
      resolutionNote: 'Order resolved'
    }, true)
  ]
};
collection.item.push(ordersFolder);
const ridersFolder = {
  name: 'Riders',
  item: [
    createRequest('PATCH', 'api/riders/profile', 'Update Rider Profile', {
      name: 'Rider Name',
      email: 'rider@example.com',
      address: {
        street: '123 Rider St',
        city: 'Indore',
        state: 'MP',
        country: 'India',
        zipCode: '452001'
      }
    }, true),
    createRequest('POST', 'api/riders/onboard', 'Onboard Rider', {
      address: {
        street: 'Near Temple',
        city: 'Indore',
        state: 'MP',
        country: 'India',
        zipCode: '452001'
      },
      workCity: 'Indore',
      workZone: 'Zone-1',
      vehicle: {
        type: 'BIKE_VEHICLE_ID',
        model: 'Splendor',
        number: 'MP09AB1234'
      },
      documents: {
        license: { number: 'DL1234', frontImage: 'https://example.com/front.jpg', backImage: 'https://example.com/back.jpg' },
        rc: { number: 'RC3344', image: 'https://example.com/rc.jpg', expiryDate: '2025-12-31' },
        insurance: { number: 'INS5566', image: 'https://example.com/insurance.jpg', expiryDate: '2025-12-31' },
        medicalCertificate: 'https://example.com/medical.jpg',
        gst: 'GST123456'
      },
      bankDetails: {
        accountName: 'Rishi',
        accountNumber: '9876543210',
        bankName: 'SBI',
        branchName: 'Main Branch',
        branchAddress: '123 Bank St',
        swiftCode: 'SWIFT123',
        routingNumber: 'ROUTING123'
      },
      location: { type: 'Point', coordinates: [75.8577, 22.7196] }
    }, true),
    createRequest('PATCH', 'api/riders/status', 'Toggle Status', null, true),
    createRequest('PATCH', 'api/riders/break', 'Toggle Break', {
      reason: 'Lunch break'
    }, true),
    createRequest('PATCH', 'api/riders/location', 'Update Location', {
      long: 75.8577,
      lat: 22.7196
    }, true),
    createRequest('GET', 'api/riders/earnings', 'Get Earnings Summary', null, true, [
      { key: 'period', value: 'day' }
    ]),
    createRequest('GET', 'api/riders/earnings/history', 'Get Earnings History', null, true),
    createRequest('POST', 'api/riders/withdraw', 'Request Withdrawal', {
      amount: 1000,
      method: 'bank',
      bankDetails: {
        accountNumber: '1234567890',
        bankName: 'SBI'
      }
    }, true),
    createRequest('GET', 'api/riders/withdrawals', 'Get Withdrawals', null, true),
    createRequest('POST', 'api/riders/tickets', 'Create Ticket', {
      subject: 'Payment Issue',
      message: 'I have not received my payment'
    }, true),
    createRequest('GET', 'api/riders/tickets', 'Get Tickets', null, true),
    createRequest('GET', 'api/riders/training', 'Get Training Materials', null, false),
    createRequest('POST', 'api/riders/sos', 'Trigger SOS', {
      message: 'Emergency situation',
      location: { long: 75.8577, lat: 22.7196 }
    }, true),
    createRequest('PATCH', 'api/riders/sos/clear', 'Clear SOS', {
      note: 'Situation resolved'
    }, true),
    createRequest('GET', 'api/riders/settlements', 'Rider Settlement Report', null, true, [
      { key: 'from', value: '2024-01-01' },
      { key: 'to', value: '2024-01-31' },
      { key: 'detail', value: 'summary' },
      { key: 'format', value: 'json' }
    ]),
    createRequest('PUT', 'api/riders/documents', 'Update Documents', {
      documents: {
        license: { number: 'DL1234', frontImage: 'https://example.com/front.jpg' },
        rc: { number: 'RC3344', image: 'https://example.com/rc.jpg' }
      }
    }, true),
    createRequest('PUT', 'api/riders/vehicle', 'Update Vehicle', {
      vehicle: {
        type: 'BIKE_VEHICLE_ID',
        model: 'Activa',
        number: 'MP09CD5678'
      }
    }, true),
    createRequest('POST', 'api/riders/admin/create', 'Admin Create Rider', {
      name: 'Rider Name',
      email: 'rider@example.com',
      mobile: '9876543210',
      password: 'Password123!',
      profilePic: 'https://example.com/pic.jpg',
      address: {
        street: '123 Rider St',
        city: 'Indore',
        state: 'MP',
        country: 'India',
        zipCode: '452001'
      },
      workCity: 'Indore',
      workZone: 'Zone-1',
      vehicle: {
        type: 'BIKE_VEHICLE_ID',
        model: 'Splendor',
        number: 'MP09AB1234'
      },
      documents: {
        license: { number: 'DL1234' },
        rc: { number: 'RC3344' }
      },
      bankDetails: {
        accountName: 'Rider Name',
        accountNumber: '9876543210',
        bankName: 'SBI'
      }
    }, true),
    createRequest('GET', 'api/riders/admin/all', 'Get All Riders', null, true, [
      { key: 'status', value: 'approved' }
    ]),
    createRequest('GET', 'api/riders/admin/pending', 'Get Pending Riders', null, true),
    createRequest('GET', 'api/riders/admin/:id', 'Get Rider Details', null, true),
    createRequest('PUT', 'api/riders/admin/update/:id', 'Update Rider (Admin)', {
      address: {
        street: 'Updated Street',
        city: 'Indore'
      },
      workCity: 'Indore',
      workZone: 'Zone-2'
    }, true),
    createRequest('PUT', 'api/riders/admin/verify/:id', 'Verify Rider', {
      status: 'approved',
      reason: 'Profile verified'
    }, true),
    createRequest('PUT', 'api/riders/admin/vehicle-verify/:id', 'Verify Rider Vehicle', {
      status: 'approved',
      reason: 'Vehicle is valid'
    }, true),
    createRequest('DELETE', 'api/riders/admin/delete/:id', 'Delete Rider', null, true)
  ]
};
collection.item.push(ridersFolder);
const adminFolder = {
  name: 'Admin',
  item: [
    createRequest('GET', 'api/admin/dashboard', 'Get Dashboard', null, true),
    createRequest('GET', 'api/admin/orders/dashboard', 'Get Orders Dashboard', null, true, [
      { key: 'scope', value: 'today' },
      { key: 'limit', value: '20' }
    ]),
    createRequest('GET', 'api/admin/users', 'Get All Users', null, true, [
      { key: 'role', value: 'customer' },
      { key: 'page', value: '1' },
      { key: 'limit', value: '20' }
    ]),
    createRequest('GET', 'api/admin/users/:id', 'Get User By ID', null, true),
    createRequest('PUT', 'api/admin/users/:id/block', 'Block User', {
      action: 'block',
      reason: 'Violation of terms'
    }, true),
    createRequest('PUT', 'api/admin/users/:id/cod', 'Toggle User COD', {
      active: true
    }, true),
    createRequest('POST', 'api/admin/users/:id/wallet-adjust', 'Adjust Wallet', {
      amount: 100,
      type: 'credit',
      note: 'Promotional credit'
    }, true),
    createRequest('GET', 'api/admin/reports/revenue', 'Revenue Report', null, true, [
      { key: 'period', value: 'day' },
      { key: 'from', value: '2024-01-01' },
      { key: 'to', value: '2024-01-31' }
    ]),
    createRequest('GET', 'api/admin/reports/commission', 'Commission Report', null, true),
    createRequest('GET', 'api/admin/reports/cancellations', 'Cancellation Report', null, true),
    createRequest('GET', 'api/admin/reports/success-ratio', 'Order Success Ratio', null, true),
    createRequest('POST', 'api/admin/master-category', 'Add Master Category', {
      name: 'Category Name',
      image: 'https://example.com/image.jpg',
      status: 'active'
    }, true),
    createRequest('GET', 'api/admin/master-category', 'Get All Master Categories', null, true),
    createRequest('PUT', 'api/admin/master-category/:id', 'Update Master Category', {
      name: 'Updated Category',
      status: 'active'
    }, true),
    createRequest('DELETE', 'api/admin/master-category/:id', 'Delete Master Category', null, true),
    createRequest('POST', 'api/admin/unit', 'Add Unit', {
      symbol: 'kg',
      status: 'active'
    }, true),
    createRequest('GET', 'api/admin/unit', 'Get All Units', null, true),
    createRequest('PUT', 'api/admin/unit/:id', 'Update Unit', {
      symbol: 'g',
      status: 'active'
    }, true),
    createRequest('DELETE', 'api/admin/unit/:id', 'Delete Unit', null, true),
    createRequest('POST', 'api/admin/tag', 'Add Tag', {
      name: 'Spicy',
      type: 'dietary',
      description: 'Spicy food',
      image: 'https://example.com/image.jpg',
      color: '#FF0000',
      status: 'active'
    }, true),
    createRequest('GET', 'api/admin/tag', 'Get All Tags', null, true),
    createRequest('PUT', 'api/admin/tag/:id', 'Update Tag', {
      name: 'Very Spicy',
      status: 'active'
    }, true),
    createRequest('DELETE', 'api/admin/tag/:id', 'Delete Tag', null, true),
    createRequest('POST', 'api/admin/addon', 'Add Addon', {
      restaurant: 'RESTAURANT_ID',
      name: 'Extra Cheese',
      price: 50
    }, true),
    createRequest('GET', 'api/admin/addon', 'Get All Addons', null, true),
    createRequest('POST', 'api/admin/brand', 'Add Brand', {
      name: 'Brand Name',
      status: 'active'
    }, true),
    createRequest('GET', 'api/admin/brand', 'Get All Brands', null, true),
    createRequest('POST', 'api/admin/cuisine', 'Add Cuisine', {
      name: 'Italian'
    }, true),
    createRequest('GET', 'api/admin/cuisine', 'Get All Cuisines', null, true),
    createRequest('POST', 'api/admin/document-type', 'Add Document Type', {
      name: 'License',
      type: 'license',
      hasExpiry: true,
      status: 'active'
    }, true),
    createRequest('GET', 'api/admin/document-type', 'Get All Document Types', null, true),
    createRequest('POST', 'api/admin/cancellation-reason', 'Add Cancellation Reason', {
      reason: 'Out of stock',
      userType: 'customer',
      status: 'active'
    }, true),
    createRequest('GET', 'api/admin/cancellation-reason', 'Get All Cancellation Reasons', null, true),
    createRequest('POST', 'api/admin/banner', 'Add Banner', {
      title: 'Special Offer',
      image: 'https://example.com/banner.jpg',
      type: 'restaurant',
      targetId: 'RESTAURANT_ID',
      targetModel: 'Restaurant',
      position: 1
    }, true),
    createRequest('GET', 'api/admin/banner', 'Get All Banners', null, true),
    createRequest('PUT', 'api/admin/banner/:id', 'Update Banner', {
      title: 'Updated Banner',
      position: 2
    }, true),
    createRequest('DELETE', 'api/admin/banner/:id', 'Delete Banner', null, true),
    createRequest('POST', 'api/admin/promocode', 'Add Promocode', {
      code: 'SAVE20',
      discountValue: 20,
      offerType: 'percent',
      minOrderValue: 200,
      expiryDate: '2024-12-31',
      usageLimitPerUser: 1,
      usageLimitPerCoupon: 100
    }, true),
    createRequest('GET', 'api/admin/promocode', 'Get All Promocodes', null, true),
    createRequest('PUT', 'api/admin/promocode/:id', 'Update Promocode', {
      discountValue: 25,
      expiryDate: '2024-12-31'
    }, true),
    createRequest('DELETE', 'api/admin/promocode/:id', 'Delete Promocode', null, true),
    createRequest('POST', 'api/admin/vehicles', 'Add Vehicle', {
      name: 'Bike',
      type: 'two-wheeler',
      description: 'Motorcycle',
      isActive: true
    }, true),
    createRequest('GET', 'api/admin/vehicles', 'Get All Vehicles', null, true),
    createRequest('PUT', 'api/admin/vehicles/:id', 'Update Vehicle', {
      name: 'Motorcycle',
      isActive: true
    }, true),
    createRequest('DELETE', 'api/admin/vehicles/:id', 'Delete Vehicle', null, true),
    createRequest('POST', 'api/admin/cities', 'Add City', {
      name: 'Indore',
      country: 'India',
      isActive: true,
      isDefault: false
    }, true),
    createRequest('GET', 'api/admin/cities', 'Get All Cities', null, true),
    createRequest('GET', 'api/admin/cities/:id', 'Get City By ID', null, true),
    createRequest('PUT', 'api/admin/cities/:id', 'Update City', {
      name: 'Updated City',
      isActive: true
    }, true),
    createRequest('DELETE', 'api/admin/cities/:id', 'Delete City', null, true),
    createRequest('POST', 'api/admin/cities/:cityId/zones', 'Add Zone', {
      name: 'Zone-1',
      isActive: true,
      deliveryCharges: [],
      polygon: { type: 'Polygon', coordinates: [[[75.8, 22.7], [75.9, 22.7], [75.9, 22.8], [75.8, 22.8], [75.8, 22.7]]] },
      center: { type: 'Point', coordinates: [75.85, 22.75] }
    }, true),
    createRequest('GET', 'api/admin/cities/:cityId/zones', 'Get Zones By City', null, true),
    createRequest('GET', 'api/admin/zones/:id', 'Get Zone By ID', null, true),
    createRequest('PUT', 'api/admin/zones/:id', 'Update Zone', {
      name: 'Updated Zone',
      isActive: true
    }, true),
    createRequest('DELETE', 'api/admin/zones/:id', 'Delete Zone', null, true),
    createRequest('GET', 'api/admin/withdrawals', 'Get All Withdrawals', null, true),
    createRequest('PUT', 'api/admin/withdrawals/:id/approve', 'Approve Withdrawal', {
      adminNote: 'Approved'
    }, true),
    createRequest('PUT', 'api/admin/withdrawals/:id/reject', 'Reject Withdrawal', {
      adminNote: 'Insufficient documents'
    }, true),
    createRequest('GET', 'api/admin/tickets', 'Get All Tickets', null, true),
    createRequest('PUT', 'api/admin/tickets/:id', 'Update Ticket', {
      status: 'resolved',
      reply: 'Issue resolved'
    }, true),
    createRequest('POST', 'api/admin/training', 'Add Material', {
      title: 'Training Video',
      url: 'https://example.com/video.mp4',
      description: 'How to deliver orders'
    }, true),
    createRequest('DELETE', 'api/admin/training/:id', 'Delete Material', null, true),
    createRequest('GET', 'api/admin/riders/settlements', 'Admin Rider Settlements', null, true, [
      { key: 'from', value: '2024-01-01' },
      { key: 'to', value: '2024-01-31' },
      { key: 'riderId', value: 'RIDER_ID' }
    ]),
    createRequest('GET', 'api/admin/riders/sos-active', 'Get Active SOS', null, true),
    createRequest('PUT', 'api/admin/riders/sos/:id/clear', 'Clear SOS', null, true),
    createRequest('POST', 'api/admin/incentives', 'Create Incentive', {
      title: 'Bonus',
      description: 'Extra earnings',
      amount: 500,
      target: 'all',
      status: 'active'
    }, true),
    createRequest('GET', 'api/admin/incentives', 'Get All Incentives', null, true),
    createRequest('PUT', 'api/admin/incentives/:id', 'Update Incentive', {
      amount: 600,
      status: 'active'
    }, true),
    createRequest('DELETE', 'api/admin/incentives/:id', 'Delete Incentive', null, true),
    createRequest('POST', 'api/admin/incentives/:id/assign', 'Assign Incentive', {
      targetIds: ['USER_ID_1', 'USER_ID_2']
    }, true),
    createRequest('POST', 'api/admin/groups', 'Add Group', {
      name: 'Group Name',
      description: 'Group Description',
      image: 'https://example.com/image.jpg',
      isActive: true
    }, true),
    createRequest('GET', 'api/admin/groups', 'Get All Groups', null, true),
    createRequest('GET', 'api/admin/groups/:id', 'Get Group By ID', null, true),
    createRequest('PUT', 'api/admin/groups/:id', 'Update Group', {
      name: 'Updated Group',
      isActive: true
    }, true),
    createRequest('DELETE', 'api/admin/groups/:id', 'Delete Group', null, true),
    createRequest('POST', 'api/admin/groups/tags', 'Add Group Tag', {
      name: 'Tag Name',
      description: 'Tag Description',
      image: 'https://example.com/image.jpg',
      group: 'GROUP_ID',
      isActive: true
    }, true),
    createRequest('GET', 'api/admin/groups/tags', 'Get All Group Tags', null, true),
    createRequest('GET', 'api/admin/groups/tags/:id', 'Get Group Tag By ID', null, true),
    createRequest('PUT', 'api/admin/groups/tags/:id', 'Update Group Tag', {
      name: 'Updated Tag',
      isActive: true
    }, true),
    createRequest('DELETE', 'api/admin/groups/tags/:id', 'Delete Group Tag', null, true),
    createRequest('POST', 'api/admin/filters', 'Add Filter Category', {
      name: 'Dietary',
      description: 'Dietary filters',
      isActive: true
    }, true),
    createRequest('GET', 'api/admin/filters', 'Get All Filter Categories', null, true),
    createRequest('GET', 'api/admin/filters/:id', 'Get Filter Category By ID', null, true),
    createRequest('PUT', 'api/admin/filters/:id', 'Update Filter Category', {
      name: 'Updated Filter',
      isActive: true
    }, true),
    createRequest('DELETE', 'api/admin/filters/:id', 'Delete Filter Category', null, true),
    createRequest('POST', 'api/admin/filters/:id/subcategories', 'Add Subcategory', {
      name: 'Vegetarian',
      isActive: true
    }, true),
    createRequest('GET', 'api/admin/filters/subcategories', 'Search Subcategories', null, true, [
      { key: 'search', value: 'veg' }
    ]),
    createRequest('POST', 'api/admin/food-quantities', 'Add Food Quantity', {
      name: '500g',
      isActive: true
    }, true),
    createRequest('GET', 'api/admin/food-quantities', 'Get All Food Quantities', null, true),
    createRequest('GET', 'api/admin/food-quantities/:id', 'Get Food Quantity By ID', null, true),
    createRequest('PUT', 'api/admin/food-quantities/:id', 'Update Food Quantity', {
      name: '1kg',
      isActive: true
    }, true),
    createRequest('DELETE', 'api/admin/food-quantities/:id', 'Delete Food Quantity', null, true),
    createRequest('GET', 'api/admin/refunds', 'Get All Refunds', null, true),
    createRequest('POST', 'api/admin/refunds/:id/approve', 'Approve Refund', {
      note: 'Refund approved'
    }, true),
    createRequest('POST', 'api/admin/refunds/:id/reject', 'Reject Refund', {
      note: 'Refund rejected'
    }, true),
    createRequest('PUT', 'api/admin/restaurants/:id/approve-menu', 'Approve Restaurant Menu', null, true),
    createRequest('PUT', 'api/admin/products/:id/approve', 'Approve Product', {
      approved: true,
      notes: 'Product approved'
    }, true)
  ]
};
collection.item.push(adminFolder);
const citiesPublicFolder = {
  name: 'Cities (Public)',
  item: [
    createRequest('GET', 'api/cities', 'Get Public Cities', null, false, [
      { key: 'country', value: 'India' }
    ])
  ]
};
collection.item.push(citiesPublicFolder);
const zonesPublicFolder = {
  name: 'Zones (Public)',
  item: [
    createRequest('GET', 'api/zones', 'Get Public Zones', null, false, [
      { key: 'city', value: 'CITY_ID' }
    ]),
    createRequest('POST', 'api/zones/lookup', 'Lookup Zone By Point', {
      long: 75.8577,
      lat: 22.7196,
      city: 'CITY_ID'
    }, false)
  ]
};
collection.item.push(zonesPublicFolder);
const foodQuantitiesPublicFolder = {
  name: 'Food Quantities (Public)',
  item: [
    createRequest('GET', 'api/food-quantities', 'Get Public Food Quantities', null, false)
  ]
};
collection.item.push(foodQuantitiesPublicFolder);
const incentivesFolder = {
  name: 'Incentives',
  item: [
    createRequest('GET', 'api/incentives/my', 'Get My Incentives', null, true)
  ]
};
collection.item.push(incentivesFolder);
fs.writeFileSync('Postman_Collection_FoodDelivery_Complete.json', JSON.stringify(collection, null, 2));
console.log('Postman Collection generated successfully!');
