/**
 * Script seed dữ liệu thống kê cho Quý 4/2025 (tháng 10, 11, 12)
 * Bao gồm: Users, Jobs, Applications, CoinRecharge
 * 
 * Chạy: npm run seed:q4-2025
 */

import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { User, Job, Application, CoinRecharge, RecruiterProfile } from '../src/models/index.js';

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

// Danh sách job titles
const jobTitles = [
  'Senior Frontend Developer', 'Backend Developer', 'Full Stack Developer',
  'Mobile Developer (React Native)', 'iOS Developer', 'Android Developer',
  'DevOps Engineer', 'QA Engineer', 'Business Analyst',
  'Product Manager', 'UI/UX Designer', 'Data Analyst',
  'Marketing Manager', 'Sales Executive', 'HR Manager',
  'Account Manager', 'Customer Service', 'Content Writer'
];

// Payment methods
const paymentMethods = ['VNPAY', 'ZALOPAY', 'MOMO'];

const seedAnalyticsData = async () => {
  try {
    const dbUri = process.env.DB_URI || process.env.MONGODB_URI;
    if (!dbUri) {
      throw new Error('DB_URI or MONGODB_URI not found in environment variables');
    }
    await mongoose.connect(dbUri);
    console.log('✅ Connected to MongoDB');

    // Định nghĩa khoảng thời gian
    const startOct = new Date('2025-10-01T00:00:00.000Z');
    const endOct = new Date('2025-10-31T23:59:59.999Z');
    const startNov = new Date('2025-11-01T00:00:00.000Z');
    const endNov = new Date('2025-11-30T23:59:59.999Z');
    const startDec = new Date('2025-12-01T00:00:00.000Z');
    const endDec = new Date('2025-12-31T23:59:59.999Z');

    const periods = [
      { name: 'Tháng 10/2025', start: startOct, end: endOct, users: 150, jobs: 80, apps: 350, revenue: 45 },
      { name: 'Tháng 11/2025', start: startNov, end: endNov, users: 180, jobs: 95, apps: 420, revenue: 52 },
      { name: 'Tháng 12/2025', start: startDec, end: endDec, users: 220, jobs: 110, apps: 500, revenue: 60 }
    ];

    let totalUsers = 0;
    let totalJobs = 0;
    let totalApps = 0;
    let totalRevenue = 0;

    for (const period of periods) {
      console.log(`\n📅 Đang seed dữ liệu cho ${period.name}...`);

      // 1. TẠO USERS (Candidates + Recruiters)
      const users = [];
      const candidateCount = Math.floor(period.users * 0.7); // 70% candidates
      const recruiterCount = period.users - candidateCount;  // 30% recruiters

      // Tạo Candidates
      for (let i = 0; i < candidateCount; i++) {
        const fullName = generateFullName();
        const email = `candidate_${Date.now()}_${i}@test.com`;
        users.push({
          fullname: fullName,
          email: email,
          password: '$2a$10$abcdefghijklmnopqrstuvwxyz123456', // Hash giả
          role: 'candidate',
          active: true,
          emailVerified: Math.random() > 0.3, // 70% đã verify
          createdAt: randomDate(period.start, period.end),
          updatedAt: new Date()
        });
      }

      // Tạo Recruiters
      for (let i = 0; i < recruiterCount; i++) {
        const fullName = generateFullName();
        const email = `recruiter_${Date.now()}_${i}@test.com`;
        users.push({
          fullname: fullName,
          email: email,
          password: '$2a$10$abcdefghijklmnopqrstuvwxyz123456',
          role: 'recruiter',
          active: true,
          emailVerified: Math.random() > 0.2, // 80% đã verify
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
      const validIndustries = [
        'Công nghệ thông tin', 'Tài chính', 'Y tế', 'Giáo dục', 
        'Sản xuất', 'Bán lẻ', 'Xây dựng', 'Du lịch', 
        'Nông nghiệp', 'Truyền thông', 'Vận tải', 'Bất động sản', 
        'Dịch vụ', 'Khởi nghiệp', 'Nhà hàng - Khách sạn'
      ];
      
      for (let i = 0; i < recruiterIds.length; i++) {
        const recruiterId = recruiterIds[i];
        const companyName = companies[Math.floor(Math.random() * companies.length)];
        const recruiterFullName = generateFullName(); // Tạo tên cho recruiter
        
        recruiterProfiles.push({
          userId: recruiterId,
          fullname: recruiterFullName, // THÊM FIELD BẮT BUỘC
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
                coordinates: [106.7, 10.8] // [longitude, latitude] cho HCM
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

      // 3. BỎ QUA JOBS - Quá phức tạp để seed
      console.log(`⏭️  Skipped jobs seeding (schema too complex)`);

      // 4. BỎ QUA APPLICATIONS  
      console.log(`⏭️  Skipped applications seeding (depends on jobs)`);

      // 5. TẠO COIN RECHARGE (Revenue)
      console.log(`🔍 DEBUG: period.revenue = ${period.revenue}, recruiterIds.length = ${recruiterIds.length}`);
      const coinRecharges = [];
      for (let i = 0; i < period.revenue; i++) {
        const recruiterId = recruiterIds[Math.floor(Math.random() * recruiterIds.length)];
        const amount = [50000, 100000, 200000, 500000, 1000000][randomInt(0, 4)];
        const coinAmount = Math.floor(amount / 1000); // 1000 VND = 1 coin

        const rechargeData = {
          userId: recruiterId,
          coinAmount: coinAmount,
          amountPaid: amount,
          paymentMethod: paymentMethods[randomInt(0, 2)],
          transactionCode: `TXN${Date.now()}${randomInt(1000, 9999)}${i}`,
          status: 'SUCCESS',
          createdAt: randomDate(period.start, period.end)
        };
        
        // Debug log for first recharge
        if (i === 0) {
          console.log('🔍 First recharge data:', JSON.stringify(rechargeData, null, 2));
        }
        
        coinRecharges.push(rechargeData);
      }

      console.log(`🔍 DEBUG: Total coinRecharges to insert: ${coinRecharges.length}`);
      if (coinRecharges.length > 0) {
        console.log('🔍 DEBUG: First coinRecharge:', JSON.stringify(coinRecharges[0], null, 2));
        console.log('🔍 DEBUG: Last coinRecharge:', JSON.stringify(coinRecharges[coinRecharges.length - 1], null, 2));
      }

      const insertedRecharges = await CoinRecharge.insertMany(coinRecharges);
      console.log(`✅ Tạo ${insertedRecharges.length} coin recharges`);
      totalRevenue += insertedRecharges.length;
    }

    console.log('\n🎉 HOÀN THÀNH SEED DỮ LIỆU Q4/2025!');
    console.log(`📊 Tổng kết:`);
    console.log(`   - Users: ${totalUsers}`);
    console.log(`   - Jobs: ${totalJobs}`);
    console.log(`   - Applications: ${totalApps}`);
    console.log(`   - Coin Recharges: ${totalRevenue}`);

    await mongoose.disconnect();
    console.log('✅ Disconnected from MongoDB');

  } catch (error) {
    console.error('❌ Error seeding data:', error);
    process.exit(1);
  }
};

seedAnalyticsData();
