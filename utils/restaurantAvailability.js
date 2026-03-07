const isRestaurantOpenNow = (restaurant, referenceDate = new Date()) => {
  if (!restaurant) return false;
  if (restaurant.isTemporarilyClosed) return false;
  if (!restaurant.timing) return true;
  const currentDay = referenceDate
    .toLocaleDateString("en-US", { weekday: "long" })
    .toLowerCase();
  const currentTime = referenceDate.toTimeString().slice(0, 5); // HH:MM
  const todayTiming = restaurant.timing[currentDay];
  if (!todayTiming) return true;
  if (todayTiming.isClosed) return false;
  if (todayTiming.open && todayTiming.close) {
    return currentTime >= todayTiming.open && currentTime <= todayTiming.close;
  }
  return true;
};
module.exports = {
  isRestaurantOpenNow,
};
