/**
 * Script để rebuild Redis subscriptions từ MongoDB
 * Sử dụng khi Redis mất sync với MongoDB
 * 
 * Chạy: node scripts/rebuild-redis-subscriptions.js
 */

import path from 'path';
import dotenv from 'dotenv';
dotenv.config({ path: path.resolve(process.cwd(), '.env') });

import connectDB from '../src/utils/connectDB.js';
import JobAlertSubscription from '../src/models/JobAlertSubscription.js';
import redisClient from '../src/config/redis.js';
import RedisKeys from '../src/utils/redisKeys.js';
import logger from '../src/utils/logger.js';

async function rebuildRedisSubscriptions() {
    try {
        await connectDB();
        logger.info('✅ Connected to MongoDB and Redis');

        // Step 1: Clear all existing keyword keys in Redis
        logger.info('\n📝 Step 1: Clearing existing Redis keys...');
        const existingKeys = await redisClient.keys('job_alert:keyword:*');
        
        if (existingKeys.length > 0) {
            logger.info(`Found ${existingKeys.length} existing keys`);
            await redisClient.del(...existingKeys);
            logger.info(`✅ Deleted ${existingKeys.length} keys`);
        } else {
            logger.info('No existing keys found');
        }

        // Step 2: Get all ACTIVE subscriptions from MongoDB
        logger.info('\n📝 Step 2: Fetching active subscriptions from MongoDB...');
        const activeSubscriptions = await JobAlertSubscription.find({
            active: true
        }).lean();

        logger.info(`Found ${activeSubscriptions.length} active subscriptions`);

        if (activeSubscriptions.length === 0) {
            logger.info('No active subscriptions to rebuild');
            await redisClient.quit();
            process.exit(0);
        }

        // Step 3: Group subscriptions by keyword
        logger.info('\n📝 Step 3: Grouping subscriptions by keyword...');
        const keywordMap = new Map();

        for (const sub of activeSubscriptions) {
            const keyword = sub.keyword.toLowerCase().trim();
            
            if (!keywordMap.has(keyword)) {
                keywordMap.set(keyword, new Set());
            }
            
            keywordMap.get(keyword).add(sub.candidateId.toString());
        }

        logger.info(`Found ${keywordMap.size} unique keywords`);

        // Step 4: Rebuild Redis sets
        logger.info('\n📝 Step 4: Rebuilding Redis sets...');
        let totalAdded = 0;

        for (const [keyword, userIds] of keywordMap.entries()) {
            const redisKey = RedisKeys.getKeywordKey(keyword);
            const userIdsArray = Array.from(userIds);
            
            // Add all userIds to Redis set
            if (userIdsArray.length > 0) {
                await redisClient.sAdd(redisKey, ...userIdsArray);
                totalAdded += userIdsArray.length;
                logger.info(`  ✅ ${redisKey}: ${userIdsArray.length} users`);
            }
        }

        // Step 5: Verify
        logger.info('\n📝 Step 5: Verifying...');
        const newKeys = await redisClient.keys('job_alert:keyword:*');
        logger.info(`Total Redis keys created: ${newKeys.length}`);
        logger.info(`Total user-keyword mappings: ${totalAdded}`);

        // Step 6: Sample verification
        logger.info('\n📝 Step 6: Sample verification...');
        const sampleKeywords = Array.from(keywordMap.keys()).slice(0, 5);
        
        for (const keyword of sampleKeywords) {
            const redisKey = RedisKeys.getKeywordKey(keyword);
            const redisCount = await redisClient.sCard(redisKey);
            const mongoCount = keywordMap.get(keyword).size;
            
            if (redisCount === mongoCount) {
                logger.info(`  ✅ ${keyword}: ${redisCount} users (match)`);
            } else {
                logger.error(`  ❌ ${keyword}: Redis=${redisCount}, MongoDB=${mongoCount} (mismatch!)`);
            }
        }

        // Summary
        logger.info('\n=== Rebuild Summary ===');
        logger.info(`Active subscriptions in MongoDB: ${activeSubscriptions.length}`);
        logger.info(`Unique keywords: ${keywordMap.size}`);
        logger.info(`Redis keys created: ${newKeys.length}`);
        logger.info(`Total mappings: ${totalAdded}`);
        logger.info('✅ Rebuild completed successfully!');

        await redisClient.quit();
        process.exit(0);

    } catch (error) {
        logger.error('❌ Rebuild failed:', error);
        process.exit(1);
    }
}

rebuildRedisSubscriptions();
