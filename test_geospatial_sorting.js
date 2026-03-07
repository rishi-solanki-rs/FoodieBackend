
const BASE_URL = 'http://192.168.43.215:5000/api/home';
async function makeRequest(url, params = {}) {
  const queryString = new URLSearchParams(params).toString();
  const fullUrl = queryString ? `${url}?${queryString}` : url;
  const response = await fetch(fullUrl);
  if (!response.ok) {
    const error = await response.json().catch(() => ({ message: response.statusText }));
    throw new Error(JSON.stringify(error));
  }
  return response.json();
}
const TEST_LOCATION = {
  lat: 22.7196,
  lng: 75.8577
};
async function testSortByDistance() {
  console.log('\n========== TEST: Sort by Distance ==========\n');
  try {
    const data = await makeRequest(`${BASE_URL}/restaurants/explore`, {
      lat: TEST_LOCATION.lat,
      long: TEST_LOCATION.lng,
      sort: 'distance',
      limit: 10
    });
    const restaurants = data.restaurants;
    console.log('✅ Success! Found', restaurants.length, 'restaurants\n');
    console.log('📍 Sorted by DISTANCE (closest first):\n');
    restaurants.forEach((r, index) => {
      console.log(`${index + 1}. ${r.name.en || r.name}`);
      console.log(`   Distance: ${r.distanceKm ? r.distanceKm.toFixed(2) + ' km' : 'N/A'}`);
      console.log(`   Delivery Time: ${r.deliveryTime} mins`);
      console.log(`   Rating: ${r.rating?.average || 'N/A'} ⭐`);
      console.log('');
    });
    let properlySort = true;
    for (let i = 0; i < restaurants.length - 1; i++) {
      if (restaurants[i].distanceKm > restaurants[i + 1].distanceKm) {
        properlySort = false;
        break;
      }
    }
    if (properlySort) {
      console.log('✅ VERIFIED: Restaurants properly sorted by distance!');
    } else {
      console.log('⚠️  WARNING: Distance sorting may be incorrect');
    }
  } catch (error) {
    console.error('❌ Error:', error.message);
  }
}
async function testSortByRating() {
  console.log('\n========== TEST: Sort by Rating ==========\n');
  try {
    const data = await makeRequest(`${BASE_URL}/explore`, {
      sort: 'rating',
      limit: 10
    });
    const restaurants = data.restaurants;
    console.log('✅ Success! Found', restaurants.length, 'restaurants\n');
    console.log('⭐ Sorted by RATING (highest first):\n');
    restaurants.slice(0, 5).forEach((r, index) => {
      console.log(`${index + 1}. ${r.name.en || r.name}`);
      console.log(`   Rating: ${r.rating?.average || 'N/A'} ⭐`);
      console.log(`   Reviews: ${r.rating?.count || 0}`);
      console.log('');
    });
  } catch (error) {
    console.error('❌ Error:', error.message);
  }
}
async function testSortByDeliveryTime() {
  console.log('\n========== TEST: Sort by Delivery Time ==========\n');
  try {
    const data = await makeRequest(`${BASE_URL}/explore`, {
      sort: 'deliveryTime',
      limit: 10
    });
    const restaurants = data.restaurants;
    console.log('✅ Success! Found', restaurants.length, 'restaurants\n');
    console.log('🚀 Sorted by DELIVERY TIME (fastest first):\n');
    restaurants.slice(0, 5).forEach((r, index) => {
      console.log(`${index + 1}. ${r.name.en || r.name}`);
      console.log(`   Delivery: ${r.deliveryTime} mins`);
      console.log(`   Rating: ${r.rating?.average || 'N/A'} ⭐`);
      console.log('');
    });
  } catch (error) {
    console.error('❌ Error:', error.message);
  }
}
async function testRecommendedWithLocation() {
  console.log('\n========== TEST: Recommended Restaurants (Location-Based) ==========\n');
  try {
    const data = await makeRequest(`${BASE_URL}/recommended`, {
      lat: TEST_LOCATION.lat,
      long: TEST_LOCATION.lng,
      limit: 10
    });
    const restaurants = data.restaurants;
    console.log('✅ Success! Found', restaurants.length, 'recommendations\n');
    console.log('📍 Location-Based Recommendations (sorted by distance):\n');
    restaurants.forEach((r, index) => {
      console.log(`${index + 1}. ${r.name.en || r.name}`);
      console.log(`   Distance: ${r.distanceKm ? r.distanceKm.toFixed(2) + ' km' : 'N/A'}`);
      console.log(`   Cuisine: ${r.cuisine?.join(', ') || 'N/A'}`);
      console.log('');
    });
  } catch (error) {
    console.error('❌ Error:', error.message);
  }
}
async function testDistanceSortWithoutLocation() {
  console.log('\n========== TEST: Distance Sort WITHOUT Location (Fallback) ==========\n');
  try {
    const data = await makeRequest(`${BASE_URL}/explore`, {
      sort: 'distance',
      limit: 10
    });
    const restaurants = data.restaurants;
    console.log('✅ Success! Found', restaurants.length, 'restaurants\n');
    console.log('⚠️  No coordinates provided - falling back to RATING sort:\n');
    restaurants.slice(0, 5).forEach((r, index) => {
      console.log(`${index + 1}. ${r.name.en || r.name}`);
      console.log(`   Rating: ${r.rating?.average || 'N/A'} ⭐`);
      console.log('');
    });
  } catch (error) {
    console.error('❌ Error:', error.message);
  }
}
function printApiDocumentation() {
  console.log('\n╔════════════════════════════════════════════════════════╗');
  console.log('║        GEOSPATIAL SORTING - API DOCUMENTATION          ║');
  console.log('╚════════════════════════════════════════════════════════╝\n');
  console.log('ENDPOINT 1: GET /api/home/explore');
  console.log('');
  console.log('QUERY PARAMETERS:');
  console.log('  • lat (number, optional)         - User latitude');
  console.log('  • long (number, optional)        - User longitude');
  console.log('  • sort (string, optional)        - Sort option:');
  console.log('      - "distance" (requires lat/lng)');
  console.log('      - "rating" (default)');
  console.log('      - "deliveryTime"');
  console.log('  • cuisine (string, optional)     - Filter by cuisine');
  console.log('  • city (string, optional)        - Filter by city');
  console.log('  • minRating (number, optional)   - Min rating (1-5)');
  console.log('  • maxDeliveryTime (number)       - Max delivery minutes');
  console.log('  • isFreeDelivery (boolean)       - Free delivery only');
  console.log('  • limit (number, default: 20)    - Results per page');
  console.log('  • page (number, default: 1)      - Page number');
  console.log('');
  console.log('SORTING BEHAVIOR:');
  console.log('  distance:');
  console.log('    - WITH lat/lng: Uses MongoDB $near (geospatial sorting)');
  console.log('    - WITHOUT lat/lng: Falls back to rating sort');
  console.log('    - Max radius: 50km');
  console.log('  rating:');
  console.log('    - Sorts by rating.average DESC, then totalOrders DESC');
  console.log('  deliveryTime:');
  console.log('    - Sorts by deliveryTime ASC (fastest first)');
  console.log('');
  console.log('ENDPOINT 2: GET /api/home/recommended');
  console.log('');
  console.log('QUERY PARAMETERS:');
  console.log('  • lat (number, optional)         - User latitude');
  console.log('  • long (number, optional)        - User longitude');
  console.log('  • limit (number, default: 30)    - Max results');
  console.log('  • city (string, optional)        - Filter by city');
  console.log('');
  console.log('BEHAVIOR:');
  console.log('  - WITH lat/lng: Geospatial query within 20km, sorted by distance');
  console.log('  - WITHOUT lat/lng: Regular query sorted by rating');
  console.log('  - Personalized based on user order history (if logged in)');
  console.log('  - Only shows currently open restaurants');
  console.log('');
}
function printCurlExamples() {
  console.log('\n╔════════════════════════════════════════════════════════╗');
  console.log('║                CURL EXAMPLES                           ║');
  console.log('╚════════════════════════════════════════════════════════╝\n');
  console.log('1. Sort by Distance (with location):');
  console.log(`curl "${BASE_URL}/explore?lat=22.7196&long=75.8577&sort=distance&limit=10"\n`);
  console.log('2. Sort by Rating:');
  console.log(`curl "${BASE_URL}/explore?sort=rating&limit=10"\n`);
  console.log('3. Sort by Delivery Time:');
  console.log(`curl "${BASE_URL}/explore?sort=deliveryTime&limit=10"\n`);
  console.log('4. Location-based with filters:');
  console.log(`curl "${BASE_URL}/explore?lat=22.7196&long=75.8577&sort=distance&cuisine=Italian&isFreeDelivery=true"\n`);
  console.log('5. Recommended (location-based):');
  console.log(`curl "${BASE_URL}/recommended?lat=22.7196&long=75.8577&limit=10"\n`);
}
const command = process.argv[2];
async function runAllTests() {
  console.log('\n╔════════════════════════════════════════════════════════╗');
  console.log('║     GEOSPATIAL SORTING TEST SUITE                      ║');
  console.log('╚════════════════════════════════════════════════════════╝');
  await testSortByDistance();
  await new Promise(r => setTimeout(r, 500));
  await testRecommendedWithLocation();
  await new Promise(r => setTimeout(r, 500));
  await testSortByRating();
  await new Promise(r => setTimeout(r, 500));
  await testSortByDeliveryTime();
  await new Promise(r => setTimeout(r, 500));
  await testDistanceSortWithoutLocation();
  console.log('\n✅ All tests completed!\n');
}
if (command === 'curl') {
  printCurlExamples();
} else if (command === 'docs') {
  printApiDocumentation();
} else if (command === 'distance') {
  testSortByDistance();
} else if (command === 'rating') {
  testSortByRating();
} else if (command === 'delivery') {
  testSortByDeliveryTime();
} else if (command === 'recommended') {
  testRecommendedWithLocation();
} else {
  runAllTests();
}
