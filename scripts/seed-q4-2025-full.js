/**
 * Script seed dữ liệu ĐẦY ĐỦ cho Quý 4/2025 (tháng 10, 11, 12)
 * Bao gồm: Users, RecruiterProfiles, Jobs, Applications, CoinRecharges
 * 
 * Chạy: node scripts/seed-q4-2025-full.js
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

// Hàm lấy job titles thực từ database
const getJobTitlesFromDB = async () => {
  try {
    const jobTitlesByCategory = {};
    
    // Lấy tất cả các job titles nhóm theo category
    const jobs = await Job.aggregate([
      {
        $group: {
          _id: '$category',
          titles: { $addToSet: '$title' }
        }
      }
    ]);
    
    // Chuyển đổi kết quả thành object
    jobs.forEach(job => {
      if (job._id && job.titles && job.titles.length > 0) {
        jobTitlesByCategory[job._id] = job.titles;
      }
    });
    
    console.log('✅ Lấy job titles từ database:', Object.keys(jobTitlesByCategory).length, 'categories');
    
    // Nếu database không có dữ liệu, dùng fallback data
    if (Object.keys(jobTitlesByCategory).length === 0) {
      console.log('⚠️  Database chưa có job titles, sử dụng dữ liệu mẫu');
      return {
        'IT': ['Senior Backend Developer', 'Frontend Developer', 'Full Stack Developer', 'DevOps Engineer'],
        'SOFTWARE_DEVELOPMENT': ['Software Engineer', 'Mobile Developer', 'QA Engineer', 'System Architect'],
        'DATA_SCIENCE': ['Data Analyst', 'Data Engineer', 'ML Engineer', 'BI Developer'],
        'WEB_DEVELOPMENT': ['Web Developer', 'React Developer', 'Vue.js Developer', 'Node.js Developer'],
        'MARKETING': ['Marketing Manager', 'Digital Marketing Specialist', 'SEO Expert', 'Content Marketing Lead'],
        'SALES': ['SNhững ngành nghề phổ biến nhấtales Manager', 'Business Development', 'Account Executive', 'Sales Representative'],
        'GRAPHIC_DESIGN': ['Graphic Designer', 'UI/UX Designer', 'Motion Designer', '3D Artist'],
        'HUMAN_RESOURCES': ['HR Manager', 'Talent Acquisition', 'HR Business Partner', 'Recruiter'],
        'CUSTOMER_SERVICE': ['Customer Service Representative', 'Support Specialist', 'Call Center Agent'],
        'ACCOUNTING': ['Accountant', 'Senior Accountant', 'Tax Accountant', 'Financial Analyst']
      };
    }
    
    return jobTitlesByCategory;
  } catch (error) {
    console.error('❌ Lỗi khi lấy job titles từ database:', error);
    // Return fallback data nếu có lỗi
    return {
      'IT': ['Senior Backend Developer', 'Frontend Developer', 'Full Stack Developer', 'DevOps Engineer'],
      'SOFTWARE_DEVELOPMENT': ['Software Engineer', 'Mobile Developer', 'QA Engineer', 'System Architect'],
      'DATA_SCIENCE': ['Data Analyst', 'Data Engineer', 'ML Engineer', 'BI Developer'],
      'WEB_DEVELOPMENT': ['Web Developer', 'React Developer', 'Vue.js Developer', 'Node.js Developer'],
      'MARKETING': ['Marketing Manager', 'Digital Marketing Specialist', 'SEO Expert', 'Content Marketing Lead'],
      'SALES': ['Sales Manager', 'Business Development', 'Account Executive', 'Sales Representative'],
      'GRAPHIC_DESIGN': ['Graphic Designer', 'UI/UX Designer', 'Motion Designer', '3D Artist'],
      'HUMAN_RESOURCES': ['HR Manager', 'Talent Acquisition', 'HR Business Partner', 'Recruiter'],
      'CUSTOMER_SERVICE': ['Customer Service Representative', 'Support Specialist', 'Call Center Agent'],
      'ACCOUNTING': ['Accountant', 'Senior Accountant', 'Tax Accountant', 'Financial Analyst']
    };
  }
};

// Các enum values
const jobTypes = ['FULL_TIME', 'PART_TIME', 'CONTRACT', 'INTERNSHIP'];
const workTypes = ['ON_SITE', 'REMOTE', 'HYBRID'];
const experienceLevels = ['ENTRY_LEVEL', 'MID_LEVEL', 'SENIOR_LEVEL', 'NO_EXPERIENCE', 'FRESHER'];
const jobCategories = ['IT', 'SOFTWARE_DEVELOPMENT', 'DATA_SCIENCE', 'WEB_DEVELOPMENT', 'MARKETING', 'SALES', 'GRAPHIC_DESIGN', 'HUMAN_RESOURCES', 'CUSTOMER_SERVICE', 'ACCOUNTING'];
const paymentMethods = ['VNPAY', 'MOMO', 'BANK_CARD'];
const validIndustries = [
  'Công nghệ thông tin', 'Tài chính', 'Y tế', 'Giáo dục', 
  'Sản xuất', 'Bán lẻ', 'Xây dựng', 'Du lịch', 
  'Nông nghiệp', 'Truyền thông', 'Vận tải', 'Bất động sản', 
  'Dịch vụ', 'Khởi nghiệp', 'Nhà hàng - Khách sạn'
];

// Locations in Vietnam
const locations = [
  { province: 'Hồ Chí Minh', district: 'Quận 1', commune: 'Phường Bến Nghé', coords: [106.7, 10.8] },
  { province: 'Hồ Chí Minh', district: 'Quận 3', commune: 'Phường Võ Thị Sáu', coords: [106.68, 10.78] },
  { province: 'Hà Nội', district: 'Quận Ba Đình', commune: 'Phường Điện Biên', coords: [105.83, 21.03] },
  { province: 'Hà Nội', district: 'Quận Hoàn Kiếm', commune: 'Phường Hàng Bạc', coords: [105.85, 21.02] },
  { province: 'Đà Nẵng', district: 'Quận Hải Châu', commune: 'Phường Hải Châu I', coords: [108.22, 16.07] }
];

const seedAnalyticsData = async () => {
  try {
    const dbUri = process.env.DB_URI || process.env.MONGODB_URI;
    if (!dbUri) {
      throw new Error('DB_URI or MONGODB_URI not found in environment variables');
    }
    await mongoose.connect(dbUri);
    console.log('✅ Connected to MongoDB\n');

    // Lấy job titles thực từ database
    console.log('📋 Đang lấy job titles từ database...');
    const jobTitlesByCategory = await getJobTitlesFromDB();
    console.log('📋 Số lượng categories có job titles:', Object.keys(jobTitlesByCategory).length);
    
    // Hiển thị sample data
    if (Object.keys(jobTitlesByCategory).length > 0) {
      console.log('📋 Sample job titles:');
      Object.keys(jobTitlesByCategory).slice(0, 3).forEach(category => {
        console.log(`   - ${category}: ${jobTitlesByCategory[category].slice(0, 3).join(', ')}...`);
      });
    }

    // Định nghĩa khoảng thời gian
    const startOct = new Date('2025-10-01T00:00:00.000Z');
    const endOct = new Date('2025-10-31T23:59:59.999Z');
    const startNov = new Date('2025-11-01T00:00:00.000Z');
    const endNov = new Date('2025-11-30T23:59:59.999Z');
    const startDec = new Date('2025-12-01T00:00:00.000Z');
    const endDec = new Date('2025-12-31T23:59:59.999Z');

    const periods = [
      { name: 'Tháng 10/2025', start: startOct, end: endOct, users: 150, jobs: 80, apps: 200, revenue: 45 },
      { name: 'Tháng 11/2025', start: startNov, end: endNov, users: 180, jobs: 95, apps: 250, revenue: 52 },
      { name: 'Tháng 12/2025', start: startDec, end: endDec, users: 220, jobs: 110, apps: 300, revenue: 60 }
    ];

    let totalUsers = 0;
    let totalJobs = 0;
    let totalApps = 0;
    let totalRevenue = 0;

    for (const period of periods) {
      console.log(`📅 Đang seed dữ liệu cho ${period.name}...`);

      // 1. TẠO USERS (70% candidates, 30% recruiters)
      const users = [];
      const userDataMap = new Map(); // Lưu fullname để dùng sau
      const candidateCount = Math.floor(period.users * 0.7);
      const recruiterCount = period.users - candidateCount;

      // Tạo Candidates
      for (let i = 0; i < candidateCount; i++) {
        const fullName = generateFullName();
        const email = `candidate_${Date.now()}_${Math.random().toString(36).substr(2, 9)}_${i}@test.com`;
        const userData = {
          fullname: fullName,
          email: email,
          password: '$2a$10$abcdefghijklmnopqrstuvwxyz123456',
          role: 'candidate',
          active: true,
          emailVerified: Math.random() > 0.3,
          createdAt: randomDate(period.start, period.end),
          updatedAt: new Date()
        };
        users.push(userData);
        // Lưu email để map với fullname sau
        userDataMap.set(email, fullName);
      }

      // Tạo Recruiters
      for (let i = 0; i < recruiterCount; i++) {
        const fullName = generateFullName();
        const email = `recruiter_${Date.now()}_${Math.random().toString(36).substr(2, 9)}_${i}@test.com`;
        const userData = {
          fullname: fullName,
          email: email,
          password: '$2a$10$abcdefghijklmnopqrstuvwxyz123456',
          role: 'recruiter',
          active: true,
          emailVerified: Math.random() > 0.2,
          createdAt: randomDate(period.start, period.end),
          updatedAt: new Date()
        };
        users.push(userData);
        userDataMap.set(email, fullName);
      }

      const insertedUsers = await User.insertMany(users);
      console.log(`✅ Tạo ${insertedUsers.length} users (${candidateCount} candidates, ${recruiterCount} recruiters)`);
      totalUsers += insertedUsers.length;

      // Lấy danh sách IDs
      const recruiterIds = insertedUsers.filter(u => u.role === 'recruiter').map(u => u._id);
      const candidateUserIds = insertedUsers.filter(u => u.role === 'candidate').map(u => u._id);

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
            about: `${companyName} là công ty hàng đầu tại Việt Nam trong lĩnh vực công nghệ và dịch vụ số.`,
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

      const insertedProfiles = await RecruiterProfile.insertMany(recruiterProfiles);
      console.log(`✅ Tạo ${insertedProfiles.length} recruiter profiles`);

      // Lấy recruiterProfileIds
      const recruiterProfileIds = insertedProfiles.map(p => p._id);

      // 2.5. TẠO CANDIDATE PROFILES
      const { default: CandidateProfile } = await import('../src/models/CandidateProfile.js');
      const candidateProfiles = [];
      
      console.log(`🔍 Creating candidate profiles for ${candidateUserIds.length} candidates...`);
      
      for (let i = 0; i < candidateUserIds.length; i++) {
        const candidateUser = insertedUsers.find(u => u._id.equals(candidateUserIds[i]));
        
        if (!candidateUser) {
          console.error(`❌ Cannot find candidate user for ID: ${candidateUserIds[i]}`);
          continue;
        }
        
        // Lấy fullname từ map hoặc từ database
        const fullname = userDataMap.get(candidateUser.email) || generateFullName();
        
        const profileData = {
          userId: candidateUserIds[i],
          fullname: fullname,
          createdAt: randomDate(period.start, period.end),
          updatedAt: new Date()
        };
        
        // Debug first profile
        if (i === 0) {
          console.log('🔍 First candidate profile:', JSON.stringify({ ...profileData, userId: profileData.userId.toString() }, null, 2));
        }
        
        candidateProfiles.push(profileData);
      }

      console.log(`🔍 About to insert ${candidateProfiles.length} candidate profiles...`);
      const insertedCandidateProfiles = await CandidateProfile.insertMany(candidateProfiles);
      console.log(`✅ Tạo ${insertedCandidateProfiles.length} candidate profiles`);

      // Lấy candidateProfileIds
      const candidateProfileIds = insertedCandidateProfiles.map(p => p._id);

      // 3. TẠO JOBS
      console.log(`🔍 Creating ${period.jobs} job postings...`);
      const jobs = [];
      
      // Lấy danh sách categories có sẵn trong jobTitlesByCategory
      const availableCategories = Object.keys(jobTitlesByCategory);
      const categoriesToUse = availableCategories.length > 0 ? availableCategories : jobCategories;
      
      for (let i = 0; i < period.jobs; i++) {
        const category = categoriesToUse[randomInt(0, categoriesToUse.length - 1)];
        const titles = jobTitlesByCategory[category] || ['Software Developer', 'Business Analyst', 'Project Manager'];
        const title = titles[randomInt(0, titles.length - 1)];
        const location = locations[randomInt(0, locations.length - 1)];
        const jobDate = randomDate(period.start, period.end);
        const deadlineDate = new Date(jobDate);
        deadlineDate.setDate(deadlineDate.getDate() + randomInt(30, 90)); // 30-90 ngày sau

        const jobData = {
          title: title,
          description: `Chúng tôi đang tìm kiếm ${title} có kinh nghiệm để tham gia vào đội ngũ phát triển sản phẩm của chúng tôi. Đây là cơ hội tuyệt vời để phát triển sự nghiệp và làm việc với các công nghệ hiện đại nhất.`,
          requirements: `- Tốt nghiệp Đại học chuyên ngành liên quan\n- Có kinh nghiệm từ 1-3 năm\n- Kỹ năng giao tiếp tốt\n- Làm việc nhóm hiệu quả\n- Chủ động và có trách nhiệm`,
          benefits: `- Lương cạnh tranh, thưởng theo hiệu suất\n- Bảo hiểm đầy đủ theo quy định\n- Du lịch hàng năm\n- Môi trường làm việc chuyên nghiệp\n- Cơ hội thăng tiến`,
          location: {
            province: location.province,
            district: location.district,
            commune: location.commune,
            coordinates: {
              type: 'Point',
              coordinates: location.coords
            }
          },
          address: `${randomInt(1, 500)} Đường ${location.district}`,
          type: jobTypes[randomInt(0, jobTypes.length - 1)],
          workType: workTypes[randomInt(0, workTypes.length - 1)],
          minSalary: mongoose.Types.Decimal128.fromString(String(randomInt(8, 15) * 1000000)),
          maxSalary: mongoose.Types.Decimal128.fromString(String(randomInt(20, 40) * 1000000)),
          deadline: deadlineDate,
          experience: experienceLevels[randomInt(0, experienceLevels.length - 1)],
          category: category,
          skills: ['JavaScript', 'React', 'Node.js', 'MongoDB'].slice(0, randomInt(2, 4)),
          status: 'ACTIVE',
          recruiterProfileId: recruiterProfileIds[randomInt(0, recruiterProfileIds.length - 1)],
          moderationStatus: 'APPROVED',
          createdAt: jobDate,
          updatedAt: jobDate
        };

        jobs.push(jobData);
      }

      const insertedJobs = await Job.insertMany(jobs);
      console.log(`✅ Tạo ${insertedJobs.length} jobs`);
      totalJobs += insertedJobs.length;

      // 4. TẠO APPLICATIONS
      console.log(`🔍 Creating ${period.apps} applications...`);
      const applications = [];

      for (let i = 0; i < period.apps; i++) {
        const applicationDate = randomDate(period.start, period.end);
        const job = insertedJobs[randomInt(0, insertedJobs.length - 1)];
        const candidateProfileId = candidateProfileIds[randomInt(0, candidateProfileIds.length - 1)];
        
        // Lấy thông tin recruiter profile để có company logo
        const recruiterProfile = insertedProfiles.find(p => p._id.equals(job.recruiterProfileId));
        
        const appData = {
          jobId: job._id,
          candidateProfileId: candidateProfileId,
          status: ['PENDING', 'REVIEWING', 'SCHEDULED_INTERVIEW', 'INTERVIEWED', 'ACCEPTED', 'REJECTED'][randomInt(0, 5)],
          jobSnapshot: {
            title: job.title,
            company: recruiterProfile?.company?.name || 'Unknown Company',
            logo: recruiterProfile?.company?.logo || 'https://via.placeholder.com/150'
          },
          appliedAt: applicationDate,
          createdAt: applicationDate,
          updatedAt: applicationDate
        };

        applications.push(appData);
      }

      const insertedApps = await Application.insertMany(applications);
      console.log(`✅ Tạo ${insertedApps.length} applications`);
      totalApps += insertedApps.length;

      // 5. TẠO COIN RECHARGES
      console.log(`🔍 Creating ${period.revenue} coin recharges...`);
      const coinRecharges = [];
      
      for (let i = 0; i < period.revenue; i++) {
        const recruiterId = recruiterIds[randomInt(0, recruiterIds.length - 1)];
        const amountPaid = [50000, 100000, 200000, 500000, 1000000][randomInt(0, 4)];
        const coinAmount = Math.floor(amountPaid / 1000);
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
        
        coinRecharges.push(rechargeData);
      }

      const insertedRecharges = await CoinRecharge.insertMany(coinRecharges);
      console.log(`✅ Tạo ${insertedRecharges.length} coin recharges\n`);
      totalRevenue += insertedRecharges.length;
    }

    console.log('🎉 HOÀN THÀNH SEED DỮ LIỆU Q4/2025!');
    console.log('📊 Tổng kết:');
    console.log(`   - Users: ${totalUsers}`);
    console.log(`   - Jobs: ${totalJobs}`);
    console.log(`   - Applications: ${totalApps}`);
    console.log(`   - Coin Recharges: ${totalRevenue}`);

    await mongoose.disconnect();
    console.log('\n✅ Disconnected from MongoDB');
    process.exit(0);

  } catch (error) {
    console.error('❌ Error seeding data:', error);
    if (error.errors) {
      Object.keys(error.errors).forEach(key => {
        console.error(`   - ${key}: ${error.errors[key].message}`);
      });
    }
    await mongoose.disconnect();
    process.exit(1);
  }
};

seedAnalyticsData();
