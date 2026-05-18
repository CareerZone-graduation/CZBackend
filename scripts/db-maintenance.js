import mongoose from 'mongoose';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import readline from 'readline';

// Load environment variables
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
dotenv.config({ path: join(__dirname, '../.env') });

// Import models
import User from '../src/models/User.js';
import CandidateProfile from '../src/models/CandidateProfile.js';
import RecruiterProfile from '../src/models/RecruiterProfile.js';
import Job from '../src/models/Job.js';
import Application from '../src/models/Application.js';
import SavedJob from '../src/models/SavedJob.js';
import SearchHistory from '../src/models/SearchHistory.js';
import Notification from '../src/models/Notification.js';
import ChatMessage from '../src/models/ChatMessage.js';
import Conversation from '../src/models/Conversation.js';

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

const question = (query) => new Promise((resolve) => rl.question(query, resolve));

const connectDB = async () => {
  try {
    await mongoose.connect(process.env.DB_URI);
    console.log('✅ MongoDB connected successfully\n');
  } catch (error) {
    console.error('❌ MongoDB connection error:', error);
    process.exit(1);
  }
};

// 1. CHỨC NĂNG: BÁO CÁO (Chỉ kiểm tra, không xóa)
const viewDataIntegrityReport = async () => {
  console.log('🔍 Bắt đầu kiểm tra tính toàn vẹn dữ liệu...\n');
  let totalIssues = 0;

  const collections = [
    { name: 'CandidateProfile', model: CandidateProfile, field: 'userId', target: User, targetField: '_id', display: 'fullname' },
    { name: 'RecruiterProfile', model: RecruiterProfile, field: 'userId', target: User, targetField: '_id', display: 'fullname' },
    { name: 'Job', model: Job, field: 'recruiterProfileId', target: RecruiterProfile, targetField: '_id', display: 'title' },
    { name: 'SearchHistory', model: SearchHistory, field: 'userId', target: User, targetField: '_id', display: 'query' },
    { name: 'Notification', model: Notification, field: 'userId', target: User, targetField: '_id', display: 'title' }
  ];

  for (const coll of collections) {
    const records = await coll.model.find({}, `${coll.field} ${coll.display}`).lean();
    let issues = 0;
    for (const record of records) {
      const exists = await coll.target.findById(record[coll.field], coll.targetField).lean();
      if (!exists) {
        if (issues === 0) console.log(`\n❌ ${coll.name.toUpperCase()} - Các bản ghi bị đứt liên kết:`);
        console.log(`   - ID: ${record._id} | ${coll.field}: ${record[coll.field]} | ${coll.display}: ${record[coll.display]}`);
        issues++;
        totalIssues++;
      }
    }
  }

  // Application
  const applications = await Application.find({}, 'jobId candidateProfileId').lean();
  let appIssues = 0;
  for (const app of applications) {
    const bJob = await Job.findById(app.jobId, '_id').lean();
    const bCand = await CandidateProfile.findById(app.candidateProfileId, '_id').lean();
    if (!bJob || !bCand) {
      if (appIssues === 0) console.log(`\n❌ APPLICATION - Các bản ghi bị đứt liên kết:`);
      console.log(`   - ID: ${app._id} | jobId: ${app.jobId} (Tồn tại: ${!!bJob}) | candidateProfileId: ${app.candidateProfileId} (Tồn tại: ${!!bCand})`);
      appIssues++;
      totalIssues++;
    }
  }

  console.log('\n' + '='.repeat(80));
  if (totalIssues === 0) console.log('✅ HOÀN HẢO! Không tìm thấy vấn đề toàn vẹn dữ liệu.');
  else console.log(`⚠️  TỔNG CỘNG: ${totalIssues} vấn đề cần được xử lý.`);
  console.log('='.repeat(80) + '\n');
};

// 2. CHỨC NĂNG: XÓA DỮ LIỆU ĐỨT GÃY CHUNG
const runGeneralCleanup = async (dryRun = true) => {
  const stats = { total: 0 };
  console.log(dryRun ? '🔍 CHẾ ĐỘ KIỂM TRA (Dry Run)\n' : '⚠️  CHẾ ĐỘ XÓA THỰC TẾ\n');
  
  const rules = [
    { name: 'CandidateProfile', model: CandidateProfile, field: 'userId', targetModel: User },
    { name: 'RecruiterProfile', model: RecruiterProfile, field: 'userId', targetModel: User },
    { name: 'Job', model: Job, field: 'recruiterProfileId', targetModel: RecruiterProfile },
    { name: 'SearchHistory', model: SearchHistory, field: 'userId', targetModel: User },
    { name: 'Notification', model: Notification, field: 'userId', targetModel: User },
  ];

  for (const rule of rules) {
    const docs = await rule.model.find({}).lean();
    let count = 0;
    for (const doc of docs) {
      const exists = await rule.targetModel.findById(doc[rule.field]);
      if (!exists) {
        if (!dryRun) await rule.model.deleteOne({ _id: doc._id });
        count++;
        stats.total++;
      }
    }
    if (count > 0) console.log(`   ${rule.name}: ${count} ${dryRun ? 'cần xóa' : 'đã xóa'}`);
  }

  // Application
  const apps = await Application.find({}).lean();
  let appCount = 0;
  for (const app of apps) {
    const j = await Job.findById(app.jobId);
    const c = await CandidateProfile.findById(app.candidateProfileId);
    if (!j || !c) {
      if (!dryRun) await Application.deleteOne({ _id: app._id });
      appCount++;
      stats.total++;
    }
  }
  if (appCount > 0) console.log(`   Application: ${appCount} ${dryRun ? 'cần xóa' : 'đã xóa'}`);

  console.log(`\n=> TỔNG SỐ LƯỢNG RÁC LIÊN KẾT: ${stats.total}\n`);
  return stats.total;
};

// 3. CHỨC NĂNG: DỌN RECRUITER ẢO LỖI
const runRecruiterCleanup = async (dryRun = true) => {
  console.log(dryRun ? '🔍 CHẾ ĐỘ KIỂM TRA RECRUITER ẢO (Dry Run)\n' : '⚠️  CHẾ ĐỘ XÓA THỰC TẾ RECRUITER ẢO\n');
  const recruiterUsers = await User.find({ email: { $regex: /^recruiter_/i }, role: 'recruiter' }).lean();
  let count = 0;

  for (const user of recruiterUsers) {
    const profile = await RecruiterProfile.findOne({ userId: user._id });
    if (profile && (!profile.fullname || profile.fullname.trim() === '')) {
      console.log(`   ⚠️ Lỗi tìm thấy: ${user.email} (ID: ${user._id})`);
      if (!dryRun) {
        await User.deleteOne({ _id: user._id });
        await RecruiterProfile.deleteOne({ _id: profile._id }); // Nên xóa kèm cả profile để triệt để rác
      }
      count++;
    }
  }
  console.log(`\n=> TỔNG CỘNG: ${count} users rác ${dryRun ? 'sẽ bị xóa' : 'đã được xóa'}\n`);
  return count;
};

// MENU CHÍNH
const mainMenu = async () => {
  await connectDB();
  
  while (true) {
    console.log('='.repeat(50));
    console.log('🛠️  CÔNG CỤ BẢO TRÌ DATABASE DB-MAINTENANCE');
    console.log('='.repeat(50));
    console.log('1. Báo cáo tình trạng dữ liệu (Chỉ đọc, rất an toàn)');
    console.log('2. Dọn dẹp các mục dữ liệu bị đứt gãy liên kết');
    console.log('3. Xóa các tài khoản Recruiter ảo lỗi (email recruiter_xxx không có tên)');
    console.log('0. Thoát');
    console.log('='.repeat(50));
    
    const choice = await question('Vui lòng chọn chức năng (0-3): ');

    if (choice === '0') {
      console.log('👋 Tạm biệt!');
      break;
    } else if (choice === '1') {
      await viewDataIntegrityReport();
    } else if (choice === '2') {
      console.log('\n--- DỌN DẸP DỮ LIỆU ĐỨT GÃY ---');
      const issuesFound = await runGeneralCleanup(true);
      if (issuesFound > 0) {
        const confirm = await question('Bạn có chắc chắn muốn XÓA VĨNH VIỄN các dữ liệu này? (yes/no): ');
        if (confirm.toLowerCase() === 'yes') {
          await runGeneralCleanup(false);
          console.log('✅ Đã xóa thành công!');
        } else {
          console.log('❌ Đã hủy thao tác xóa.');
        }
      }
    } else if (choice === '3') {
      console.log('\n--- XÓA RECRUITER ẢO LỖI ---');
      const badFound = await runRecruiterCleanup(true);
      if (badFound > 0) {
        const confirm = await question('Bạn có chắc chắn muốn XÓA VĨNH VIỄN các user này? (yes/no): ');
        if (confirm.toLowerCase() === 'yes') {
          await runRecruiterCleanup(false);
          console.log('✅ Đã xóa thành công!');
        } else {
          console.log('❌ Đã hủy thao tác xóa.');
        }
      }
    } else {
      console.log('⚠️ Lựa chọn không hợp lệ!');
    }
  }

  rl.close();
  await mongoose.connection.close();
  process.exit(0);
};

mainMenu();