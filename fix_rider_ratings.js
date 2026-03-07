
const mongoose = require('mongoose');
require('dotenv').config();
const Rider = require('./models/Rider');
async function fixRiderRatings() {
  try {
    console.log('🔧 Starting to fix rider rating fields...');
    const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017/foodieDB';
    await mongoose.connect(MONGO_URI);
    console.log('✅ Connected to MongoDB');
    const invalidRiders = await Rider.find({
      $or: [
        { rating: 0 },
        { rating: null },
        { 'rating.average': { $exists: false } }
      ]
    });
    console.log(`📊 Found ${invalidRiders.length} riders with corrupted rating fields`);
    if (invalidRiders.length === 0) {
      console.log('✅ No corrupted rating fields found!');
      await mongoose.connection.close();
      return;
    }
    const updateResult = await Rider.updateMany(
      {
        $or: [
          { rating: 0 },
          { rating: null },
          { 'rating.average': { $exists: false } }
        ]
      },
      {
        $set: {
          rating: {
            average: 0,
            count: 0,
            breakdown: {
              five: 0,
              four: 0,
              three: 0,
              two: 0,
              one: 0
            },
            lastRatedAt: null
          }
        }
      }
    );
    console.log(`✅ Fixed ${updateResult.modifiedCount} rider documents`);
    console.log(`   Matched: ${updateResult.matchedCount}`);
    console.log(`   Modified: ${updateResult.modifiedCount}`);
    const remainingInvalid = await Rider.countDocuments({
      $or: [
        { rating: 0 },
        { rating: null },
        { 'rating.average': { $exists: false } }
      ]
    });
    if (remainingInvalid === 0) {
      console.log('✅ All rider rating fields have been fixed!');
    } else {
      console.warn(`⚠️ WARNING: ${remainingInvalid} riders still have invalid rating fields`);
    }
    await mongoose.connection.close();
    console.log('✅ Database cleanup complete');
  } catch (error) {
    console.error('❌ Error fixing rider ratings:', error);
    process.exit(1);
  }
}
fixRiderRatings();
