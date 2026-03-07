const dotenv = require('dotenv');
dotenv.config();
const express = require('express');
const http = require('http');
const socketIO = require('socket.io');
const cors = require('cors');
const connectDB = require('./config/db');
const cookieParser = require('cookie-parser');
const rateLimit = require('express-rate-limit');
const authRoutes = require('./routes/authRoutes');
const restaurantRoutes = require('./routes/restaurantRoutes');
const menuRoutes = require('./routes/menuRoutes');
const orderRoutes = require('./routes/orderRoutes');
const riderRoutes = require('./routes/riderRoutes');
const adminRoutes = require('./routes/adminRoutes');
const settingsRoutes = require('./routes/settingsRoutes');
const searchRoutes = require('./routes/searchRoutes');
const homeRoutes = require('./routes/homeRoutes');
const cityRoutes = require('./routes/cityRoutes');
const zoneRoutes = require('./routes/zoneRoutes');
const foodQuantityRoutes = require('./routes/foodQuantityRoutes');
const userRoutes = require('./routes/userRoutes');
const walletRoutes = require('./routes/walletRoutes');
const cartRoutes = require('./routes/cartRoutes');
const incentiveRoutes = require('./routes/incentiveRoutes');
const reviewRoutes = require('./routes/reviewRoutes');
const cmsRoutes = require('./routes/cmsRoutes');
const adminCmsRoutes = require('./routes/adminCmsRoutes');
const trainingRoutes = require('./routes/trainingRoutes');
const reportRoutes = require('./routes/reportRoutes');
const foodCategoryRoutes = require('./routes/foodCategoryRoutes');

const app = express();
const server = http.createServer(app);
app.set('trust proxy', 1);
const io = socketIO(server, {
  cors: {
    origin: ['*', "http://localhost:3001", "http://localhost:8081", "https://foodie-admin-sandy.vercel.app", "https://waseeny.vercel.app"],
    credentials: true,
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"]
  },
  pingTimeout: 60000,
  pingInterval: 25000
});
require('./sockets')(io);
const initCronJobs = require('./services/cronService');
initCronJobs();
const initPaymentCronJobs = require('./services/paymentCronJobs'); // NEW: weekly payout cron
initPaymentCronJobs();
app.use(cookieParser());
app.use(cors({
  origin: ['*', "http://localhost:3001", "http://localhost:8081", "https://foodie-admin-sandy.vercel.app", "https://waseeny.vercel.app"],
  credentials: true,
  methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"]
}));
const { handleRazorpayWebhook } = require('./controllers/paymentController');
app.post('/api/payment/razorpay-webhook', handleRazorpayWebhook);
app.use(express.json());
const paymentRoutes = require('./routes/paymentRoutes');
const paymentSystemRoutes = require('./routes/paymentSystemRoutes'); // NEW: Swiggy-style payment system
app.use('/api/payment', paymentRoutes);
app.use('/api/payment', paymentSystemRoutes); // NEW: COD wallet, freeze, commission, weekly payout
app.use('/api/auth', authRoutes);
app.use('/api/restaurants', restaurantRoutes);
app.use('/api/menu', menuRoutes);
app.use('/api/orders', orderRoutes);
app.use('/api/riders/earnings', require('./routes/riderEarningsRoutes')); // Must be BEFORE /api/riders
app.use('/api/riders', riderRoutes);

app.use('/api/admin/cms', adminCmsRoutes); // Must come BEFORE /api/admin
app.use('/api/admin/reports', reportRoutes); // Must come BEFORE /api/admin
app.use('/api/admin', adminRoutes);
app.use('/api/food-categories', foodCategoryRoutes);

app.use('/api/settings', settingsRoutes);
app.use('/api/search', searchRoutes);
app.use('/api/home', homeRoutes);
app.use('/api/cities', cityRoutes);
app.use('/api/zones', zoneRoutes);
app.use('/api/food-quantities', foodQuantityRoutes);
app.use('/api/user', userRoutes);
app.use('/api/wallet', walletRoutes);
app.use('/api/cart', cartRoutes);
app.use('/api/incentives', incentiveRoutes);
app.use('/api/reviews', reviewRoutes);
app.use('/api/cms', cmsRoutes);
app.use('/api/training', trainingRoutes);
const path = require('path');
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));
app.get('/', (req, res) => {
  res.send('Food Delivery API is running...');
});
const { notFound, errorHandler } = require('./middleware/errorMiddleware');
app.use(notFound);
app.use(errorHandler);
const PORT = process.env.PORT || 5000;
const HOST = "0.0.0.0";
const InitializeConnection = async () => {
  try {
    await Promise.resolve(connectDB());
    console.log("DB connect");
    server.listen(PORT, HOST, () => {
      console.log(`Server running in ${process.env.NODE_ENV} mode on port ${PORT}`);
      console.log(`Socket.IO server ready for real-time connections`);
      console.log(server.address());
    });
  }
  catch (err) {
    console.log("error occured " + err);
  }
}
InitializeConnection();
