import { de } from 'zod/v4/locales';
import { connectProducer, sendUserInteraction,sendJobEvent } from './src/services/kafka.service.js';
import mongoose from 'mongoose';

/**
 * File này dùng để kiểm tra việc gửi sự kiện hành vi người dùng đến Kafka.
 * 
 * CÁCH CHẠY:
 * 1. Đảm bảo Kafka đang chạy (nếu dùng Docker: `docker-compose up -d`).
 * 2. Chạy lệnh từ thư mục gốc của dự án: `node test-kafka-producer.js`
 * 
 * KẾT QUẢ MONG MUỐN:
 * - Log "Kafka Producer connected successfully."
 * - Log "Sent user interaction event to Kafka: ..." cho mỗi sự kiện.
 * - Bạn có thể dùng một Kafka consumer tool (như `kafkacat` hoặc một script consumer khác)
 *   để xác nhận các message đã thực sự được gửi đến topic 'user-interactions'.
 */
console.log('Script started at', new Date().toISOString());
const runTest = async () => {
  console.log('Attempting to connect Kafka producer...');
  await connectProducer();

  // --- Dữ liệu mẫu ---
  // Tạo các ObjectId giả để giống với dữ liệu thật từ MongoDB
  const mockUserId1 = new mongoose.Types.ObjectId().toString();
  const mockUserId2 = new mongoose.Types.ObjectId().toString();
  const mockJobId1 = new mongoose.Types.ObjectId().toString();
  const mockJobId2 = new mongoose.Types.ObjectId().toString();
  const mockJobId3 = new mongoose.Types.ObjectId().toString();

  // --- Các sự kiện mẫu ---
  const viewEvent = {
    eventType: 'VIEW_JOB',
    userId: mockUserId1,
    jobId: mockJobId1,
    timestamp: new Date().toISOString(),
    details: { weight: 1 }
  };
// sendJobEvent({
//     eventType: 'JOB_CREATED',
//     timestamp: new Date().toISOString(),
//     payload: {
//       jobId: newJob._id.toString(),
//       description: newJob.description,
//       requirements: newJob.requirements,
//       benefits: newJob.benefits,
//       title: newJob.title,
//       skills: newJob.skills,
//       category: newJob.category,
//       area: newJob.area,
//       minSalary: newJob.minSalary,
//       maxSalary: newJob.maxSalary,
//       companyName: recruiterProfile.company.name,
//       location: {
//         city: newJob.location.city,
//         district: newJob.location.district,
//         address: newJob.location.address
//       },
//       type: newJob.type,
//       workType: newJob.workType,
//       experience: newJob.experience,
//       deadline: newJob.deadline,
//     }
//   });

  const createJobEvent = {
    eventType: 'JOB_CREATED',
    timestamp: new Date().toISOString(),
    payload: {
      jobId: "686f90e0a027a310fec93b36",
      description: 'Mô tảiệc mẫuMô tả công việc mẫu',
      requirements: 'Yêu cầu công việc mẫu',
      benefits: 'Lợi ích công việc mẫu',
      title: 'Lập trình javascript',
      skills: ['JavaScript', 'Node.js'],
      category: 'IT',
      area: 'HO_CHI_MINH',
      minSalary: 10000000,
      maxSalary: 20000000,
      companyName: 'Công ty mẫu',
      location: {
        city: 'Hồ Chí Minh',
        district: 'Quận 1',
        address: '123 Đường ABC'
      },
      type: 'FULL_TIME',
      workType: 'ON_SITE',
      experience: '1-2 Năm',
      deadline: '2023-12-31'
    }
  };
  const saveEvent = {
    eventType: 'SAVE_JOB',
    userId: mockUserId1,
    jobId: mockJobId2,
    timestamp: new Date().toISOString(),
    details: { weight: 3 }
  };

  const applyEvent = {
    eventType: 'APPLY_JOB',
    userId: mockUserId2,
    jobId: mockJobId1, // User 2 ứng tuyển vào công việc User 1 đã xem
    timestamp: new Date().toISOString(),
    details: { weight: 5 }
  };
  
  const anotherViewEvent = {
    eventType: 'VIEW_JOB',
    userId: mockUserId2,
    jobId: mockJobId3,
    timestamp: new Date().toISOString(),
    details: { weight: 1 }
  };

  console.log('\nSending mock events to Kafka...');

  // Gửi các sự kiện
  // Dùng Promise.all để gửi song song và đợi tất cả hoàn thành
  await Promise.all([
    // sendUserInteraction(viewEvent),
    sendJobEvent(createJobEvent),
    // sendUserInteraction(saveEvent),
    // sendUserInteraction(applyEvent),
    // sendUserInteraction(anotherViewEvent)
  ]);

  console.log('\nFinished sending events.');
  
  // Đợi một chút để đảm bảo message được gửi đi trước khi thoát
  setTimeout(() => {
    console.log('Test script finished. Exiting.');
    process.exit(0);
  }, 2000); 
};

runTest().catch(error => {
  console.error('An error occurred during the test:', error);
  process.exit(1);
});
