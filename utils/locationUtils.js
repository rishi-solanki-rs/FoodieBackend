const haversine = require('haversine-distance');
const logger = console;  // Fallback logger
exports.calculateETA = (riderCoords, customerCoords, orderStatus) => {
  try {
    const distance = haversine(
      { latitude: riderCoords[1], longitude: riderCoords[0] },
      { latitude: customerCoords[1], longitude: customerCoords[0] }
    );
    const speedMetersPerMin = 208.33; // (20 km/h * 1000m / 3600s) * 60 = 208.33 m/min
    const etaMinutes = Math.ceil(distance / speedMetersPerMin);
    if (etaMinutes <= 1) {
      return { minutes: 1, display: 'Arriving now' };
    } else if (etaMinutes <= 60) {
      return { minutes: etaMinutes, display: `${etaMinutes} mins away` };
    } else {
      const hours = Math.floor(etaMinutes / 60);
      const mins = etaMinutes % 60;
      return { minutes: etaMinutes, display: `${hours}h ${mins}m away` };
    }
  } catch (error) {
    console.error('ETA calculation error:', error);
    return { minutes: 0, display: 'Calculating...' };
  }
};
exports.calculateDistance = (coord1, coord2) => {
  try {
    const meters = haversine(
      { latitude: coord1[1], longitude: coord1[0] },
      { latitude: coord2[1], longitude: coord2[0] }
    );
    return Math.round((meters / 1000) * 10) / 10;
  } catch (error) {
    console.error('Distance calculation error:', error);
    return 0;
  }
};
exports.estimateTravelMinutes = (distanceKm, speedKmph = 20) => {
  if (!Number.isFinite(distanceKm) || distanceKm <= 0) return 0;
  const minutes = (distanceKm / speedKmph) * 60;
  return Math.max(1, Math.ceil(minutes));
};
exports.getNearbyRidersQuery = (restaurantCoords, radiusMeters = 10000) => {
  return {
    currentLocation: {
      $near: {
        $geometry: {
          type: "Point",
          coordinates: restaurantCoords
        },
        $maxDistance: radiusMeters
      }
    },
    isOnline: true,
    isAvailable: true,
    verificationStatus: 'approved'
  };
};
module.exports = exports;
