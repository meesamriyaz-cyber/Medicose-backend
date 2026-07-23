const mongoose = require('mongoose');
mongoose.connect('mongodb://localhost:27017/haleem_medicose').then(async () => {
  const orders = await mongoose.connection.db.collection('orders').find({ couponApplied: { $exists: true, $ne: null } }).limit(5).toArray();
  console.log('Orders with couponApplied:', JSON.stringify(orders.map(o => ({ _id: o._id, couponApplied: o.couponApplied, totalAmount: o.totalAmount })), null, 2));
  process.exit(0);
}).catch(err => { console.error(err); process.exit(1); });
