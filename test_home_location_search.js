
const axios = require('axios');
const BASE_URL = 'http://192.168.43.215:5000/api/home';
const TESTS = {
  locationBased: {
    name: 'Location-Based Search (Pune)',
    params: {
      lat: 18.5204,
      lng: 73.8567,
      radiusKm: 10
    }
  },
  wideRadius: {
    name: 'Wide Radius Search (20km)',
    params: {
      lat: 18.5204,
      lng: 73.8567,
      radiusKm: 20
    }
  },
  browseMode: {
    name: 'Browse Mode (No Location)',
    params: {}
  },
  cityFilter: {
    name: 'City Filter (Mumbai)',
    params: {
      city: 'Mumbai'
    }
  }
};
async function testHomeDataEndpoint(test, token = null) {
  console.log(`\n========== ${test.name} ==========\n`);
  try {
    const headers = {
      'Content-Type': 'application/json'
    };
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }
    const response = await axios.get(BASE_URL, {
      params: test.params,
      headers
    });
    const data = response.data;
    console.log('✅ Success!');
    console.log('\n📊 METADATA:');
    console.log(`   Location-Based: ${data.metadata.locationBased}`);
    if (data.metadata.locationBased) {
      console.log(`   Coordinates: ${data.metadata.coordinates.lat}, ${data.metadata.coordinates.lng}`);
      console.log(`   Radius: ${data.metadata.radiusKm} km`);
    }
    console.log('\n📋 SECTIONS:');
    console.log(`   Recommended: ${data.metadata.totalRestaurants.recommended} restaurants`);
    console.log(`   Explore: ${data.metadata.totalRestaurants.explore} restaurants`);
    console.log(`   Popular: ${data.metadata.totalRestaurants.popular} restaurants`);
    console.log(`   Fast Delivery: ${data.metadata.totalRestaurants.fastDelivery} restaurants`);
    console.log(`   Free Delivery: ${data.metadata.totalRestaurants.freeDelivery} restaurants`);
    console.log(`   New: ${data.metadata.totalRestaurants.new} restaurants`);
    console.log(`\n🎯 BANNERS: ${data.banners.length}`);
    console.log(`🍕 CATEGORIES: ${data.categories.length}`);
    if (data.sections.exploreRestaurants.length > 0) {
      console.log('\n🏪 SAMPLE RESTAURANTS (First 3):');
      data.sections.exploreRestaurants.slice(0, 3).forEach((r, i) => {
        console.log(`   ${i + 1}. ${r.name}`);
        console.log(`      Rating: ${r.rating?.average || 'N/A'} ⭐`);
        console.log(`      Delivery: ${r.deliveryTime} mins`);
        if (r.distanceKm) {
          console.log(`      Distance: ${r.distanceKm.toFixed(2)} km`);
        }
        console.log(`      Free Delivery: ${r.isFreeDelivery ? 'Yes' : 'No'}`);
        console.log(`      Status: ${r.isOpen ? '🟢 Open' : '🔴 Closed'}`);
      });
    }
  } catch (error) {
    console.error('❌ Error:', error.response?.data || error.message);
    if (error.response?.status === 404) {
      console.error('Note: Make sure the endpoint /api/home exists');
    }
  }
}
async function testLocationVsBrowse() {
  console.log('\n╔════════════════════════════════════════════════════════╗');
  console.log('║   HOME DATA LOCATION-BASED SEARCH COMPARISON TEST      ║');
  console.log('╚════════════════════════════════════════════════════════╝');
  await testHomeDataEndpoint(TESTS.locationBased);
  await new Promise(resolve => setTimeout(resolve, 1000));
  await testHomeDataEndpoint(TESTS.browseMode);
  console.log('\n\n═══════════════════════════════════════════════════════');
  console.log('COMPARISON:');
  console.log('───────────────────────────────────────────────────────');
  console.log('WITH LOCATION:');
  console.log('  ✅ Uses geospatial $near query');
  console.log('  ✅ Sorted by distance (closest first)');
  console.log('  ✅ Limited to radius (default 10km)');
  console.log('  ✅ Returns 30-50 restaurants per section');
  console.log('  ✅ Includes distanceKm in response');
  console.log('');
  console.log('WITHOUT LOCATION (Browse):');
  console.log('  ✅ No geospatial query');
  console.log('  ✅ Sorted by rating/popularity');
  console.log('  ✅ Returns 10-20 restaurants per section');
  console.log('  ✅ No distance information');
  console.log('═══════════════════════════════════════════════════════\n');
}
function printCurlExamples() {
  console.log('\n╔════════════════════════════════════════════════════════╗');
  console.log('║         CURL EXAMPLES - HOME DATA ENDPOINT             ║');
  console.log('╚════════════════════════════════════════════════════════╝\n');
  console.log('1. Location-Based Search (with coordinates):');
  console.log(`curl "${BASE_URL}?lat=18.5204&lng=73.8567&radiusKm=10"\n`);
  console.log('2. Wide Radius Search (20km):');
  console.log(`curl "${BASE_URL}?lat=18.5204&lng=73.8567&radiusKm=20"\n`);
  console.log('3. Browse Mode (no location):');
  console.log(`curl "${BASE_URL}"\n`);
  console.log('4. City Filter (without coordinates):');
  console.log(`curl "${BASE_URL}?city=Mumbai"\n`);
  console.log('5. With Authentication (for personalized recommendations):');
  console.log(`curl "${BASE_URL}?lat=18.5204&lng=73.8567" \\
  -H "Authorization: Bearer {your_jwt_token}"\n`);
}
function printApiDocumentation() {
  console.log('\n╔════════════════════════════════════════════════════════╗');
  console.log('║           API DOCUMENTATION - HOME DATA                ║');
  console.log('╚════════════════════════════════════════════════════════╝\n');
  console.log('ENDPOINT: GET /api/home');
  console.log('');
  console.log('QUERY PARAMETERS:');
  console.log('  • lat (number, optional)     - User latitude');
  console.log('  • lng (number, optional)     - User longitude');
  console.log('  • radiusKm (number, optional) - Search radius in km (default: 10)');
  console.log('  • city (string, optional)    - Filter by city (used without coordinates)');
  console.log('');
  console.log('HEADERS:');
  console.log('  • Authorization (optional)   - Bearer token for personalized results');
  console.log('');
  console.log('RESPONSE:');
  console.log('  {');
  console.log('    "banners": [...],');
  console.log('    "categories": [...],');
  console.log('    "sections": {');
  console.log('      "recentRestaurants": [...],');
  console.log('      "recommendedForYou": [...],');
  console.log('      "exploreRestaurants": [...],');
  console.log('      "popularRestaurants": [...],');
  console.log('      "fastDelivery": [...],');
  console.log('      "freeDelivery": [...],');
  console.log('      "newOnPlatform": [...]');
  console.log('    },');
  console.log('    "tabs": ["Restaurants", "Offers", "Pick-up"],');
  console.log('    "metadata": {');
  console.log('      "locationBased": true/false,');
  console.log('      "radiusKm": 10,');
  console.log('      "coordinates": { "lat": 18.52, "lng": 73.85 },');
  console.log('      "totalRestaurants": { ... }');
  console.log('    }');
  console.log('  }');
  console.log('');
  console.log('BEHAVIOR:');
  console.log('  WITH COORDINATES:');
  console.log('    • Uses geospatial $near query');
  console.log('    • Restaurants sorted by distance');
  console.log('    • Filtered by radius (maxDistance)');
  console.log('    • Returns 30-50 restaurants per section');
  console.log('    • Only shows open restaurants');
  console.log('');
  console.log('  WITHOUT COORDINATES:');
  console.log('    • Regular query');
  console.log('    • Restaurants sorted by rating/popularity');
  console.log('    • Returns 10-20 restaurants per section');
  console.log('    • Only shows open restaurants');
  console.log('');
}
const command = process.argv[2];
if (command === 'curl') {
  printCurlExamples();
} else if (command === 'docs') {
  printApiDocumentation();
} else if (command === 'compare') {
  testLocationVsBrowse();
} else if (command === 'location') {
  testHomeDataEndpoint(TESTS.locationBased);
} else if (command === 'browse') {
  testHomeDataEndpoint(TESTS.browseMode);
} else {
  console.log('\nUsage: node test_home_location_search.js [command]\n');
  console.log('Commands:');
  console.log('  compare  - Compare location vs browse mode');
  console.log('  location - Test location-based search');
  console.log('  browse   - Test browse mode');
  console.log('  curl     - Show curl examples');
  console.log('  docs     - Show API documentation');
  console.log('\nRunning comparison test by default...\n');
  testLocationVsBrowse();
}
