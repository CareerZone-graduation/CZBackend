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

// Tìm và xóa dữ liệu orphaned
const cleanupOrphanedData = async (dryRun = true) => {
  const deletionStats = {
    candidateProfiles: 0,
    recruiterProfiles: 0,
    jobs: 0,
    applications: 0,
    savedJobs: 0,
    searchHistory: 0,
    notifications: 0,
    chatMessages: 0,
    conversations: 0
  };

  console.log(dryRun ? '🔍 CHẾ ĐỘ KIỂM TRA (Dry Run) - Không xóa dữ liệu thực tế\n' : '⚠️  CHẾ ĐỘ XÓA THỰC TẾ - Dữ liệu sẽ bị xóa vĩnh viễn!\n');

  try {
    // 1. Xóa CandidateProfile không có userId hợp lệ
    console.log('📋 Xử lý CandidateProfile...');
    const candidateProfiles = await CandidateProfile.find({}).lean();
    for (const profile of candidateProfiles) {
      const userExists = await User.findById(profile.userId);
      if (!userExists) {
        console.log(`   ⚠️  Tìm thấy orphaned CandidateProfile: ${profile._id} (userId: ${profile.userId})`);
        if (!dryRun) {
          await CandidateProfile.deleteOne({ _id: profile._id });
          deletionStats.candidateProfiles++;
        }
      }
    }
    console.log(`   ${dryRun ? 'Sẽ xóa' : 'Đã xóa'} ${dryRun ? candidateProfiles.filter(async p => !(await User.findById(p.userId))).length : deletionStats.candidateProfiles} CandidateProfile\n`);

    // 2. Xóa RecruiterProfile không có userId hợp lệ
    console.log('📋 Xử lý RecruiterProfile...');
    const recruiterProfiles = await RecruiterProfile.find({}).lean();
    for (const profile of recruiterProfiles) {
      const userExists = await User.findById(profile.userId);
      if (!userExists) {
        console.log(`   ⚠️  Tìm thấy orphaned RecruiterProfile: ${profile._id} (userId: ${profile.userId})`);
        if (!dryRun) {
          await RecruiterProfile.deleteOne({ _id: profile._id });
          deletionStats.recruiterProfiles++;
        }
      }
    }
    console.log(`   ${dryRun ? 'Sẽ xóa' : 'Đã xóa'} ${dryRun ? recruiterProfiles.filter(async p => !(await User.findById(p.userId))).length : deletionStats.recruiterProfiles} RecruiterProfile\n`);

    // 3. Xóa Job không có recruiterProfileId hợp lệ
    console.log('📋 Xử lý Job...');
    const jobs = await Job.find({}).lean();
    for (const job of jobs) {
      const recruiterExists = await RecruiterProfile.findById(job.recruiterProfileId);
      if (!recruiterExists) {
        console.log(`   ⚠️  Tìm thấy orphaned Job: ${job._id} (recruiterProfileId: ${job.recruiterProfileId})`);
        if (!dryRun) {
          await Job.deleteOne({ _id: job._id });
          deletionStats.jobs++;
        }
      }
    }
    console.log(`   ${dryRun ? 'Sẽ xóa' : 'Đã xóa'} ${dryRun ? jobs.filter(async j => !(await RecruiterProfile.findById(j.recruiterProfileId))).length : deletionStats.jobs} Job\n`);

    // // 4. Xóa Application không hợp lệ
    console.log('📋 Xử lý Application...');
    const applications = await Application.find({}).lean();
    for (const app of applications) {
      const jobExists = await Job.findById(app.jobId);
      const candidateExists = await CandidateProfile.findById(app.candidateProfileId);
      
      if (!jobExists || !candidateExists) {
        console.log(`   ⚠️  Tìm thấy orphaned Application: ${app._id}`);
        if (!dryRun) {
          await Application.deleteOne({ _id: app._id });
          deletionStats.applications++;
        }
      }
    }
    console.log(`   ${dryRun ? 'Sẽ xóa' : 'Đã xóa'} ${deletionStats.applications} Application\n`);

    // 5. Xóa SavedJob không hợp lệ
    console.log('📋 Xử lý SavedJob...');
    const savedJobs = await SavedJob.find({}).lean();
    for (const saved of savedJobs) {
      const userExists = await User.findById(saved.candidateId);
      const jobExists = await Job.findById(saved.jobId);
      
      if (!userExists || !jobExists) {
        console.log(`   ⚠️  Tìm thấy orphaned SavedJob: ${saved._id}`);
        if (!dryRun) {
          await SavedJob.deleteOne({ _id: saved._id });
          deletionStats.savedJobs++;
        }
      }
    }
    console.log(`   ${dryRun ? 'Sẽ xóa' : 'Đã xóa'} ${deletionStats.savedJobs} SavedJob\n`);

    // 6. Xóa SearchHistory không hợp lệ
    console.log('📋 Xử lý SearchHistory...');
    const searchHistory = await SearchHistory.find({}).lean();
    for (const search of searchHistory) {
      const userExists = await User.findById(search.userId);
      if (!userExists) {
        console.log(`   ⚠️  Tìm thấy orphaned SearchHistory: ${search._id}`);
        if (!dryRun) {
          await SearchHistory.deleteOne({ _id: search._id });
          deletionStats.searchHistory++;
        }
      }
    }
    console.log(`   ${dryRun ? 'Sẽ xóa' : 'Đã xóa'} ${deletionStats.searchHistory} SearchHistory\n`);

    // 7. Xóa Notification không hợp lệ
    console.log('📋 Xử lý Notification...');
    const notifications = await Notification.find({}).lean();
    for (const notif of notifications) {
      const userExists = await User.findById(notif.userId);
      if (!userExists) {
        console.log(`   ⚠️  Tìm thấy orphaned Notification: ${notif._id}`);
        if (!dryRun) {
          await Notification.deleteOne({ _id: notif._id });
          deletionStats.notifications++;
        }
      }
    }
    console.log(`   ${dryRun ? 'Sẽ xóa' : 'Đã xóa'} ${deletionStats.notifications} Notification\n`);

    // 8. Xóa ChatMessage không hợp lệ
    console.log('📋 Xử lý ChatMessage...');
    const chatMessages = await ChatMessage.find({}).lean();
    for (const msg of chatMessages) {
      const senderExists = await User.findById(msg.senderId);
      const recipientExists = await User.findById(msg.recipientId);
      const conversationExists = await Conversation.findById(msg.conversationId);
      
      if (!senderExists || !recipientExists || !conversationExists) {
        console.log(`   ⚠️  Tìm thấy orphaned ChatMessage: ${msg._id}`);
        if (!dryRun) {
          await ChatMessage.deleteOne({ _id: msg._id });
          deletionStats.chatMessages++;
        }
      }
    }
    console.log(`   ${dryRun ? 'Sẽ xóa' : 'Đã xóa'} ${deletionStats.chatMessages} ChatMessage\n`);

    // 9. Xóa Conversation không hợp lệ
    console.log('📋 Xử lý Conversation...');
    const conversations = await Conversation.find({}).lean();
    for (const conv of conversations) {
      const participant1Exists = await User.findById(conv.participant1);
      const participant2Exists = await User.findById(conv.participant2);
      
      if (!participant1Exists || !participant2Exists) {
        console.log(`   ⚠️  Tìm thấy orphaned Conversation: ${conv._id}`);
        if (!dryRun) {
          await Conversation.deleteOne({ _id: conv._id });
          deletionStats.conversations++;
        }
      }
    }
    console.log(`   ${dryRun ? 'Sẽ xóa' : 'Đã xóa'} ${deletionStats.conversations} Conversation\n`);

  } catch (error) {
    console.error('❌ Lỗi khi xử lý:', error);
  }

  return deletionStats;
};

// In kết quả
const printResults = (stats, dryRun) => {
  console.log('\n' + '='.repeat(80));
  console.log(dryRun ? '📊 KẾT QUẢ KIỂM TRA (DRY RUN)' : '📊 KẾT QUẢ XÓA DỮ LIỆU');
  console.log('='.repeat(80) + '\n');

  let total = 0;
  for (const [collection, count] of Object.entries(stats)) {
    if (count > 0) {
      console.log(`   ${collection}: ${count} ${dryRun ? 'sẽ bị xóa' : 'đã xóa'}`);
      total += count;
    }
  }

  console.log('\n' + '='.repeat(80));
  console.log(`   TỔNG CỘNG: ${total} documents ${dryRun ? 'sẽ bị xóa' : 'đã xóa'}`);
  console.log('='.repeat(80) + '\n');
};

// Main function
const main = async () => {
  await connectDB();
  
  console.log('⚠️  CẢNH BÁO: Script này sẽ xóa dữ liệu orphaned (dữ liệu tham chiếu không hợp lệ)\n');
  
  // Chạy dry run trước
  console.log('Bước 1: Chạy kiểm tra (Dry Run)...\n');
  const dryRunStats = await cleanupOrphanedData(true);
  printResults(dryRunStats, true);
  
  // Hỏi user có muốn xóa thực tế không
  const answer = await question('Bạn có muốn XÓA THỰC TẾ các dữ liệu này không? (yes/no): ');
  
  if (answer.toLowerCase() === 'yes') {
    console.log('\n⚠️  Bắt đầu xóa dữ liệu thực tế...\n');
    const actualStats = await cleanupOrphanedData(false);
    printResults(actualStats, false);
    console.log('✅ Hoàn thành việc dọn dẹp dữ liệu!');
  } else {
    console.log('\n❌ Đã hủy thao tác xóa. Không có dữ liệu nào bị xóa.');
  }
  
  rl.close();
  await mongoose.connection.close();
  console.log('\n✅ Đã đóng kết nối MongoDB');
  process.exit(0);
};

main();
