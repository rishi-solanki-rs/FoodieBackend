# API Routes for Manual Testing

## Authentication
All routes require JWT token in Authorization header:
```
Authorization: Bearer <your_jwt_token>
```

---

## 1. Real-time Location Streaming (WebSocket)

### Connection Setup
```javascript
// Connect to WebSocket
const socket = io('http://192.168.43.215:5000', {
  auth: {
    token: 'your_jwt_token_here'
  }
});

// Connection confirmed
socket.on('connected', (data) => {
  console.log('Connected:', data);
});
```

### Rider - Toggle Online Status (Auto-starts location streaming)
```javascript
// When rider goes ONLINE - location streaming starts automatically
socket.emit('rider:status', 'online');

// When rider is BUSY - location streaming continues
socket.emit('rider:status', 'busy');

// When rider goes OFFLINE - location streaming stops automatically
socket.emit('rider:status', 'offline');

// Listen for streaming confirmation
socket.on('rider:streaming_started', (data) => {
  console.log('Streaming started:', data);
  // Output: { success: true, message: 'Location streaming enabled automatically', timestamp: '...' }
});

socket.on('rider:streaming_stopped', (data) => {
  console.log('Streaming stopped:', data);
});
```

### Rider - Send Location Updates (Real-time streaming)
```javascript
// Send location every 5-10 seconds while online
socket.emit('rider:location', {
  latitude: 22.7196,
  longitude: 75.8577,
  accuracy: 10,        // Optional: GPS accuracy in meters
  speed: 15.5,         // Optional: Speed in km/h
  heading: 180,        // Optional: Direction in degrees (0-360)
  orderId: '507f1f77bcf86cd799439011' // Optional: if on active delivery
});

// Listen for acknowledgment
socket.on('rider:location_ack', (data) => {
  console.log('Location received:', data);
});
```

### Customer - Receive Real-time Location Updates
```javascript
// Join order room to track rider
socket.emit('join:order', 'order_id_here');

// Listen for rider location updates
socket.on('rider:location_updated', (data) => {
  console.log('Rider location:', data);
  /* Output:
  {
    orderId: '507f1f77bcf86cd799439011',
    riderLocation: {
      lat: 22.7196,
      long: 75.8577,
      accuracy: 10,
      speed: 15.5,
      heading: 180
    },
    eta: 15, // minutes
    timestamp: '2026-02-11T...'
  }
  */
});

// Also listen on order room
socket.on('rider:location', (data) => {
  console.log('Rider moving:', data);
});
```

### Admin - Monitor All Riders
```javascript
// Admin automatically joins 'admin:dashboard' room on connection

// Listen for all rider location updates
socket.on('rider:location_update', (data) => {
  console.log('Rider location update:', data);
  /* Output:
  {
    riderId: 'user_id',
    latitude: 22.7196,
    longitude: 75.8577,
    accuracy: 10,
    speed: 15.5,
    heading: 180,
    timestamp: '2026-02-11T...'
  }
  */
});

// Listen for rider status changes
socket.on('rider:status_update', (data) => {
  console.log('Rider status:', data);
  /* Output:
  {
    riderId: 'user_id',
    status: 'online',
    locationStreamingEnabled: true,
    timestamp: '2026-02-11T...'
  }
  */
});
```

---

## 2. Price Range Filter (REST API)

### Update All Restaurant Price Ranges (Run once)
```bash
# Run this script first to calculate price ranges from products
node Backend/scripts/update_price_ranges.js
```

### Home Data with Price Filter
```http
GET /api/home?lat=22.7196&lng=75.8577&minPrice=100&maxPrice=500
Authorization: Bearer <token>
```

**Query Parameters:**
- `lat` - Latitude (optional)
- `lng` - Longitude (optional)
- `radiusKm` - Search radius in km (default: 10, max: 50)
- `minPrice` - Minimum product price (filters restaurants)
- `maxPrice` - Maximum product price (filters restaurants)
- `city` - City name (if no coordinates)

**Response:**
```json
{
  "banners": [...],
  "categories": [...],
  "sections": {
    "recentRestaurants": [
      {
        "_id": "...",
        "name": {"en": "Marco's Italian"},
        "priceRange": {
          "min": 150,
          "max": 800,
          "average": 400,
          "lastCalculated": "2026-02-11T..."
        },
        "distanceKm": 2.5
      }
    ],
    "recommended": [...],
    "explore": [...],
    "popular": [...],
    "fastDelivery": [...],
    "freeDelivery": [...],
    "newRestaurants": [...]
  },
  "metadata": {
    "locationBased": true,
    "coordinates": {"lat": 22.7196, "lng": 75.8577},
    "radiusKm": 10
  }
}
```

### Explore Restaurants with Price Filter
```http
GET /api/home/explore?lat=22.7196&lng=75.8577&minPrice=100&maxPrice=500&sort=distance
Authorization: Bearer <token>
```

**Query Parameters:**
- `lat` - Latitude (optional)
- `lng`/`long` - Longitude (optional)
- `minPrice` - Minimum product price
- `maxPrice` - Maximum product price
- `city` - Filter by city
- `cuisine` - Filter by cuisine name
- `minRating` - Minimum rating (1-5)
- `maxDeliveryTime` - Max delivery time in minutes
- `isFreeDelivery` - 'true' for free delivery only
- `sort` - Sorting: 'distance', 'rating', 'deliveryTime' (default: 'rating')
- `limit` - Results per page (default: 20)
- `page` - Page number (default: 1)

**Example with all filters:**
```http
GET /api/home/explore?lat=22.7196&lng=75.8577&minPrice=200&maxPrice=600&minRating=4&maxDeliveryTime=30&isFreeDelivery=true&sort=distance&limit=10
Authorization: Bearer <token>
```

**Response:**
```json
{
  "restaurants": [
    {
      "_id": "...",
      "name": {"en": "Pizza Palace"},
      "image": "https://...",
      "rating": {
        "average": 4.5,
        "count": 120
      },
      "deliveryTime": 25,
      "cuisine": ["Italian", "Pizza"],
      "isFreeDelivery": true,
      "priceRange": {
        "min": 200,
        "max": 600,
        "average": 380
      },
      "distanceKm": 3.2,
      "isOpen": true
    }
  ],
  "count": 15
}
```

### Recommended Restaurants with Price Filter
```http
GET /api/home/recommended?lat=22.7196&lng=75.8577&minPrice=150&maxPrice=500&limit=20
Authorization: Bearer <token>
```

**Query Parameters:**
- Same as explore, but personalized based on user's order history

---

## 3. Existing Rider Location Update (HTTP Endpoint)

### Update Rider Location via REST API
```http
PATCH /api/rider/location
Authorization: Bearer <rider_jwt_token>
Content-Type: application/json

{
  "lat": 22.7196,
  "long": 75.8577
}
```

**Response:**
```json
"Location Updated"
```

**Note:** This HTTP endpoint updates location in database and broadcasts via WebSocket to customers. However, for real-time streaming, use WebSocket events instead.

---

## Testing Flow

### For Rider Location Streaming:

1. **Rider connects to WebSocket**
   ```javascript
   const socket = io('http://192.168.43.215:5000', { auth: { token: rider_token }});
   ```

2. **Rider toggles online** (location streaming starts automatically)
   ```javascript
   socket.emit('rider:status', 'online');
   ```

3. **Rider sends location every 5 seconds**
   ```javascript
   setInterval(() => {
     socket.emit('rider:location', {
       latitude: 22.7196 + Math.random() * 0.01,
       longitude: 75.8577 + Math.random() * 0.01,
       accuracy: 10,
       speed: 20
     });
   }, 5000);
   ```

4. **Customer watches live location**
   ```javascript
   socket.emit('join:order', order_id);
   socket.on('rider:location_updated', (data) => {
     // Update map marker
     console.log('Rider at:', data.riderLocation);
     console.log('ETA:', data.eta, 'minutes');
   });
   ```

5. **Rider goes offline** (streaming stops automatically)
   ```javascript
   socket.emit('rider:status', 'offline');
   ```

### For Price Range Filter:

1. **Initialize price ranges** (run once)
   ```bash
   cd Backend
   node scripts/update_price_ranges.js
   ```

2. **Test home endpoint with price filter**
   ```bash
   curl -X GET "http://192.168.43.215:5000/api/home?lat=22.7196&lng=75.8577&minPrice=200&maxPrice=500" \
   -H "Authorization: Bearer YOUR_TOKEN"
   ```

3. **Test explore with combined filters**
   ```bash
   curl -X GET "http://192.168.43.215:5000/api/home/explore?minPrice=100&maxPrice=400&minRating=4&sort=distance&lat=22.7196&lng=75.8577" \
   -H "Authorization: Bearer YOUR_TOKEN"
   ```

4. **Verify priceRange in response**
   - Check that only restaurants with products in price range appear
   - Each restaurant should have `priceRange` object with min, max, average

---

## Key Features Implemented

### 1. Real-time Location Streaming
✅ **Auto-start on online status** - Location streaming enables automatically when rider toggles online
✅ **Auto-stop on offline** - Streaming disables when rider goes offline
✅ **Enhanced location data** - Includes accuracy, speed, heading, timestamp
✅ **Real-time ETA calculation** - Customers receive updated ETA with each location update
✅ **Acknowledgment system** - Rider app receives confirmation of location receipt
✅ **Database updates** - Location saved to database asynchronously (non-blocking)
✅ **Multi-order support** - Broadcasts to all customers if rider has multiple orders
✅ **Admin monitoring** - All rider locations visible on admin dashboard

### 2. Price Range Filter
✅ **Min/Max price filtering** - Find restaurants with products in specific price range
✅ **Automatic calculation** - Price ranges computed from product base prices
✅ **Works with geospatial** - Combines location-based sorting with price filtering
✅ **Available in all endpoints** - Home data, explore, recommended all support price filter
✅ **Efficient queries** - MongoDB query optimization for price range + location

---

## WebSocket Events Reference

### Rider Emits:
- `rider:status` - Online/offline/busy status (auto-controls streaming)
- `rider:location` - Real-time location update
- `rider:sos` - Emergency alert

### Rider Receives:
- `connected` - Connection confirmation
- `rider:streaming_started` - Location streaming enabled
- `rider:streaming_stopped` - Location streaming disabled
- `rider:location_ack` - Location update acknowledged

### Customer Receives:
- `rider:location_updated` - Rider location with ETA
- `rider:location` - Raw location update

### Admin Receives:
- `rider:location_update` - All rider locations
- `rider:status_update` - Rider status changes
- `rider:disconnected` - Rider went offline

---

## Notes
- WebSocket endpoint: `http://192.168.43.215:5000` (or your server URL)
- All REST endpoints require JWT authentication
- Location coordinates: longitude first, latitude second in database
- Price ranges update automatically when products change
- Run price range script after adding new products
