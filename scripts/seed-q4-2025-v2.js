/**
 * Script seed dữ liệu thống kê cho Quý 4/2025 (tháng 10, 11, 12)
 * VERSION 2 - Fixed CoinRecharge validation
 * 
 * Chạy: node scripts/seed-q4-2025-v2.js
 */

import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { User, CoinRecharge, RecruiterProfile } from '../src/models/index.js';

// Fix __dirname for ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load .env từ root directory
dotenv.config({ path: path.join(__dirname, '../.env') });

// Hàm tạo ngày ngẫu nhiên trong khoảng
const randomDate = (start, end) => {
  return new Date(start.getTime() + Math.random() * (end.getTime() - start.getTime()));
};

// Hàm tạo số ngẫu nhiên trong khoảng
const randomInt = (min, max) => {
  return Math.floor(Math.random() * (max - min + 1)) + min;
};

// Danh sách tên giả
const firstNames = ['Nguyễn', 'Trần', 'Lê', 'Phạm', 'Hoàng', 'Phan', 'Vũ', 'Đặng', 'Bùi', 'Đỗ', 'Hồ', 'Ngô'];
const lastNames = ['Văn', 'Thị', 'Minh', 'Hoàng', 'Thanh', 'Thu', 'Hương', 'Anh', 'Linh', 'Phương', 'Tuấn', 'Hải'];
const middleNames = ['An', 'Bình', 'Cường', 'Dũng', 'Đức', 'Giang', 'Hà', 'Hùng', 'Khoa', 'Long', 'Nam', 'Quang'];

const generateFullName = () => {
  const first = firstNames[Math.floor(Math.random() * firstNames.length)];
  const middle = middleNames[Math.floor(Math.random() * middleNames.length)];
  const last = lastNames[Math.floor(Math.random() * lastNames.length)];
  return `${first} ${middle} ${last}`;
};

// Danh sách công ty
const companies = [
  'TechViet Solutions', 'VinaTech Corp', 'FPT Software', 'VNG Corporation', 
  'Tiki.vn', 'Shopee Vietnam', 'Grab Vietnam', 'Lazada Vietnam',
  'MOMO Technology', 'ZaloPay', 'ViettelPay', 'VPBank Digital',
  'SmartOSC', 'KMS Technology', 'NashTech', 'Rikkeisoft',
  'TMA Solutions', 'Gameloft', 'CMC Corporation', 'Base.vn'
];

// Payment methods
const paymentMethods = ['VNPAY', 'MOMO', 'BANK_CARD'];

const seedAnalyticsData = async () => {
  try {
    const dbUri = process.env.DB_URI || process.env.MONGODB_URI;
    if (!dbUri) {
      throw new Error('DB_URI or MONGODB_URI not found in environment variables');
    }
    await mongoose.connect(dbUri);
    console.log('✅ Connected to MongoDB\n');

    // Định nghĩa khoảng thời gian
    const startOct = new Date('2025-10-01T00:00:00.000Z');
    const endOct = new Date('2025-10-31T23:59:59.999Z');
    const startNov = new Date('2025-11-01T00:00:00.000Z');
    const endNov = new Date('2025-11-30T23:59:59.999Z');
    const startDec = new Date('2025-12-01T00:00:00.000Z');
    const endDec = new Date('2025-12-31T23:59:59.999Z');

    const periods = [
      { name: 'Tháng 10/2025', start: startOct, end: endOct, users: 150, revenue: 45 },
      { name: 'Tháng 11/2025', start: startNov, end: endNov, users: 180, revenue: 52 },
      { name: 'Tháng 12/2025', start: startDec, end: endDec, users: 220, revenue: 60 }
    ];

    const validIndustries = [
      'Công nghệ thông tin', 'Tài chính', 'Y tế', 'Giáo dục', 
      'Sản xuất', 'Bán lẻ', 'Xây dựng', 'Du lịch', 
      'Nông nghiệp', 'Truyền thông', 'Vận tải', 'Bất động sản', 
      'Dịch vụ', 'Khởi nghiệp', 'Nhà hàng - Khách sạn'
    ];

    let totalUsers = 0;
    let totalRevenue = 0;

    for (const period of periods) {
      console.log(`📅 Đang seed dữ liệu cho ${period.name}...`);

      // 1. TẠO USERS (70% candidates, 30% recruiters)
      const users = [];
      const candidateCount = Math.floor(period.users * 0.7);
      const recruiterCount = period.users - candidateCount;

      // Tạo Candidates
      for (let i = 0; i < candidateCount; i++) {
        const fullName = generateFullName();
        const email = `candidate_${Date.now()}_${Math.random().toString(36).substr(2, 9)}_${i}@test.com`;
        users.push({
          fullname: fullName,
          email: email,
          password: '$2a$10$abcdefghijklmnopqrstuvwxyz123456',
          role: 'candidate',
          active: true,
          emailVerified: Math.random() > 0.3,
          createdAt: randomDate(period.start, period.end),
          updatedAt: new Date()
        });
      }

      // Tạo Recruiters
      for (let i = 0; i < recruiterCount; i++) {
        const fullName = generateFullName();
        const email = `recruiter_${Date.now()}_${Math.random().toString(36).substr(2, 9)}_${i}@test.com`;
        users.push({
          fullname: fullName,
          email: email,
          password: '$2a$10$abcdefghijklmnopqrstuvwxyz123456',
          role: 'recruiter',
          active: true,
          emailVerified: Math.random() > 0.2,
          createdAt: randomDate(period.start, period.end),
          updatedAt: new Date()
        });
      }

      const insertedUsers = await User.insertMany(users);
      console.log(`✅ Tạo ${insertedUsers.length} users (${candidateCount} candidates, ${recruiterCount} recruiters)`);
      totalUsers += insertedUsers.length;

      // Lấy danh sách recruiters vừa tạo
      const recruiterIds = insertedUsers
        .filter(u => u.role === 'recruiter')
        .map(u => u._id);

      // 2. TẠO RECRUITER PROFILES
      const recruiterProfiles = [];
      
      for (let i = 0; i < recruiterIds.length; i++) {
        const recruiterId = recruiterIds[i];
        const companyName = companies[Math.floor(Math.random() * companies.length)];
        const recruiterFullName = generateFullName();
        
        recruiterProfiles.push({
          userId: recruiterId,
          fullname: recruiterFullName,
          company: {
            name: companyName,
            about: `${companyName} là công ty hàng đầu tại Việt Nam`,
            logo: 'https://via.placeholder.com/150',
            website: `https://${companyName.toLowerCase().replace(/\s+/g, '')}.com`,
            size: ['10-50', '51-200', '201-500', '501-1000', '>1000'][randomInt(0, 4)],
            industry: validIndustries[randomInt(0, validIndustries.length - 1)],
            location: {
              province: 'Hồ Chí Minh',
              district: 'Quận 1',
              address: `${randomInt(1, 500)} Đường Nguyễn Huệ`,
              coordinates: {
                type: 'Point',
                coordinates: [106.7, 10.8]
              }
            }
          },
          contactInfo: {
            email: `hr@${companyName.toLowerCase().replace(/\s+/g, '')}.com`,
            phone: `09${randomInt(10000000, 99999999)}`
          },
          approvalStatus: 'approved',
          verified: Math.random() > 0.5,
          createdAt: randomDate(period.start, period.end),
          updatedAt: new Date()
        });
      }

      if (recruiterProfiles.length > 0) {
        await RecruiterProfile.insertMany(recruiterProfiles);
        console.log(`✅ Tạo ${recruiterProfiles.length} recruiter profiles`);
      }

      // 3. TẠO COIN RECHARGES (Revenue)
      console.log(`🔍 Creating ${period.revenue} coin recharges for ${recruiterIds.length} recruiters...`);
      
      const coinRecharges = [];
      for (let i = 0; i < period.revenue; i++) {
        const recruiterId = recruiterIds[Math.floor(Math.random() * recruiterIds.length)];
        const amountPaid = [50000, 100000, 200000, 500000, 1000000][randomInt(0, 4)];
        const coinAmount = Math.floor(amountPaid / 1000); // 1 coin = 1000 VND
        const transactionCode = `TXN${Date.now()}_${Math.random().toString(36).substr(2, 9)}_${i}`;

        const rechargeData = {
          userId: recruiterId,
          coinAmount: coinAmount,
          amountPaid: amountPaid,
          paymentMethod: paymentMethods[randomInt(0, 2)],
          transactionCode: transactionCode,
          status: 'SUCCESS',
          createdAt: randomDate(period.start, period.end)
        };
        
        // Debug first recharge
        if (i === 0) {
          console.log('🔍 First recharge sample:', {
            userId: recruiterId.toString(),
            coinAmount,
            amountPaid,
            paymentMethod: rechargeData.paymentMethod,
            transactionCode
          });
        }
        
        coinRecharges.push(rechargeData);
      }

      console.log(`🔍 Inserting ${coinRecharges.length} coin recharges...`);
      const insertedRecharges = await CoinRecharge.insertMany(coinRecharges);
      console.log(`✅ Tạo ${insertedRecharges.length} coin recharges\n`);
      totalRevenue += insertedRecharges.length;
    }

    console.log('🎉 HOÀN THÀNH SEED DỮ LIỆU Q4/2025!');
    console.log('📊 Tổng kết:');
    console.log(`   - Users: ${totalUsers}`);
    console.log(`   - Coin Recharges: ${totalRevenue}`);

    await mongoose.disconnect();
    console.log('\n✅ Disconnected from MongoDB');
    process.exit(0);

  } catch (error) {
    console.error('❌ Error seeding data:', error);
    await mongoose.disconnect();
    process.exit(1);
  }
};

seedAnalyticsData();
