import cron from 'node-cron';
import { cleanupExpiredVerificationTokens } from '../utils/emailVerificationCleanup.js';
import logger from '../utils/logger.js';

/**
 * Cron job để dọn dẹp email verification tokens hết hạn
 * Chạy mỗi ngày lúc 2:00 AM
 */

// Chạy mỗi ngày lúc 2:00 AM
cron.schedule('0 2 * * *', async () => {
  try {
    logger.info('Starting email verification tokens cleanup...');
    const cleanedCount = await cleanupExpiredVerificationTokens();
    logger.info(`Email verification cleanup completed. Cleaned ${cleanedCount} expired tokens.`);
  } catch (error) {
    logger.error('Email verification cleanup failed:', error);
  }
}, {
  timezone: 'Asia/Ho_Chi_Minh'
});

logger.info('Email verification cleanup cron job scheduled (daily at 2:00 AM)');