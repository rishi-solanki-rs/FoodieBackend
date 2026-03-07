const mongoose = require('mongoose');
const dns = require('dns');
const primaryDNS = ['1.1.1.1', '1.0.0.1'];  // Cloudflare
const fallbackDNS = ['8.8.4.4', '8.8.8.8']; // Google (backup)
dns.setServers(primaryDNS);
console.log('🔧 DNS configured: Primary: Cloudflare (1.1.1.1, 1.0.0.1)');
console.log('   └─ Fallback: Google (8.8.4.4, 8.8.8.8)');
console.log('   └─ Purpose: MongoDB SRV lookups work reliably');
const connectDB = async () => {
  const maxRetries = 5;
  let retries = 0;
  while (retries < maxRetries) {
    try {
      let mongoURI = process.env.MONGO_URI;
      if (!mongoURI) {
        mongoURI = "mongodb+srv://rishi_solanki:Indore%40123@rishiserver.kdybcms.mongodb.net/Check";
      }
      const options = {
        serverSelectionTimeoutMS: 15000,
        socketTimeoutMS: 45000,
        connectTimeoutMS: 15000,
        maxPoolSize: 10,
        minPoolSize: 2,
      };
      const conn = await mongoose.connect(mongoURI, options);
      console.log(`✅ MongoDB Connected: ${conn.connection.host}`);
      return;
    } catch (error) {
      retries++;
      console.error(`❌ MongoDB Connection Error (Attempt ${retries}/${maxRetries}): ${error.message}`);
      if (retries === 2) {
        console.log('🔄 Switching to fallback DNS (Google)...');
        dns.setServers(fallbackDNS);
      }
      if (retries < maxRetries) {
        const waitTime = Math.min(1000 * Math.pow(2, retries - 1), 15000);
        console.log(`⏳ Retrying in ${waitTime}ms...`);
        await new Promise(resolve => setTimeout(resolve, waitTime));
      }
    }
  }
  console.error('❌ Failed to connect to MongoDB after maximum retries');
  process.exit(1);
};
module.exports = connectDB;
