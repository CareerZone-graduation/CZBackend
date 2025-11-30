// Script để kiểm tra giao dịch ZaloPay
import mongoose from 'mongoose';
import dotenv from 'dotenv';
import CoinRecharge from '../src/models/CoinRecharge.js';

dotenv.config();

const checkZaloPayTransactions = async () => {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('Connected to MongoDB');

    // Lấy tất cả giao dịch SUCCESS
    const successTransactions = await CoinRecharge.find({ status: 'SUCCESS' })
      .sort({ createdAt: -1 })
      .limit(20)
      .lean();

    console.log('\n📊 Tất cả giao dịch SUCCESS gần đây:');
    successTransactions.forEach((t, i) => {
      console.log(`${i + 1}. ${t.paymentMethod} - ${t.amountPaid} VNĐ - ${t.createdAt}`);
    });

    // Đếm theo payment method
    const countByMethod = await CoinRecharge.aggregate([
      { $match: { status: 'SUCCESS' } },
      { $group: { _id: '$paymentMethod', count: { $sum: 1 }, total: { $sum: '$amountPaid' } } }
    ]);

    console.log('\n📊 Thống kê theo phương thức thanh toán:');
    countByMethod.forEach(m => {
      console.log(`- ${m._id}: ${m.count} giao dịch, tổng ${m.total} VNĐ`);
    });

    // Kiểm tra giao dịch ZaloPay cụ thể
    const zalopayTransactions = await CoinRecharge.find({ 
      paymentMethod: { $regex: /zalo/i }
    }).lean();

    console.log('\n📊 Giao dịch có chứa "zalo" trong paymentMethod:');
    console.log(zalopayTransactions);

    await mongoose.disconnect();
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
};

checkZaloPayTransactions();
