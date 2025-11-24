import cron from 'node-cron';
import logger from '../utils/logger.js';
import Job from '../models/Job.js';

/**
 * Cron job to update expired jobs status
 * Runs every hour at minute 0
 */
cron.schedule('0 * * * *', async () => {
    logger.info('Starting job expiration check...');
    try {
        const now = new Date();
        const result = await Job.updateMany(
            {
                status: 'ACTIVE',
                deadline: { $lt: now }
            },
            {
                $set: { status: 'EXPIRED' }
            }
        );

        if (result.modifiedCount > 0) {
            logger.info(`Updated ${result.modifiedCount} jobs to EXPIRED status.`);
        } else {
            logger.info('No expired jobs found.');
        }
    } catch (error) {
        logger.error('Error in job expiration cron job:', error);
    }
}, {
    scheduled: true,
    timezone: "Asia/Ho_Chi_Minh"
});

logger.info('Job expiration cron job initialized: Runs every hour');
