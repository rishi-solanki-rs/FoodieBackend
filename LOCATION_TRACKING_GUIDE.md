# 📍 Rider Location Tracking System - Complete Guide

## 🎯 Overview

This system automatically tracks rider locations when they go online and broadcasts updates to:
- Admin Dashboard (real-time rider monitoring)
- Customers (delivery tracking with ETA)
- Database (location history)

---

## 🔄 How It Works

### **When Rider Goes Online:**

1. **Rider calls REST API:**
   ```
   PATCH /api/riders/status
   ```

2. **Backend:**
   - Updates `rider.isOnline = true` in database
   - Emits Socket.IO event: `rider:status_changed` to rider's app
   - Notifies admin dashboard via `rider:status_update`

3. **Rider App receives:**
   ```json
   {
     "isOnline": true,
     "requireLocationTracking": true,
     "message": "You are now online. Location tracking will start automatically.",
     "instructions": "Please ensure location permissions are enabled..."
   }
   ```

4. **Rider App starts sending location every 5-10 seconds:**
   ```javascript
   socket.emit('rider:location', {
     latitude: 40.7128,
     longitude: -74.0060,
     accuracy: 10,
     speed: 5.5,
     heading: 180
   });
   ```

5. **Backend broadcasts to:**
   - Admin: `rider:location_update`
   - Customers with active orders: `rider:location_updated` (with ETA)
   - Database: Updates `rider.currentLocation`

---

## 🔌 Socket.IO Events

### **Events FROM Rider App TO Backend:**

| Event | Data | Description |
|-------|------|-------------|
| `rider:location` | `{latitude, longitude, accuracy, speed, heading}` | Sends current location |
| `rider:status` | `"online"` or `"offline"` | Alternative way to change status |
| `rider:start_tracking` | (none) | Manually start location tracking |
| `rider:stop_tracking` | (none) | Manually stop location tracking |

### **Events FROM Backend TO Rider App:**

| Event | Data | Description |
|-------|------|-------------|
| `rider:status_changed` | `{isOnline, requireLocationTracking}` | Status changed via REST API |
| `rider:streaming_started` | `{success, message}` | Location tracking enabled |
| `rider:streaming_stopped` | `{success, message}` | Location tracking disabled |
| `rider:location_ack` | `{success, timestamp}` | Location update confirmed |
| `connected` | `{userId, role, timestamp}` | Socket connection confirmed |

---

## 📱 Frontend Implementation

### **React Native Example:**

```javascript
import io from 'socket.io-client';
import { useEffect, useState } from 'react';
import Geolocation from '@react-native-community/geolocation';

const RiderApp = () => {
  const [socket, setSocket] = useState(null);
  const [isOnline, setIsOnline] = useState(false);
  const [watchId, setWatchId] = useState(null);

  // 1. Connect to Socket.IO on app start
  useEffect(() => {
    const token = localStorage.getItem('riderToken');
    
    const newSocket = io('http://your-backend-url.com', {
      auth: { token },
      transports: ['websocket']
    });

    // Connection confirmed
    newSocket.on('connected', (data) => {
      console.log('✅ Connected:', data);
    });

    // Listen for status changes from backend
    newSocket.on('rider:status_changed', (data) => {
      console.log('Status changed:', data);
      if (data.requireLocationTracking) {
        startLocationTracking(newSocket);
      } else {
        stopLocationTracking();
      }
    });

    // Listen for location acknowledgment
    newSocket.on('rider:location_ack', (data) => {
      console.log('📍 Location updated:', data);
    });

    setSocket(newSocket);

    return () => {
      stopLocationTracking();
      newSocket.close();
    };
  }, []);

  // 2. Toggle Online/Offline Status
  const toggleStatus = async () => {
    try {
      const response = await fetch('http://your-backend-url.com/api/riders/status', {
        method: 'PATCH',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });

      const data = await response.json();
      setIsOnline(data.isOnline);
      
      // Socket will automatically handle location tracking
      console.log('Status:', data);
    } catch (error) {
      console.error('Error toggling status:', error);
    }
  };

  // 3. Start Location Tracking
  const startLocationTracking = (socketInstance) => {
    const id = Geolocation.watchPosition(
      (position) => {
        // Send location via socket
        socketInstance.emit('rider:location', {
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
          accuracy: position.coords.accuracy,
          speed: position.coords.speed || 0,
          heading: position.coords.heading || 0
        });
      },
      (error) => console.error('Location error:', error),
      {
        enableHighAccuracy: true,
        distanceFilter: 10, // Update every 10 meters
        interval: 5000,     // Or every 5 seconds
        fastestInterval: 3000
      }
    );
    
    setWatchId(id);
    console.log('📍 Location tracking started');
  };

  // 4. Stop Location Tracking
  const stopLocationTracking = () => {
    if (watchId !== null) {
      Geolocation.clearWatch(watchId);
      setWatchId(null);
      console.log('🛑 Location tracking stopped');
    }
  };

  return (
    <View>
      <Button 
        title={isOnline ? "Go Offline" : "Go Online"}
        onPress={toggleStatus}
      />
      <Text>Status: {isOnline ? "🟢 Online" : "⚫ Offline"}</Text>
    </View>
  );
};
```

---

## 🔋 Background Location Tracking

For production, use background location tracking:

```bash
npm install react-native-background-geolocation
```

```javascript
import BackgroundGeolocation from 'react-native-background-geolocation';

const setupBackgroundTracking = (socket) => {
  BackgroundGeolocation.ready({
    desiredAccuracy: BackgroundGeolocation.DESIRED_ACCURACY_HIGH,
    distanceFilter: 10,
    stopTimeout: 1,
    debug: false,
    stopOnTerminate: false,
    startOnBoot: true,
    foregroundService: true,
    notification: {
      title: "Delivery App",
      text: "Tracking your location while online"
    }
  }).then(() => {
    BackgroundGeolocation.start();
  });

  // Listen for location updates
  BackgroundGeolocation.onLocation((location) => {
    socket.emit('rider:location', {
      latitude: location.coords.latitude,
      longitude: location.coords.longitude,
      accuracy: location.coords.accuracy,
      speed: location.coords.speed,
      heading: location.coords.heading
    });
  });
};
```

---

## 🧪 Testing

### **1. Test REST API:**

```bash
# Login as rider
POST http://192.168.43.215:5000/api/auth/login
Body: { "mobile": "1234567890", "password": "password" }

# Get current status
GET http://192.168.43.215:5000/api/riders/status
Headers: Authorization: Bearer <token>

# Response:
{
  "success": true,
  "isOnline": false,
  "isAvailable": true,
  "breakMode": false,
  "verificationStatus": "approved",
  "locationTrackingRequired": false
}

# Toggle online status
PATCH http://192.168.43.215:5000/api/riders/status
Headers: Authorization: Bearer <token>

# Response:
{
  "success": true,
  "message": "You are now Online",
  "isOnline": true,
  "locationTrackingRequired": true,
  "instructions": "Please ensure location permissions are enabled..."
}
```

### **2. Test Socket.IO:**

```javascript
// Using socket.io-client
const io = require('socket.io-client');

const socket = io('http://192.168.43.215:5000', {
  auth: { token: 'your-rider-jwt-token' }
});

// Listen for connection
socket.on('connected', (data) => {
  console.log('Connected:', data);
  
  // Send test location
  socket.emit('rider:location', {
    latitude: 40.7128,
    longitude: -74.0060,
    accuracy: 10,
    speed: 5.5,
    heading: 180
  });
});

// Listen for acknowledgment
socket.on('rider:location_ack', (data) => {
  console.log('Location confirmed:', data);
});
```

---

## 📊 Database Schema

```javascript
// Rider Model
{
  currentLocation: {
    type: { type: String, default: 'Point' },
    coordinates: [Number, Number] // [longitude, latitude]
  },
  lastLocationUpdateAt: Date,
  isOnline: Boolean
}
```

---

## 🔧 Backend Endpoints

| Method | Endpoint | Description | Auth |
|--------|----------|-------------|------|
| GET | `/api/riders/status` | Get current online status | Rider |
| PATCH | `/api/riders/status` | Toggle online/offline | Rider |
| PATCH | `/api/riders/location` | Update location (REST fallback) | Rider |

---

## 🚀 Production Checklist

- [ ] Set up SSL/TLS for secure WebSocket connections (wss://)
- [ ] Configure proper CORS for Socket.IO
- [ ] Set up Redis adapter for Socket.IO clustering
- [ ] Implement location update throttling (max 1 per 3 seconds)
- [ ] Add location accuracy validation (reject if accuracy > 50m)
- [ ] Set up monitoring for disconnected riders
- [ ] Implement automatic reconnection logic in frontend
- [ ] Add battery optimization (reduce frequency when battery low)
- [ ] Store location history for dispute resolution
- [ ] Set up geofencing alerts for delivery zones
- [ ] Add location permission prompts in rider app
- [ ] Test on slow/unstable networks
- [ ] Implement offline queue for location updates

---

## ⚠️ Troubleshooting

### **Rider not receiving `rider:status_changed` event:**
- Check socket connection: `socket.connected` should be `true`
- Verify JWT token is valid
- Check socket room: Should be in `rider:<userId>`

### **Location not updating in database:**
- Check MongoDB connection
- Verify coordinates format: `[longitude, latitude]`
- Ensure `currentLocation` has 2dsphere index

### **Admin dashboard not showing rider location:**
- Check admin is in `admin:dashboard` room
- Verify `socketService.emitToAdmin()` is working
- Check browser console for socket events

### **High battery consumption:**
- Reduce update frequency (use 10-15 seconds instead of 5)
- Use `distanceFilter` to only update when rider moves
- Disable high accuracy when not on active delivery

---

## 📞 Support

For issues or questions:
1. Check server logs for socket errors
2. Verify rider is verified and approved
3. Test socket connection separately
4. Check network connectivity

---

**Last Updated:** February 18, 2026
**Status:** ✅ Production Ready
