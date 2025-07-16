// src/cron/interviewReminder.cron.js
import cron from 'node-cron';
import logger from '../utils/logger.js';
import InterviewRoom from '../models/InterviewRoom.js';
import * as queueService from '../services/queue.service.js';
import * as rabbitmq from '../queues/rabbitmq.js';

// Chạy mỗi 5 phút để kiểm tra
cron.schedule('*/999 * * * *', async () => {
  //TODO: 
  logger.info('Running interview reminder cron job...');
  try {
    const now = new Date();
    // Nhắc các lịch phỏng vấn sẽ diễn ra trong 30-35 phút tới
    const reminderWindowStart = new Date(now.getTime() + 30 * 60 * 1000);
    const reminderWindowEnd = new Date(now.getTime() + 35 * 60 * 1000);

    const interviewsToRemind = await InterviewRoom.find({
      status: 'SCHEDULED',
      isReminderSent: false,
      scheduledTime: { $gte: reminderWindowStart, $lt: reminderWindowEnd },
    });

    if (interviewsToRemind.length === 0) return;

    logger.info(`Found ${interviewsToRemind.length} interviews to remind.`);

    for (const interview of interviewsToRemind) {
      await queueService.publishNotification(rabbitmq.ROUTING_KEYS.INTERVIEW_REMINDER, {
        type: 'INTERVIEW_REMINDER',
        recipientId: interview.candidateId.toString(),
        data: {
          interviewId: interview._id.toString(),
          roomName: interview.roomName,
          scheduledTime: interview.scheduledTime,
        },
      });

      interview.isReminderSent = true;
      await interview.save();
    }
  } catch (error) {
    logger.error('Error during interview reminder cron job', error);
  }
}, { scheduled: true, timezone: "Asia/Ho_Chi_Minh" });
