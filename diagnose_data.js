const mongoose = require('mongoose');
require('dotenv').config();
const Restaurant = require('./models/Restaurant');
const Rider = require('./models/Rider');
async function diagnoseData() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('✅ Connected to MongoDB\n');
    console.log('📍 RESTAURANTS IN DATABASE:');
    const restaurants = await Restaurant.find({
      restaurantApproved: true,
      menuApproved: true,
      isActive: true
    }).select('name location timing isTemporarilyClosed');
    restaurants.forEach((r, i) => {
      const coords = r.location?.coordinates || [null, null];
      const isValidCoords = coords[0] !== 0 && coords[1] !== 0 && coords[0] !== null;
      console.log(`${i+1}. ${r.name?.en || 'Unknown'}`);
      console.log(`   Coords: [${coords[0]}, ${coords[1]}] ${isValidCoords ? '✅' : '❌'}`);
      console.log(`   Temporarily Closed: ${r.isTemporarilyClosed}`);
    });
    console.log('\n🏍️  RIDERS IN DATABASE:');
    const riders = await Rider.find({
      isOnline: true,
      isAvailable: true,
      verificationStatus: 'approved'
    }).select('currentLocation isOnline isAvailable');
    if (riders.length === 0) {
      console.log('⚠️  NO ACTIVE RIDERS FOUND!');
    } else {
      riders.forEach((r, i) => {
        const coords = r.currentLocation?.coordinates || [null, null];
        console.log(`${i+1}. Rider (ID: ${r._id})`);
        console.log(`   Location: [${coords[0]}, ${coords[1]}]`);
        console.log(`   Online: ${r.isOnline}, Available: ${r.isAvailable}`);
      });
    }
    process.exit(0);
  } catch (e) {
    console.error('Error:', e.message);
    process.exit(1);
  }
}
diagnoseData();
