import mongoose from 'mongoose';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

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

// Kiểm tra tính toàn vẹn dữ liệu
const checkDataIntegrity = async () => {
  const issues = {
    candidateProfiles: [],
    recruiterProfiles: [],
    jobs: [],
    applications: [],
    savedJobs: [],
    searchHistory: [],
    notifications: [],
    chatMessages: [],
    conversations: []
  };

  console.log('🔍 Bắt đầu kiểm tra tính toàn vẹn dữ liệu...\n');

  try {
    // 1. Kiểm tra CandidateProfile.userId
    console.log('📋 Kiểm tra CandidateProfile...');
    const candidateProfiles = await CandidateProfile.find({}).lean();
    for (const profile of candidateProfiles) {
      const userExists = await User.findById(profile.userId);
      if (!userExists) {
        issues.candidateProfiles.push({
          _id: profile._id,
          userId: profile.userId,
          fullname: profile.fullname,
          issue: 'userId không tồn tại trong collection User'
        });
      }
    }
    console.log(`   ✓ Đã kiểm tra ${candidateProfiles.length} CandidateProfile`);
    console.log(`   ⚠️  Tìm thấy ${issues.candidateProfiles.length} vấn đề\n`);

    // 2. Kiểm tra RecruiterProfile.userId
    console.log('📋 Kiểm tra RecruiterProfile...');
    const recruiterProfiles = await RecruiterProfile.find({}).lean();
    for (const profile of recruiterProfiles) {
      const userExists = await User.findById(profile.userId);
      if (!userExists) {
        issues.recruiterProfiles.push({
          _id: profile._id,
          userId: profile.userId,
          fullname: profile.fullname,
          companyName: profile.company?.name,
          issue: 'userId không tồn tại trong collection User'
        });
      }
    }
    console.log(`   ✓ Đã kiểm tra ${recruiterProfiles.length} RecruiterProfile`);
    console.log(`   ⚠️  Tìm thấy ${issues.recruiterProfiles.length} vấn đề\n`);

    // 3. Kiểm tra Job.recruiterProfileId
    console.log('📋 Kiểm tra Job...');
    const jobs = await Job.find({}).lean();
    for (const job of jobs) {
      const recruiterExists = await RecruiterProfile.findById(job.recruiterProfileId);
      if (!recruiterExists) {
        issues.jobs.push({
          _id: job._id,
          title: job.title,
          recruiterProfileId: job.recruiterProfileId,
          issue: 'recruiterProfileId không tồn tại trong collection RecruiterProfile'
        });
      }
    }
    console.log(`   ✓ Đã kiểm tra ${jobs.length} Job`);
    console.log(`   ⚠️  Tìm thấy ${issues.jobs.length} vấn đề\n`);

    // 4. Kiểm tra Application
    console.log('📋 Kiểm tra Application...');
    const applications = await Application.find({}).lean();
    for (const app of applications) {
      const jobExists = await Job.findById(app.jobId);
      const candidateExists = await CandidateProfile.findById(app.candidateProfileId);
      
      if (!jobExists) {
        issues.applications.push({
          _id: app._id,
          jobId: app.jobId,
          candidateProfileId: app.candidateProfileId,
          issue: 'jobId không tồn tại trong collection Job'
        });
      }
      if (!candidateExists) {
        issues.applications.push({
          _id: app._id,
          jobId: app.jobId,
          candidateProfileId: app.candidateProfileId,
          issue: 'candidateProfileId không tồn tại trong collection CandidateProfile'
        });
      }
    }
    console.log(`   ✓ Đã kiểm tra ${applications.length} Application`);
    console.log(`   ⚠️  Tìm thấy ${issues.applications.length} vấn đề\n`);

    // 5. Kiểm tra SavedJob
    console.log('📋 Kiểm tra SavedJob...');
    const savedJobs = await SavedJob.find({}).lean();
    for (const saved of savedJobs) {
      const userExists = await User.findById(saved.candidateId);
      const jobExists = await Job.findById(saved.jobId);
      
      if (!userExists) {
        issues.savedJobs.push({
          _id: saved._id,
          candidateId: saved.candidateId,
          jobId: saved.jobId,
          issue: 'candidateId không tồn tại trong collection User'
        });
      }
      if (!jobExists) {
        issues.savedJobs.push({
          _id: saved._id,
          candidateId: saved.candidateId,
          jobId: saved.jobId,
          issue: 'jobId không tồn tại trong collection Job'
        });
      }
    }
    console.log(`   ✓ Đã kiểm tra ${savedJobs.length} SavedJob`);
    console.log(`   ⚠️  Tìm thấy ${issues.savedJobs.length} vấn đề\n`);

    // 6. Kiểm tra SearchHistory
    console.log('📋 Kiểm tra SearchHistory...');
    const searchHistory = await SearchHistory.find({}).lean();
    for (const search of searchHistory) {
      const userExists = await User.findById(search.userId);
      if (!userExists) {
        issues.searchHistory.push({
          _id: search._id,
          userId: search.userId,
          query: search.query,
          issue: 'userId không tồn tại trong collection User'
        });
      }
    }
    console.log(`   ✓ Đã kiểm tra ${searchHistory.length} SearchHistory`);
    console.log(`   ⚠️  Tìm thấy ${issues.searchHistory.length} vấn đề\n`);

    // 7. Kiểm tra Notification
    console.log('📋 Kiểm tra Notification...');
    const notifications = await Notification.find({}).lean();
    for (const notif of notifications) {
      const userExists = await User.findById(notif.userId);
      if (!userExists) {
        issues.notifications.push({
          _id: notif._id,
          userId: notif.userId,
          type: notif.type,
          title: notif.title,
          issue: 'userId không tồn tại trong collection User'
        });
      }
    }
    console.log(`   ✓ Đã kiểm tra ${notifications.length} Notification`);
    console.log(`   ⚠️  Tìm thấy ${issues.notifications.length} vấn đề\n`);

    // 8. Kiểm tra ChatMessage
    console.log('📋 Kiểm tra ChatMessage...');
    const chatMessages = await ChatMessage.find({}).lean();
    for (const msg of chatMessages) {
      const senderExists = await User.findById(msg.senderId);
      const recipientExists = await User.findById(msg.recipientId);
      const conversationExists = await Conversation.findById(msg.conversationId);
      
      if (!senderExists) {
        issues.chatMessages.push({
          _id: msg._id,
          senderId: msg.senderId,
          recipientId: msg.recipientId,
          issue: 'senderId không tồn tại trong collection User'
        });
      }
      if (!recipientExists) {
        issues.chatMessages.push({
          _id: msg._id,
          senderId: msg.senderId,
          recipientId: msg.recipientId,
          issue: 'recipientId không tồn tại trong collection User'
        });
      }
      if (!conversationExists) {
        issues.chatMessages.push({
          _id: msg._id,
          conversationId: msg.conversationId,
          issue: 'conversationId không tồn tại trong collection Conversation'
        });
      }
    }
    console.log(`   ✓ Đã kiểm tra ${chatMessages.length} ChatMessage`);
    console.log(`   ⚠️  Tìm thấy ${issues.chatMessages.length} vấn đề\n`);

    // 9. Kiểm tra Conversation
    console.log('📋 Kiểm tra Conversation...');
    const conversations = await Conversation.find({}).lean();
    for (const conv of conversations) {
      const participant1Exists = await User.findById(conv.participant1);
      const participant2Exists = await User.findById(conv.participant2);
      
      if (!participant1Exists) {
        issues.conversations.push({
          _id: conv._id,
          participant1: conv.participant1,
          participant2: conv.participant2,
          issue: 'participant1 không tồn tại trong collection User'
        });
      }
      if (!participant2Exists) {
        issues.conversations.push({
          _id: conv._id,
          participant1: conv.participant1,
          participant2: conv.participant2,
          issue: 'participant2 không tồn tại trong collection User'
        });
      }
    }
    console.log(`   ✓ Đã kiểm tra ${conversations.length} Conversation`);
    console.log(`   ⚠️  Tìm thấy ${issues.conversations.length} vấn đề\n`);

  } catch (error) {
    console.error('❌ Lỗi khi kiểm tra:', error);
  }

  return issues;
};

// In kết quả
const printResults = (issues) => {
  console.log('\n' + '='.repeat(80));
  console.log('📊 KẾT QUẢ KIỂM TRA TÍNH TOÀN VẸN DỮ LIỆU');
  console.log('='.repeat(80) + '\n');

  let totalIssues = 0;

  for (const [collection, problems] of Object.entries(issues)) {
    totalIssues += problems.length;
    
    if (problems.length > 0) {
      console.log(`\n❌ ${collection.toUpperCase()} - Tìm thấy ${problems.length} vấn đề:`);
      console.log('-'.repeat(80));
      
      problems.forEach((problem, index) => {
        console.log(`\n${index + 1}. Document ID: ${problem._id}`);
        console.log(`   Vấn đề: ${problem.issue}`);
        delete problem._id;
        delete problem.issue;
        console.log(`   Chi tiết:`, JSON.stringify(problem, null, 2));
      });
    }
  }

  console.log('\n' + '='.repeat(80));
  if (totalIssues === 0) {
    console.log('✅ HOÀN HẢO! Không tìm thấy vấn đề nào về tính toàn vẹn dữ liệu.');
  } else {
    console.log(`⚠️  TỔNG CỘNG: ${totalIssues} vấn đề cần được xử lý.`);
  }
  console.log('='.repeat(80) + '\n');
};

// Main function
const main = async () => {
  await connectDB();
  
  const issues = await checkDataIntegrity();
  printResults(issues);
  
  await mongoose.connection.close();
  console.log('✅ Đã đóng kết nối MongoDB');
  process.exit(0);
};

main();
