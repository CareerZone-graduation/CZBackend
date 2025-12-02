// src/cron/jobAlert.cron.js
import cron from 'node-cron';
import logger from '../utils/logger.js';
import PendingNotification from '../models/PendingNotification.js';
import JobAlertSubscription from '../models/JobAlertSubscription.js';
import Job from '../models/Job.js';
import User from '../models/User.js';
import { publishNotification } from '../services/queue.service.js';
import { ROUTING_KEYS } from '../queues/rabbitmq.js';
import NotificationTemplateService from '../services/notificationTemplate.service.js';

/**
 * Process periodic notifications for a specific frequency
 * @param {string} frequency - 'daily' or 'weekly'
 * @param {string} notificationType - 'DAILY' or 'WEEKLY'
 */
const processPeriodicNotifications = async (frequency, notificationType) => {
    logger.info(`Starting ${frequency} notification processing...`);

    try {
        // Get active subscriptions for the specified frequency
        const subscriptions = await JobAlertSubscription.find({
            frequency: frequency,
            active: true
        }).populate('candidateId', 'fullName email').lean();

        logger.info(`Found ${subscriptions.length} active ${frequency} subscriptions`);

        if (subscriptions.length === 0) {
            logger.info(`No active ${frequency} subscriptions to process`);
            return;
        }

        // Group pending notifications by user and subscription
        const pendingNotification = await PendingNotification.aggregate([
            {
                $lookup: {
                    from: 'jobalertsubscriptions',
                    localField: 'subscriptionId',
                    foreignField: '_id',
                    as: 'subscription'
                }
            },
            {
                $unwind: '$subscription'
            },
            {
                $match: {
                    'subscription.frequency': frequency,
                    'subscription.active': true
                }
            },
            {
                $group: {
                    _id: {
                        userId: '$userId',
                        subscriptionId: '$subscriptionId'
                    },
                    jobIds: { $addToSet: '$jobId' },
                    subscription: { $first: '$subscription' }
                }
            }
        ]);

        logger.info(`Found ${pendingNotification.length} user-subscription pairs with pending notifications`);

        let processedCount = 0;
        let errorCount = 0;
        const errors = [];

        // Process each user-subscription pair
        for (const userNotification of pendingNotification) {
            try {
                const { userId, subscriptionId } = userNotification._id;
                const { jobIds, subscription } = userNotification;

                // Get user details
                const user = await User.findById(userId).select('email').lean();
                if (!user) {
                    logger.warn(`User ${userId} not found, skipping notification`);
                    continue;
                }

                // Get job details
                const jobs = await Job.find({ _id: { $in: jobIds } })
                    .populate('recruiterProfileId', 'company.name company.logo')
                    .limit(20) // Limit to prevent email overload
                    .lean();

                if (jobs.length === 0) {
                    logger.warn(`No jobs found for user ${userId}, subscription ${subscriptionId}`);
                    continue;
                }

                // Publish to notification queue with all necessary data
                await publishNotification(
                    frequency === 'daily' ? ROUTING_KEYS.JOB_ALERT_DAILY : ROUTING_KEYS.JOB_ALERT_WEEKLY,
                    {
                        type: 'JOB_ALERT',
                        recipientId: userId.toString(),
                        data: {
                            userId: userId.toString(),
                            subscriptionId: subscriptionId.toString(),
                            jobIds: jobs.map(job => job._id.toString()),
                            notificationType: notificationType,
                            deliveryMethod: subscription.notificationMethod,
                            keyword: subscription.keyword
                        }
                    }
                );

                // Update subscription's last notification sent time
                await JobAlertSubscription.findByIdAndUpdate(subscriptionId, {
                    lastNotificationSent: new Date()
                });

                processedCount++;
                logger.info(`Processed ${frequency} notification for user ${userId}, subscription ${subscriptionId} with ${jobs.length} jobs`);

            } catch (error) {
                errorCount++;
                const errorInfo = {
                    error: error.message,
                    stack: error.stack,
                    userId: userNotification._id.userId,
                    subscriptionId: userNotification._id.subscriptionId,
                    timestamp: new Date().toISOString()
                };

                errors.push(errorInfo);
                logger.error(`Error processing ${frequency} notification for user ${userNotification._id.userId}:`, errorInfo);
            }
        }

        // Clean up processed pending notifications
        const processedSubscriptionIds = pendingNotification.map(un => un._id.subscriptionId);
        if (processedSubscriptionIds.length > 0) {
            await PendingNotification.deleteMany({
                subscriptionId: { $in: processedSubscriptionIds }
            });
            logger.info(`Cleaned up pending notifications for ${processedSubscriptionIds.length} subscriptions`);
        }

    } catch (error) {
        logger.error(`Critical error during ${frequency} notification processing:`, {
            error: error.message,
            stack: error.stack
        });
        throw error;
    }
};


// Daily notification cron job - 8:00 AM
// tạm thời chạy mỗi 10s để test
// cron.schedule('*/10 * * * * *', async () => {
cron.schedule('0 8 * * *', async () => {
    try {
        await processPeriodicNotifications('daily', 'DAILY');
    } catch (error) {
        logger.error('Daily notification cron job failed:', {
            error: error.message,
            stack: error.stack,
            timestamp: new Date().toISOString()
        });
    }
}, {
    scheduled: true,
    timezone: "Asia/Ho_Chi_Minh",
    name: 'daily-notifications'
});

// Weekly notification cron job - Monday 8:00 AM
cron.schedule('0 8 * * 1', async () => {
    try {
        await processPeriodicNotifications('weekly', 'WEEKLY');
    } catch (error) {
        logger.error('Weekly notification cron job failed:', {
            error: error.message,
            stack: error.stack,
            timestamp: new Date().toISOString()
        });
    }
}, {
    scheduled: true,
    timezone: "Asia/Ho_Chi_Minh",
    name: 'weekly-notifications'
});

logger.info('Job alert cron jobs initialized:', {
    dailyNotifications: '8:00 AM daily',
    weeklyNotifications: '8:00 AM Monday',
    cleanup: '2:00 AM daily',
    healthMonitoring: 'Every 30 minutes',
    timezone: 'Asia/Ho_Chi_Minh'
});
