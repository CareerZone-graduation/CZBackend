// src/cron/jobAlert.cron.js
import cron from 'node-cron';
import logger from '../utils/logger.js';
// import JobAlertSubscription from '../models/JobAlertSubscription.js'; // Giả định model này tồn tại
import { publishNotification } from '../services/queue.service.js';
import { ROUTING_KEYS } from '../queues/rabbitmq.js';

// Chạy hàng ngày vào lúc 8 giờ sáng
cron.schedule('0 8 * * *', async () => {
  logger.info('Running daily job alert cron job...');
  try {
    // Logic để tìm các job mới phù hợp với các đăng ký của người dùng
    // và publish vào queue với ROUTING_KEYS.DAILY_DIGEST
    // Ví dụ:
    // const subscriptions = await JobAlertSubscription.find({ isActive: true });
    // for (const sub of subscriptions) {
    //   const newJobs = await findMatchingJobs(sub.criteria);
    //   if (newJobs.length > 0) {
    //     await publishNotification(ROUTING_KEYS.DAILY_DIGEST, {
    //       type: 'DAILY_JOB_ALERT',
    //       recipientId: sub.userId.toString(),
    //       data: {
    //         jobs: newJobs,
    //       },
    //     });
    //   }
    // }
    logger.info('Daily job alert cron job completed.');
  } catch (error) {
    logger.error('Error during daily job alert cron job', error);
  }
}, { scheduled: true, timezone: "Asia/Ho_Chi_Minh" });
