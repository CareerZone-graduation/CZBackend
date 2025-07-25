// workers/matching.worker.js
import path from 'path';
import dotenv from 'dotenv';
dotenv.config({ path: path.resolve(process.cwd(), '.env') });

import connectDB from '../src/utils/connectDB.js';
import logger from '../src/utils/logger.js';
import kafka from '../src/config/kafka.js';
import redisClient from '../src/config/redis.js';
import mongoose from 'mongoose';
import JobAlertSubscription from '../src/models/JobAlertSubscription.js';
import PendingNotification from '../src/models/PendingNotification.js';

const getKeywordRedisKey = (keyword) => `job_alert:keyword:${keyword.toLowerCase().trim()}`;

const matchJobWithSubscription = (job, subscription) => {
    // Helper function để so khớp chi tiết
    const salaryMatch = (subRange) => {
        if (!subRange || subRange === 'ALL') return true;
        const min = job.minSalary || 0;
        const max = job.maxSalary || Infinity;
        const ranges = {
            'UNDER_10M': max < 10000000,
            '10M_20M': min >= 10000000 && max <= 20000000,
            '20M_30M': min >= 20000000 && max <= 30000000,
            'OVER_30M': min > 30000000,
        };
        return ranges[subRange] || false;
    };
    
    return (
        (subscription.location.city === job.location.city) &&
        (subscription.type === 'ALL' || subscription.type === job.type) &&
        (subscription.workType === 'ALL' || subscription.workType === job.workType) &&
        (subscription.experience === 'ALL' || subscription.experience === job.experience) &&
        salaryMatch(subscription.salaryRange)
    );
};

async function startMatchingWorker() {
    await connectDB();
    const consumer = kafka.consumer({
        groupId: 'matching-group',
        // // Cấu hình để giảm độ trễ, tăng tính realtime
        // maxWaitTimeInMs: 100, // Giảm thời gian chờ tối đa của broker
        // minBytes: 1, // Lấy message ngay cả khi chỉ có 1 byte
    });
    

    try {
        await consumer.connect();
        await consumer.subscribe({ topic: 'job-events', fromBeginning: false });
        logger.info('Matching worker started. Waiting for job events...');

        await consumer.run({
            eachMessage: async ({ message }) => {
                const event = JSON.parse(message.value.toString());
                if (event.eventType !== 'JOB_CREATED') return;

                const job = event.payload;
                const jobKeywords = [
                    ...job.title.toLowerCase().split(' '),
                    ...(job.skills || []).map(s => s.toLowerCase())
                ].filter((value, index, self) => self.indexOf(value) === index); // Remove duplicates
                const redisKeys = jobKeywords.map(getKeywordRedisKey);
                logger.info(`Using Redis keys: ${redisKeys.join(', ')}`);
                if (redisKeys.length === 0) return;

                const matchedUserIds = await redisClient.sUnion(redisKeys);
                logger.info(`Matched ${matchedUserIds.length} users for job ${job.jobId} with keywords: ${jobKeywords.join(', ')}`);
                if (matchedUserIds.length === 0) return;

                const allSubscriptions = await JobAlertSubscription.find({
                    candidateId: { $in: matchedUserIds },
                    active: true
                }).lean();
                logger.info(`Found ${allSubscriptions.length} active subscriptions for matched users.`);

                const subsByUser = allSubscriptions.reduce((acc, sub) => {
                    const userId = sub.candidateId.toString();
                    if (!acc[userId]) acc[userId] = [];
                    acc[userId].push(sub);
                    return acc;
                }, {});

                const pendingNotifications = [];
                for (const userId of matchedUserIds) {
                    const userSubscriptions = subsByUser[userId];
                    if (!userSubscriptions) continue;
                    logger.info(`Processing ${userSubscriptions.length} subscriptions for user ${userId}.`);

                    for (const subscription of userSubscriptions) {
                        const keywordInJob = job.title.toLowerCase().includes(subscription.keyword.toLowerCase());

                        if (keywordInJob && matchJobWithSubscription(job, subscription)) {
                            pendingNotifications.push({
                                userId,
                                jobId: job.jobId,
                                subscriptionId: subscription._id,
                            });
                        }
                    }
                }
                
                if (pendingNotifications.length > 0) {
                    await PendingNotification.insertMany(pendingNotifications, { ordered: false }).catch(err => {
                        if (err.code !== 11000) logger.error('Error inserting pending notifications', err);
                    });
                    logger.info(`Inserted ${pendingNotifications.length} pending notifications for job ${job.jobId}.`);
                }
            }
        });
    } catch (error) {
        logger.error('Error in matching worker:', error);
        process.exit(1);
    }
}

startMatchingWorker();
