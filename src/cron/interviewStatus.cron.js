import cron from 'node-cron';
import logger from '../utils/logger.js';
import { autoStartScheduledInterviews, autoEndExpiredInterviews } from '../services/interview.service.js';

// Run every minute to check for interviews that need to be started
cron.schedule('* * * * *', async () => {
    try {
        // logger.info('Running interview auto-start cron job...');
        await autoStartScheduledInterviews();
        await autoEndExpiredInterviews();
    } catch (error) {
        logger.error('Error in interview auto-start cron job:', error);
    }
}, {
    scheduled: true,
    timezone: "Asia/Ho_Chi_Minh"
});
