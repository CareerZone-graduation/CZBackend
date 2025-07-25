// test-job-notification-system.js
import path from 'path';
import dotenv from 'dotenv';
dotenv.config({ path: path.resolve(process.cwd(), '.env') });

import connectDB from './src/utils/connectDB.js';
import logger from './src/utils/logger.js';
import * as kafkaService from './src/services/kafka.service.js';
import JobAlertSubscription from './src/models/JobAlertSubscription.js';
import PendingNotification from './src/models/PendingNotification.js';
import redisClient from './src/config/redis.js';

async function testJobNotificationSystem() {
    try {
        // Kết nối database
        await connectDB();
        logger.info('Connected to MongoDB');

        // Kết nối Kafka producer
        await kafkaService.connectProducer();
        logger.info('Connected to Kafka');

        // Dọn dẹp dữ liệu test cũ
        await PendingNotification.deleteMany({});
        await redisClient.flushDb();
        logger.info('Cleaned up old test data');

        // Tạo job alert subscription test
        const testUserId = '685a7673c923b1bb8073147d'; // Test user ID
        const testSubscription = {
            candidateId: testUserId,
            keyword: 'nodejs',
            location: {
                city: 'Ho Chi Minh',
                district: 'District 1'
            },
            frequency: 'daily',
            salaryRange: '10M_20M',
            type: 'FULL_TIME',
            workType: 'REMOTE',
            experience: 'MID_LEVEL',
            active: true
        };

        // Lưu subscription vào Redis (giả lập việc tạo subscription)
        await redisClient.sAdd('job_alert:keyword:nodejs', testUserId);
        logger.info('Added test subscription to Redis');

        // Tạo và gửi job event test
        const testJobEvent = {
            eventType: 'JOB_CREATED',
            timestamp: new Date().toISOString(),
            payload: {
                jobId: '686ff50a61fa499835c491d0',
                title: 'Senior NodeJS Developer',
                description: 'We are looking for an experienced NodeJS developer to join our team...',
                requirements: 'Experience with NodeJS, MongoDB, Redis',
                benefits: 'Competitive salary, flexible working hours',
                skills: ['nodejs', 'mongodb', 'redis', 'javascript'],
                category: 'SOFTWARE_DEVELOPMENT',
                area: 'HO_CHI_MINH',
                minSalary: 21000000,
                maxSalary: 29000000,
                location: {
                    city: 'Ho Chi Minh City',
                    district: 'District 1',
                    address: '123 Test Street'
                },
                type: 'FULL_TIME',
                workType: 'HYBRID',
                experience: 'SENIOR_LEVEL',
                companyName: 'Test Company'
            }
        };

        await kafkaService.sendJobEvent(testJobEvent);
        logger.info('Sent test job event to Kafka');

        // Đợi một chút để matching worker xử lý
        logger.info('Waiting for matching worker to process...');
        await new Promise(resolve => setTimeout(resolve, 100));

        // Kiểm tra PendingNotification
        const pendingNotifications = await PendingNotification.find({});
        logger.info(`Found ${pendingNotifications.length} pending notifications`);
        
        if (pendingNotifications.length > 0) {
            logger.info('Pending notifications:', pendingNotifications);
            logger.info('✅ Job notification matching system is working correctly!');
        } else {
            logger.warn('❌ No pending notifications found. Check if matching worker is running.');
        }

        // Test cron job logic (manual trigger)
        logger.info('Testing cron job logic...');
        const userDigests = await PendingNotification.aggregate([
            {
                $group: {
                    _id: "$userId",
                    jobIds: { $addToSet: "$jobId" }
                }
            }
        ]);

        logger.info(`Cron job would process ${userDigests.length} user digests`);

        process.exit(0);
    } catch (error) {
        logger.error('Test failed:', error);
        process.exit(1);
    }
}

testJobNotificationSystem();
