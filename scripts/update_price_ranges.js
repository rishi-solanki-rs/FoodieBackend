
require('dotenv').config();
const mongoose = require('mongoose');
const { updateAllRestaurantPriceRanges } = require('../utils/priceRangeUtils');
const updatePriceRanges = async () => {
  try {
    console.log('🔗 Connecting to database...');
    await mongoose.connect(process.env.MONGO_URI);
    console.log('✅ Database connected');
    const stats = await updateAllRestaurantPriceRanges();
    console.log('\n📊 Update Statistics:');
    console.log(`   Total Restaurants: ${stats.total}`);
    console.log(`   ✅ Successfully Updated: ${stats.success}`);
    console.log(`   ❌ Failed: ${stats.failed}`);
    console.log('\n✅ Price range update completed!');
    process.exit(0);
  } catch (error) {
    console.error('❌ Error updating price ranges:', error);
    process.exit(1);
  }
};
updatePriceRanges();
