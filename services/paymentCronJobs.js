
const cron = require('node-cron');
const { processWeeklyPayouts } = require('./paymentService');
const initPaymentCronJobs = () => {
  console.log('💰 Initializing Payment Cron Jobs...');
  // cron.schedule('0 0 * * 0', async () => {
  //   console.log('[Payment Cron] Running weekly payouts...');
  //   try {
  //     const results = await processWeeklyPayouts();
  //     console.log(`✅ Weekly Payout Done: ${results.restaurants.length} restaurants, ${results.riders.length} riders`);
  //     if (results.errors.length > 0) {
  //       console.error('Payout errors:', results.errors);
  //     }
  //   } catch (err) {
  //     console.error('[Payment Cron] Weekly payout failed:', err.message);
  //   }
  // });
  cron.schedule('*/30 * * * *', async () => {
    try {
      const RiderWallet = require('../models/RiderWallet');
      const nearLimitWallets = await RiderWallet.find({
        isFrozen: false,
        $expr: { $gte: ['$cashInHand', { $multiply: ['$cashLimit', 0.8] }] }
      }).populate('rider');
      for (const wallet of nearLimitWallets) {
        console.log(`⚠️ Rider ${wallet.rider._id} has ₹${wallet.cashInHand} / ₹${wallet.cashLimit} (near limit)`);
      }
    } catch (err) {
      console.error('[Payment Cron] Freeze check failed:', err.message);
    }
  });
};
module.exports = initPaymentCronJobs;
