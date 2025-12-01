// Script debug để kiểm tra tính toán timezone
import mongoose from 'mongoose';
import dotenv from 'dotenv';

dotenv.config();

const VN_TIMEZONE = 'Asia/Ho_Chi_Minh';
const VN_OFFSET_MS = 7 * 60 * 60 * 1000;

const getVNDateParts = (date = new Date()) => {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: VN_TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false
  });
  const parts = formatter.formatToParts(date);
  return {
    year: parseInt(parts.find(p => p.type === 'year').value),
    month: parseInt(parts.find(p => p.type === 'month').value),
    day: parseInt(parts.find(p => p.type === 'day').value),
    hour: parseInt(parts.find(p => p.type === 'hour').value),
    minute: parseInt(parts.find(p => p.type === 'minute').value)
  };
};

const vnDateToUTC = (year, month, day, isEndOfDay = false) => {
  if (isEndOfDay) {
    return new Date(Date.UTC(year, month - 1, day, 23, 59, 59, 999) - VN_OFFSET_MS);
  }
  return new Date(Date.UTC(year, month - 1, day, 0, 0, 0, 0) - VN_OFFSET_MS);
};

async function main() {
  console.log('=== DEBUG DASHBOARD STATS ===\n');
  
  const now = new Date();
  const vn = getVNDateParts();
  
  console.log('Server time (UTC):', now.toISOString());
  console.log('VN Date Parts:', vn);
  console.log('VN Month:', vn.month, '(should be 12 for December)');
  
  const currentPeriodStart = vnDateToUTC(vn.year, vn.month, 1, false);
  const prevMonth = vn.month === 1 ? 12 : vn.month - 1;
  const prevYear = vn.month === 1 ? vn.year - 1 : vn.year;
  const previousPeriodStart = vnDateToUTC(prevYear, prevMonth, 1, false);
  
  console.log('\n=== PERIOD CALCULATION ===');
  console.log('Current period start (UTC):', currentPeriodStart.toISOString());
  console.log('Previous period start (UTC):', previousPeriodStart.toISOString());
  
  // Connect to MongoDB and check
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('\n=== DATABASE CHECK ===');
    
    const CoinRecharge = mongoose.model('CoinRecharge', new mongoose.Schema({}, { strict: false }), 'coinrecharges');
    
    // Count current month
    const currentMonthCount = await CoinRecharge.countDocuments({
      status: 'SUCCESS',
      createdAt: { $gte: currentPeriodStart }
    });
    
    // Sum current month revenue
    const currentMonthRevenue = await CoinRecharge.aggregate([
      { $match: { status: 'SUCCESS', createdAt: { $gte: currentPeriodStart } } },
      { $group: { _id: null, total: { $sum: '$amountPaid' } } }
    ]);
    
    // Count previous month
    const prevMonthCount = await CoinRecharge.countDocuments({
      status: 'SUCCESS',
      createdAt: { $gte: previousPeriodStart, $lt: currentPeriodStart }
    });
    
    // Sum previous month revenue
    const prevMonthRevenue = await CoinRecharge.aggregate([
      { $match: { status: 'SUCCESS', createdAt: { $gte: previousPeriodStart, $lt: currentPeriodStart } } },
      { $group: { _id: null, total: { $sum: '$amountPaid' } } }
    ]);
    
    console.log(`Current month (${vn.month}/${vn.year}) transactions:`, currentMonthCount);
    console.log(`Current month revenue:`, currentMonthRevenue[0]?.total || 0);
    console.log(`Previous month (${prevMonth}/${prevYear}) transactions:`, prevMonthCount);
    console.log(`Previous month revenue:`, prevMonthRevenue[0]?.total || 0);
    
    // Show some sample transactions
    console.log('\n=== SAMPLE TRANSACTIONS ===');
    const samples = await CoinRecharge.find({ status: 'SUCCESS' })
      .sort({ createdAt: -1 })
      .limit(5)
      .select('createdAt amountPaid');
    
    samples.forEach(s => {
      const vnDate = getVNDateParts(s.createdAt);
      console.log(`  ${s.createdAt.toISOString()} (VN: ${vnDate.year}-${vnDate.month}-${vnDate.day}) - ${s.amountPaid} VND`);
    });
    
  } catch (err) {
    console.error('DB Error:', err.message);
  } finally {
    await mongoose.disconnect();
  }
}

main();
