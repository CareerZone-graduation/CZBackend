// workers/matching.worker.js
import path from 'path';
import dotenv from 'dotenv';
dotenv.config({ path: path.resolve(process.cwd(), '.env') });

import connectDB from '../src/utils/connectDB.js';
import logger from '../src/utils/logger.js';
import kafka from '../src/config/kafka.js';
import redisClient from '../src/config/redis.js';
import JobAlertSubscription from '../src/models/JobAlertSubscription.js';
import PendingNotification from '../src/models/PendingNotification.js';
import RedisKeys from '../src/utils/redisKeys.js';

const calculateJobRelevanceScore = async (job, subscription, userId) => {
    let baseScore = 0;
    
    // Keyword matching score (0-40 points)
    const keywordInTitle = job.title.toLowerCase().includes(subscription.keyword.toLowerCase());
    const keywordInSkills = job.skills?.some(skill => 
        skill.toLowerCase().includes(subscription.keyword.toLowerCase())
    );
    const keywordInDescription = job.description?.toLowerCase().includes(subscription.keyword.toLowerCase());
    
    if (keywordInTitle) baseScore += 20;
    if (keywordInSkills) baseScore += 15;
    if (keywordInDescription) baseScore += 5;
    
    // Filter matching score (0-30 points)
    if (matchJobWithSubscription(job, subscription)) {
        baseScore += 30;
    } else {
        return 0; // Job doesn't match basic filters
    }
    
    // Category exact match bonus (0-10 points)
    if (subscription.category !== 'ALL' && subscription.category === job.category) {
        baseScore += 10;
    }
    
    return Math.round(baseScore);
};

// Enhanced job matching with new subscription fields
const matchJobWithSubscription = (job, subscription) => {
    // Helper function để so khớp chi tiết
    const salaryMatch = (subRange) => {
        if (!subRange || subRange === 'ALL') return true;
        const min = parseFloat(job.minSalary?.toString() || '0');
        const max = parseFloat(job.maxSalary?.toString() || '999999999');
        const ranges = {
            'UNDER_10M': max < 10000000,
            '10M_20M': min >= 10000000 && max <= 20000000,
            '20M_30M': min >= 20000000 && max <= 30000000,
            'OVER_30M': min > 30000000,
        };
        return ranges[subRange] || false;
    };

    // Enhanced location matching with commune support
    const location = subscription.location;
    const provinceMatch = location.province === 'ALL' || location.province === job.location.province;
    const districtMatch = !location.district || location.district === 'ALL' || location.district === job.location.district;
    const communeMatch = !location.commune || location.commune === job.location.commune;
    
    // Enhanced category matching
    const categoryMatch = subscription.category === 'ALL' || subscription.category === job.category;
    
    return (
        provinceMatch &&
        districtMatch &&
        communeMatch &&
        categoryMatch &&
        (subscription.type === 'ALL' || subscription.type === job.type) &&
        (subscription.workType === 'ALL' || subscription.workType === job.workType) &&
        (subscription.experience === 'ALL' || subscription.experience === job.experience) &&
        salaryMatch(subscription.salaryRange)
    );
};

// Check for duplicate notifications to prevent spam
const isDuplicateNotification = async (userId, jobId) => {
    const duplicateKey = RedisKeys.getDuplicateJobKey(userId, jobId);
    const exists = await redisClient.exists(duplicateKey);
    return exists === 1;
};

// Mark job as sent to prevent duplicates
const markJobAsSent = async (userId, jobId) => {
    const duplicateKey = RedisKeys.getDuplicateJobKey(userId, jobId);
    // Set expiry to 7 days to prevent sending same job multiple times
    await redisClient.setEx(duplicateKey, 7 * 24 * 60 * 60, '1');
};

async function startMatchingWorker() {
    await connectDB();
    const consumer = kafka.consumer({
        groupId: 'matching-group',
        maxWaitTimeInMs: 100, // Reduced wait time for better real-time processing
        minBytes: 1, // Process messages immediately
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
                logger.info(`Processing job ${job.jobId}: ${job.title}`);

                // Extract keywords from job for matching
                const jobKeywords = [
                    ...job.title.toLowerCase().split(/\s+/),
                    ...(job.skills || []).map(s => s.toLowerCase()),
                    ...(job.description || '').toLowerCase().split(/\s+/).slice(0, 10) // First 10 words from description
                ].filter((keyword, index, self) => 
                    keyword.length > 2 && self.indexOf(keyword) === index // Remove duplicates and short words
                );

                // const redisKeys = jobKeywords.map(RedisKeys.getKeywordKey);
                const redisKeys = jobKeywords.map(x => RedisKeys.getKeywordKey(x)).filter(key => key);                
                if (redisKeys.length === 0) {
                    logger.info(`No valid keywords found for job ${job.jobId}`);
                    return;
                }

                // Get matched users from both regular and urgent keyword sets
                const matchedUserIds = await redisClient.sUnion(redisKeys)
                const allMatchedUserIds = [...new Set(matchedUserIds)];
                logger.info(`Matched ${allMatchedUserIds.length} users for job ${job.jobId}`);
                if (allMatchedUserIds.length === 0) return;
                // Get active subscriptions with enhanced fields
                const allSubscriptions = await JobAlertSubscription.find({
                    candidateId: { $in: allMatchedUserIds },
                    active: true
                }).lean();

                logger.info(`Found ${allSubscriptions.length} active subscriptions for matched users.`);

                // Group subscriptions by user for consolidation
                const subsByUser = allSubscriptions.reduce((acc, sub) => {
                    const userId = sub.candidateId.toString();
                    if (!acc[userId]) acc[userId] = [];
                    acc[userId].push(sub);
                    return acc;
                }, {});

                const pendingNotificationsToInsert = [];
                const processedUsers = new Set();

                // Process each user's subscriptions
                for (const userId of allMatchedUserIds) {
                    if (processedUsers.has(userId)) continue;
                    processedUsers.add(userId);

                    const userSubscriptions = subsByUser[userId];
                    if (!userSubscriptions) continue;

                    // Check for duplicate notification
                    if (await isDuplicateNotification(userId, job.jobId)) {
                        logger.info(`Skipping duplicate notification for user ${userId}, job ${job.jobId}`);
                        continue;
                    }
                    
                    let bestScore = 0;
                    let bestSubscription = null;
                    const allMatchingSubs = [];

                    for (const subscription of userSubscriptions) {
                        // Use matchJobWithSubscription first as a cheap filter
                        if (matchJobWithSubscription(job, subscription)) {
                            const score = await calculateJobRelevanceScore(job, subscription, userId);
                            // A score > 30 means it's a definite match (base filter match score is 30)
                            if (score > 30) {
                                allMatchingSubs.push(subscription);
                                if (score > bestScore) {
                                    bestScore = score;
                                    bestSubscription = subscription;
                                }
                            }
                        }
                    }
                    
                    // If a suitable subscription is found, create a pending notification
                    if (bestSubscription) {                        
                        const notificationData = {
                            userId,
                            jobId: job.jobId,
                            subscriptionId: bestSubscription._id,
                            matchingSubscriptionIds: allMatchingSubs.map(sub => sub._id)
                        };
                        pendingNotificationsToInsert.push(notificationData);
                        
                        // Mark job as sent to this user to prevent duplicates
                        await markJobAsSent(userId, job.jobId);
                        logger.info(`Queued pending notification for user ${userId}, job ${job.jobId} (score: ${bestScore})`);
                    }
                }

                // Batch insert all pending notifications for this job
                if (pendingNotificationsToInsert.length > 0) {
                    await PendingNotification.insertMany(pendingNotificationsToInsert);
                    logger.info(`Batch inserted ${pendingNotificationsToInsert.length} pending notifications for job ${job.jobId}`);
                }

            }
        });
    } catch (error) {
        logger.error('Error in enhanced matching worker:', error);
        process.exit(1);
    }
}

startMatchingWorker();
