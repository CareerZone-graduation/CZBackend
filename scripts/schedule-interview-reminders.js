// scripts/schedule-interview-reminders.js
import dotenv from 'dotenv';
import path from 'path';
import mongoose from 'mongoose';

// Load .env file
dotenv.config({ path: path.resolve(process.cwd(), '.env') });

import connectDB from '../src/utils/connectDB.js';
import { InterviewRoom } from '../src/models/index.js';
import * as queueService from '../src/services/queue.service.js';
import { ROUTING_KEYS } from '../src/queues/rabbitmq.js';
import logger from '../src/utils/logger.js';

const scheduleReminders = async () => {
  logger.info('Starting to schedule interview reminders...');
  await connectDB();

  try {
    const now = new Date();
    const twentyFourHoursLater = new Date(now.getTime() + 24 * 60 * 60 * 1000);
    const oneHourLater = new Date(now.getTime() + 1 * 60 * 60 * 1000); // Để tránh gửi quá sớm

    // Tìm các cuộc phỏng vấn:
    // - Sắp diễn ra trong khoảng từ 1 giờ đến 24 giờ tới.
    // - Chưa được gửi nhắc nhở (isReminderSent = false).
    // - Có trạng thái là SCHEDULED.
    const upcomingInterviews = await InterviewRoom.find({
      scheduledTime: {
        $gte: oneHourLater,
        $lte: twentyFourHoursLater,
      },
      status: 'SCHEDULED',
      isReminderSent: { $ne: true }, // Hoặc false hoặc không tồn tại
    }).lean();

    if (upcomingInterviews.length === 0) {
      logger.info('No upcoming interviews found that need a reminder.');
      return;
    }

    logger.info(`Found ${upcomingInterviews.length} interviews to remind.`);

    const reminderPromises = upcomingInterviews.map(interview => {
      logger.info(`Queueing reminder for interview: ${interview._id}`);
      
      // Gửi tác vụ vào queue
      return queueService.publishNotification(ROUTING_KEYS.INTERVIEW_REMINDER, {
        type: 'INTERVIEW_REMINDER',
        recipientId: interview.recruiterId, // Có thể không cần thiết vì handler sẽ tự lấy
        data: {
          interviewId: interview._id.toString(),
        },
      });
    });

    await Promise.all(reminderPromises);

    // Cập nhật cờ isReminderSent cho các cuộc phỏng vấn đã được gửi nhắc nhở
    const interviewIds = upcomingInterviews.map(i => i._id);
    await InterviewRoom.updateMany(
      { _id: { $in: interviewIds } },
      { $set: { isReminderSent: true } }
    );

    logger.info(`Successfully queued reminders for ${upcomingInterviews.length} interviews.`);

  } catch (error) {
    logger.error('Error during scheduling interview reminders:', error);
  } finally {
    await mongoose.disconnect();
    logger.info('Database connection closed.');
  }
};

scheduleReminders();
