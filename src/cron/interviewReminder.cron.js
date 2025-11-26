// src/cron/interviewReminder.cron.js
import cron from 'node-cron';
import logger from '../utils/logger.js';
import { sendInterviewReminders } from '../services/interview.service.js';

// Chạy mỗi 1 phút để kiểm tra
cron.schedule('*/1 * * * *', async () => {
  //TODO: 
  logger.info('Running interview reminder cron job...');
  await sendInterviewReminders();
}, { scheduled: true, timezone: "Asia/Ho_Chi_Minh" });
