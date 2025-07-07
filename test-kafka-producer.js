import { connectProducer, sendUserInteraction } from './src/services/kafka.service.js';
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
    sendUserInteraction(viewEvent),
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
