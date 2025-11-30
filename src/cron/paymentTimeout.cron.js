import cron from 'node-cron';
import logger from '../utils/logger.js';
import CoinRecharge from '../models/CoinRecharge.js';

/**
 * Cron job to update pending coin recharges to failed if they are older than 15 minutes
 * Runs every minute
 */
cron.schedule('* * * * *', async () => {
    logger.info('Starting payment timeout check...');
    try {
        const fifteenMinutesAgo = new Date(Date.now() - 15 * 60 * 1000);

        const result = await CoinRecharge.updateMany(
            {
                status: 'PENDING',
                createdAt: { $lt: fifteenMinutesAgo }
            },
            {
                $set: { status: 'FAILED' }
            }
        );

        if (result.modifiedCount > 0) {
            logger.info(`Updated ${result.modifiedCount} pending payments to FAILED status.`);
        }
    } catch (error) {
        logger.error('Error in payment timeout cron job:', error);
    }
}, {
    scheduled: true,
    timezone: "Asia/Ho_Chi_Minh"
});

logger.info('Payment timeout cron job initialized: Runs every minute');
