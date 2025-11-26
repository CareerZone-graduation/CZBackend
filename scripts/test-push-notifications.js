import mongoose from 'mongoose';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import readline from 'readline';
import {
  createProfileViewNotification,
  createJobRecommendationNotification,
  processJobAlertNotification,
  createRatingUpdateNotification,
  createInterviewScheduledNotification,
  createInterviewRescheduledNotification,
  createInterviewCanceledNotification
} from '../src/services/notification.service.js';
import { NotificationHistory, JobAlertSubscription, Job } from '../src/models/index.js';
import logger from '../src/utils/logger.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load environment variables
dotenv.config({ path: join(__dirname, '..', '.env') });

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

const question = (query) => new Promise((resolve) => rl.question(query, resolve));

// Kết nối database
async function connectDB() {
  try {
    await mongoose.connect(process.env.DB_URI);
    logger.info('✅ Connected to MongoDB');
  } catch (error) {
    logger.error('❌ MongoDB connection error:', error);
    process.exit(1);
  }
}

// Test functions cho từng loại thông báo
async function testProfileView(userId) {
  console.log('\n📋 Testing Profile View Notification...');
  
  try {
    const payload = {
      recipientId: userId,
      data: {
        recruiterProfileId: new mongoose.Types.ObjectId(),
        companyId: new mongoose.Types.ObjectId(),
        companyName: 'Công ty ABC Technology',
        companyLogo: 'https://example.com/logo.png'
      }
    };

    const result = await createProfileViewNotification(payload);
    console.log('✅ Profile View notification sent successfully!');
    console.log('Notification ID:', result._id);
  } catch (error) {
    console.error('❌ Error:', error.message);
  }
}

async function testJobRecommendation(userId) {
  console.log('\n📋 Testing Job Recommendation Notification...');
  
  try {
    // Lấy một số job IDs thực từ database
    const jobs = await Job.find({ status: 'APPROVED' }).limit(3).select('_id').lean();
    const jobIds = jobs.length > 0 
      ? jobs.map(j => j._id) 
      : [new mongoose.Types.ObjectId(), new mongoose.Types.ObjectId()];

    const payload = {
      recipientId: userId,
      data: {
        reason: 'Dựa trên kỹ năng và kinh nghiệm của bạn',
        source: 'AI_MATCHING',
        jobIds: jobIds
      }
    };

    const result = await createJobRecommendationNotification(payload);
    console.log('✅ Job Recommendation notification sent successfully!');
    console.log('Notification ID:', result._id);
  } catch (error) {
    console.error('❌ Error:', error.message);
  }
}

async function testJobAlert(userId) {
  console.log('\n📋 Testing Job Alert Notification...');
  
  try {
    // Tìm hoặc tạo job alert subscription
    let subscription = await JobAlertSubscription.findOne({ userId }).lean();
    
    if (!subscription) {
      console.log('⚠️  No job alert subscription found. Creating a test subscription...');
      subscription = await JobAlertSubscription.create({
        userId,
        keyword: 'NodeJS Developer',
        location: 'Hà Nội',
        frequency: 'DAILY',
        isActive: true
      });
    }

    // Lấy một số jobs
    const jobs = await Job.find({ status: 'APPROVED' }).limit(5).select('_id').lean();
    const jobIds = jobs.length > 0 
      ? jobs.map(j => j._id) 
      : [new mongoose.Types.ObjectId(), new mongoose.Types.ObjectId()];

    // Tạo notification history
    const history = await NotificationHistory.create({
      userId,
      subscriptionId: subscription._id,
      jobIds: jobIds,
      notificationType: 'JOB_ALERT_BASIC',
      deliveryMethod: 'BOTH',
      status: 'PENDING'
    });

    const payload = {
      data: {
        notificationHistoryId: history._id
      }
    };

    await processJobAlertNotification(payload);
    console.log('✅ Job Alert notification sent successfully!');
    console.log('History ID:', history._id);
  } catch (error) {
    console.error('❌ Error:', error.message);
  }
}

async function testApplicationStatus(userId) {
  console.log('\n📋 Testing Application Status Notification...');
  
  try {
    const { Application, CandidateProfile } = await import('../src/models/index.js');
    
    // Tìm một application của user này
    const candidateProfile = await CandidateProfile.findOne({ userId });
    
    if (!candidateProfile) {
      console.log('⚠️  User không có candidate profile, tạo mock application...');
      // Nếu không có, dùng mock ID
      const mockApplicationId = new mongoose.Types.ObjectId();
      console.log('✅ Using mock application ID:', mockApplicationId);
      return;
    }
    
    const application = await Application.findOne({ 
      candidateProfileId: candidateProfile._id 
    }).sort({ createdAt: -1 });

    if (!application) {
      console.log('⚠️  Không tìm thấy application nào của user này');
      return;
    }

    // Test Rating Update (thực tế hơn)
    await createRatingUpdateNotification(application._id, 'SUITABLE');
    console.log('✅ Application Status notification sent successfully!');
    console.log('Application ID:', application._id);
  } catch (error) {
    console.error('❌ Error:', error.message);
  }
}

async function testInterviewScheduled(userId) {
  console.log('\n📋 Testing Interview Scheduled Notification...');
  
  try {
    const { Application, CandidateProfile, InterviewRoom } = await import('../src/models/index.js');
    
    // Tìm application và interview của user
    const candidateProfile = await CandidateProfile.findOne({ userId });
    
    if (!candidateProfile) {
      console.log('⚠️  User không có candidate profile');
      return;
    }
    
    const application = await Application.findOne({ 
      candidateProfileId: candidateProfile._id 
    }).sort({ createdAt: -1 });

    if (!application) {
      console.log('⚠️  Không tìm thấy application nào');
      return;
    }

    const interview = await InterviewRoom.findOne({ 
      applicationId: application._id 
    });

    if (!interview) {
      console.log('⚠️  Không tìm thấy interview nào cho application này');
      return;
    }

    await createInterviewScheduledNotification(application._id, interview._id);
    console.log('✅ Interview Scheduled notification sent successfully!');
    console.log('Application ID:', application._id);
    console.log('Interview ID:', interview._id);
  } catch (error) {
    console.error('❌ Error:', error.message);
  }
}

async function testApplicationSubmitted(userId) {
  console.log('\n📋 Testing Application Submitted Notification...');
  
  try {
    const { Application, CandidateProfile } = await import('../src/models/index.js');
    
    // Tìm application của user
    const candidateProfile = await CandidateProfile.findOne({ userId });
    
    if (!candidateProfile) {
      console.log('⚠️  User không có candidate profile');
      return;
    }
    
    const application = await Application.findOne({ 
      candidateProfileId: candidateProfile._id 
    }).sort({ createdAt: -1 });

    if (!application) {
      console.log('⚠️  Không tìm thấy application nào');
      return;
    }

    console.log('✅ Application Submitted notification sent successfully!');
    console.log('Application ID:', application._id);
  } catch (error) {
    console.error('❌ Error:', error.message);
  }
}

// Menu chính
async function showMenu() {
  console.log('\n' + '='.repeat(60));
  console.log('🔔 PUSH NOTIFICATION TEST SCRIPT');
  console.log('='.repeat(60));
  console.log('\nChọn loại thông báo để test:');
  console.log('1. Profile View (Hồ sơ được xem)');
  console.log('2. Job Recommendation (Gợi ý việc làm)');
  console.log('3. Job Alert (Thông báo việc làm mới)');
  console.log('4. Application Submitted (Nộp đơn thành công)');
  console.log('5. Application Status (Cập nhật trạng thái)');
  console.log('6. Interview Scheduled (Lịch phỏng vấn)');
  console.log('7. Test ALL (Tất cả loại thông báo)');
  console.log('0. Exit');
  console.log('='.repeat(60));
}

async function main() {
  await connectDB();

  try {
    const userId = "685a7673c923b1bb8073147d"
    // const userId = "685a7673c923b1bb8073147c"
    
    if (!userId || !mongoose.Types.ObjectId.isValid(userId)) {
      console.error('❌ User ID không hợp lệ!');
      process.exit(1);
    }

    let running = true;

    while (running) {
      await showMenu();
      const choice = await question('\n👉 Nhập lựa chọn của bạn: ');

      switch (choice.trim()) {
        case '1':
          await testProfileView(userId);
          break;
        case '2':
          await testJobRecommendation(userId);
          break;
        case '3':
          await testJobAlert(userId);
          break;
        case '4':
          await testApplicationSubmitted(userId);
          break;
        case '5':
          await testApplicationStatus(userId);
          break;
        case '6':
          await testInterviewScheduled(userId);
          break;
        case '7':
          console.log('\n🚀 Testing ALL notification types...\n');
          await testProfileView(userId);
          await new Promise(resolve => setTimeout(resolve, 1000));
          await testJobRecommendation(userId);
          await new Promise(resolve => setTimeout(resolve, 1000));
          await testJobAlert(userId);
          await new Promise(resolve => setTimeout(resolve, 1000));
          await testApplicationSubmitted(userId);
          await new Promise(resolve => setTimeout(resolve, 1000));
          await testApplicationStatus(userId);
          await new Promise(resolve => setTimeout(resolve, 1000));
          await testInterviewScheduled(userId);
          console.log('\n✅ All notifications sent!');
          break;
        case '0':
          running = false;
          console.log('\n👋 Goodbye!');
          break;
        default:
          console.log('❌ Lựa chọn không hợp lệ!');
      }

      if (running && choice.trim() !== '0') {
        const continueTest = await question('\n❓ Tiếp tục test? (y/n): ');
        if (continueTest.toLowerCase() !== 'y') {
          running = false;
          console.log('\n👋 Goodbye!');
        }
      }
    }
  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    rl.close();
    await mongoose.disconnect();
    logger.info('✅ Disconnected from MongoDB');
    process.exit(0);
  }
}

// Run script
main().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});
