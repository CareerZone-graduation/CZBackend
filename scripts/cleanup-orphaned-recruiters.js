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
import RecruiterProfile from '../src/models/RecruiterProfile.js';

// Tạo interface để nhận input từ user
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

const question = (query) => new Promise((resolve) => rl.question(query, resolve));

// Kết nối MongoDB
const connectDB = async () => {
  try {
    await mongoose.connect(process.env.DB_URI);
    console.log('✅ MongoDB connected successfully\n');
  } catch (error) {
    console.error('❌ MongoDB connection error:', error);
    process.exit(1);
  }
};

// Tìm và xóa orphaned recruiter users
const cleanupOrphanedRecruiters = async (dryRun = true) => {
  const orphanedUsers = [];

  console.log(dryRun ? '🔍 CHẾ ĐỘ KIỂM TRA (Dry Run) - Không xóa dữ liệu thực tế\n' : '⚠️  CHẾ ĐỘ XÓA THỰC TẾ - Dữ liệu sẽ bị xóa vĩnh viễn!\n');

  try {
    // Tìm tất cả user có email bắt đầu bằng "recruiter_"
    console.log('📋 Tìm kiếm users có email recruiter_xxx...');
    const recruiterUsers = await User.find({
      email: { $regex: /^recruiter_/i },
      role: 'recruiter'
    }).lean();

    console.log(`   ✓ Tìm thấy ${recruiterUsers.length} users có email recruiter_xxx\n`);

    // Kiểm tra từng user xem có RecruiterProfile không
    console.log('📋 Kiểm tra tham chiếu RecruiterProfile...');
    for (const user of recruiterUsers) {
    console.log(user._id);
      const profileExists = await RecruiterProfile.findOne({ userId: user._id });
    //   kiểm tra fullname nếu ra rỗng tức là cần xóa
      if (profileExists
        && (!profileExists.fullname || profileExists.fullname.trim() === '')) {
        console.log(profileExists);
        orphanedUsers.push({
          _id: user._id,
          email: user.email,
          fullname: user.fullname,
          createdAt: user.createdAt
        });
        
        console.log(`   ⚠️  Orphaned User: ${user.email} (ID: ${user._id})`);
        
        if (!dryRun) {
          await User.deleteOne({ _id: user._id });
        }
      }
    }

    console.log(`\n   ${dryRun ? 'Sẽ xóa' : 'Đã xóa'} ${orphanedUsers.length} orphaned recruiter users\n`);

  } catch (error) {
    console.error('❌ Lỗi khi xử lý:', error);
  }

  return orphanedUsers;
};

// In kết quả chi tiết
const printResults = (orphanedUsers, dryRun) => {
  console.log('\n' + '='.repeat(80));
  console.log(dryRun ? '📊 KẾT QUẢ KIỂM TRA (DRY RUN)' : '📊 KẾT QUẢ XÓA DỮ LIỆU');
  console.log('='.repeat(80) + '\n');

  if (orphanedUsers.length === 0) {
    console.log('✅ Không tìm thấy orphaned recruiter users nào!');
  } else {
    console.log(`⚠️  Tìm thấy ${orphanedUsers.length} orphaned recruiter users:\n`);
    
    orphanedUsers.forEach((user, index) => {
      console.log(`${index + 1}. Email: ${user.email}`);
      console.log(`   ID: ${user._id}`);
      console.log(`   Fullname: ${user.fullname || 'N/A'}`);
      console.log(`   Created: ${user.createdAt ? new Date(user.createdAt).toLocaleString() : 'N/A'}`);
      console.log('');
    });
  }

  console.log('='.repeat(80));
  console.log(`   TỔNG CỘNG: ${orphanedUsers.length} users ${dryRun ? 'sẽ bị xóa' : 'đã xóa'}`);
  console.log('='.repeat(80) + '\n');
};

// Main function
const main = async () => {
  await connectDB();
  
  console.log('⚠️  CẢNH BÁO: Script này sẽ xóa các user có email recruiter_xxx mà không có RecruiterProfile\n');
  
  // Chạy dry run trước
  console.log('Bước 1: Chạy kiểm tra (Dry Run)...\n');
  const dryRunResults = await cleanupOrphanedRecruiters(true);
  printResults(dryRunResults, true);
  
  if (dryRunResults.length === 0) {
    console.log('✅ Không có dữ liệu nào cần xóa. Kết thúc script.');
    rl.close();
    await mongoose.connection.close();
    process.exit(0);
    return;
  }
  
  // Hỏi user có muốn xóa thực tế không
  const answer = await question('Bạn có muốn XÓA THỰC TẾ các users này không? (yes/no): ');
  
  if (answer.toLowerCase() === 'yes') {
    console.log('\n⚠️  Bắt đầu xóa dữ liệu thực tế...\n');
    const actualResults = await cleanupOrphanedRecruiters(false);
    printResults(actualResults, false);
    console.log('✅ Hoàn thành việc dọn dẹp orphaned recruiter users!');
  } else {
    console.log('\n❌ Đã hủy thao tác xóa. Không có dữ liệu nào bị xóa.');
  }
  
  rl.close();
  await mongoose.connection.close();
  console.log('\n✅ Đã đóng kết nối MongoDB');
  process.exit(0);
};

main();
