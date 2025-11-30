/**
 * Script rebuild toàn bộ Redis từ MongoDB
 * Sử dụng khi:
 *   - Deploy Redis mới (chưa có data)
 *   - Redis bị flush/clear
 *   - Cần sync lại toàn bộ dữ liệu
 *   - Sau khi restore MongoDB từ backup
 * 
 * Chạy: npm run rebuild:redis:all
 * Hoặc: node scripts/rebuild-redis-all.js
 * 
 * Options:
 *   --dry-run   : Chỉ kiểm tra, không ghi vào Redis
 *   --verbose   : Hiển thị chi tiết từng bước
 *   --skip-verify: Bỏ qua bước verify
 */

import path from 'path';
import dotenv from 'dotenv';
dotenv.config({ path: path.resolve(process.cwd(), '.env') });

import connectDB from '../src/utils/connectDB.js';
import JobAlertSubscription from '../src/models/JobAlertSubscription.js';
import redisClient from '../src/config/redis.js';
import RedisKeys from '../src/utils/redisKeys.js';
import logger from '../src/utils/logger.js';

// Parse command line arguments
const args = process.argv.slice(2);
const DRY_RUN = args.includes('--dry-run');
const VERBOSE = args.includes('--verbose');
const SKIP_VERIFY = args.includes('--skip-verify');

// Statistics tracker
const stats = {
    startTime: null,
    endTime: null,
    deletedKeys: 0,
    totalSubscriptions: 0,
    activeSubscriptions: 0,
    uniqueKeywords: 0,
    totalMappings: 0,
    errors: []
};

/**
 * Log với điều kiện verbose
 */
function verboseLog(...args) {
    if (VERBOSE) {
        logger.info(...args);
    }
}

/**
 * Hiển thị banner
 */
function showBanner() {
    console.log('\n' + '='.repeat(60));
    console.log('🔄 REDIS REBUILD SCRIPT');
    console.log('='.repeat(60));
    console.log(`Mode: ${DRY_RUN ? '🔍 DRY RUN (no changes will be made)' : '⚡ LIVE'}`);
    console.log(`Verbose: ${VERBOSE ? 'Yes' : 'No'}`);
    console.log(`Skip Verify: ${SKIP_VERIFY ? 'Yes' : 'No'}`);
    console.log('='.repeat(60) + '\n');
}

/**
 * Step 1: Kiểm tra connections
 */
async function checkConnections() {
    logger.info('📝 Step 1: Checking connections...');
    
    await connectDB();
    logger.info('  ✅ MongoDB connected');
    
    if (!redisClient.isOpen || !redisClient.isReady) {
        throw new Error('Redis is not connected or not ready');
    }
    logger.info('  ✅ Redis connected');
    
    // Test Redis với PING
    const pong = await redisClient.ping();
    if (pong !== 'PONG') {
        throw new Error(`Redis PING failed: ${pong}`);
    }
    logger.info('  ✅ Redis PING successful');
}

/**
 * Step 2: Backup và Clear Redis keys
 */
async function clearRedisKeys() {
    logger.info('\n📝 Step 2: Clearing existing Redis keys...');
    
    // Tìm tất cả keys liên quan đến job_alert
    const patterns = [
        'job_alert:keyword:*',
        'job_alert:sent:*',
        'job_matches:*',
        'subscription:*'
    ];
    
    let totalDeleted = 0;
    
    for (const pattern of patterns) {
        const keys = await redisClient.keys(pattern);
        
        if (keys.length > 0) {
            verboseLog(`  Found ${keys.length} keys matching ${pattern}`);
            
            if (!DRY_RUN) {
                await redisClient.del(...keys);
                logger.info(`  ✅ Deleted ${keys.length} keys matching ${pattern}`);
            } else {
                logger.info(`  🔍 [DRY RUN] Would delete ${keys.length} keys matching ${pattern}`);
            }
            
            totalDeleted += keys.length;
        } else {
            verboseLog(`  No keys found matching ${pattern}`);
        }
    }
    
    stats.deletedKeys = totalDeleted;
    logger.info(`  Total keys ${DRY_RUN ? 'would be' : ''} deleted: ${totalDeleted}`);
}

/**
 * Step 3: Fetch data từ MongoDB
 */
async function fetchMongoData() {
    logger.info('\n📝 Step 3: Fetching data from MongoDB...');
    
    // Get all subscriptions
    const allSubscriptions = await JobAlertSubscription.find({}).lean();
    stats.totalSubscriptions = allSubscriptions.length;
    logger.info(`  Total subscriptions in MongoDB: ${allSubscriptions.length}`);
    
    // Get active subscriptions
    const activeSubscriptions = await JobAlertSubscription.find({ active: true }).lean();
    stats.activeSubscriptions = activeSubscriptions.length;
    logger.info(`  Active subscriptions: ${activeSubscriptions.length}`);
    
    // Group by keyword
    const keywordMap = new Map();
    
    for (const sub of activeSubscriptions) {
        const keyword = sub.keyword?.toLowerCase().trim();
        
        if (!keyword) {
            stats.errors.push(`Subscription ${sub._id} has empty keyword`);
            continue;
        }
        
        if (!keywordMap.has(keyword)) {
            keywordMap.set(keyword, new Set());
        }
        
        keywordMap.get(keyword).add(sub.candidateId.toString());
    }
    
    stats.uniqueKeywords = keywordMap.size;
    logger.info(`  Unique keywords: ${keywordMap.size}`);
    
    return keywordMap;
}

/**
 * Step 4: Rebuild Redis sets
 */
async function rebuildRedisSets(keywordMap) {
    logger.info('\n📝 Step 4: Rebuilding Redis sets...');
    
    if (keywordMap.size === 0) {
        logger.info('  No active subscriptions to rebuild');
        return;
    }
    
    let totalMappings = 0;
    let processedKeywords = 0;
    
    const keywords = Array.from(keywordMap.keys());
    
    for (const keyword of keywords) {
        const userIds = Array.from(keywordMap.get(keyword));
        const redisKey = RedisKeys.getKeywordKey(keyword);
        
        if (userIds.length > 0) {
            if (!DRY_RUN) {
                // Add từng user vào set - đảm bảo tất cả users được add
                for (const userId of userIds) {
                    await redisClient.sAdd(redisKey, userId);
                }
                
                verboseLog(`  ✅ Added ${userIds.length} users to ${redisKey}: [${userIds.join(', ')}]`);
            } else {
                verboseLog(`  [DRY RUN] Would add ${userIds.length} users to ${redisKey}: [${userIds.join(', ')}]`);
            }
            
            totalMappings += userIds.length;
        }
        
        processedKeywords++;
        
        // Progress log mỗi 50 keywords
        if (keywords.length > 50 && processedKeywords % 50 === 0) {
            logger.info(`  Progress: ${processedKeywords}/${keywords.length} keywords processed`);
        }
    }
    
    stats.totalMappings = totalMappings;
    logger.info(`  ✅ ${DRY_RUN ? '[DRY RUN] Would create' : 'Created'} ${stats.uniqueKeywords} Redis sets with ${totalMappings} total mappings`);
}

/**
 * Step 5: Verify consistency
 */
async function verifyConsistency(keywordMap) {
    if (SKIP_VERIFY) {
        logger.info('\n📝 Step 5: Verification skipped');
        return true;
    }
    
    if (DRY_RUN) {
        logger.info('\n📝 Step 5: Verification skipped (dry run mode)');
        return true;
    }
    
    logger.info('\n📝 Step 5: Verifying consistency...');
    
    let passed = 0;
    let failed = 0;
    
    // Check tất cả keywords
    for (const [keyword, expectedUserIds] of keywordMap.entries()) {
        const redisKey = RedisKeys.getKeywordKey(keyword);
        const redisMembers = await redisClient.sMembers(redisKey);
        const redisSet = new Set(redisMembers);
        
        // Compare
        const expectedCount = expectedUserIds.size;
        const actualCount = redisSet.size;
        
        if (expectedCount === actualCount) {
            // Check từng member
            let allMatch = true;
            for (const userId of expectedUserIds) {
                if (!redisSet.has(userId)) {
                    allMatch = false;
                    break;
                }
            }
            
            if (allMatch) {
                passed++;
                verboseLog(`  ✅ ${keyword}: ${actualCount} users (match)`);
            } else {
                failed++;
                logger.error(`  ❌ ${keyword}: Count matches but members differ`);
                stats.errors.push(`${keyword}: members mismatch`);
            }
        } else {
            failed++;
            logger.error(`  ❌ ${keyword}: Expected ${expectedCount}, got ${actualCount}`);
            stats.errors.push(`${keyword}: count mismatch (expected ${expectedCount}, got ${actualCount})`);
        }
    }
    
    logger.info(`  Verification complete: ${passed} passed, ${failed} failed`);
    
    return failed === 0;
}

/**
 * Step 6: Sample data display
 */
async function showSampleData() {
    if (DRY_RUN) {
        return;
    }
    
    logger.info('\n📝 Step 6: Sample data...');
    
    const keys = await redisClient.keys('job_alert:keyword:*');
    const sampleKeys = keys.slice(0, 5);
    
    for (const key of sampleKeys) {
        const members = await redisClient.sMembers(key);
        logger.info(`  ${key}: ${members.length} users`);
        
        if (VERBOSE && members.length > 0) {
            logger.info(`    Sample users: ${members.slice(0, 3).join(', ')}${members.length > 3 ? '...' : ''}`);
        }
    }
}

/**
 * Hiển thị summary
 */
function showSummary(success) {
    stats.endTime = Date.now();
    const duration = ((stats.endTime - stats.startTime) / 1000).toFixed(2);
    
    console.log('\n' + '='.repeat(60));
    console.log('📊 REBUILD SUMMARY');
    console.log('='.repeat(60));
    console.log(`Status: ${success ? '✅ SUCCESS' : '❌ FAILED'}`);
    console.log(`Mode: ${DRY_RUN ? 'DRY RUN' : 'LIVE'}`);
    console.log(`Duration: ${duration}s`);
    console.log('-'.repeat(60));
    console.log('Statistics:');
    console.log(`  - Redis keys deleted: ${stats.deletedKeys}`);
    console.log(`  - Total subscriptions in MongoDB: ${stats.totalSubscriptions}`);
    console.log(`  - Active subscriptions: ${stats.activeSubscriptions}`);
    console.log(`  - Unique keywords: ${stats.uniqueKeywords}`);
    console.log(`  - Total user-keyword mappings: ${stats.totalMappings}`);
    
    if (stats.errors.length > 0) {
        console.log('-'.repeat(60));
        console.log('Errors:');
        stats.errors.forEach((err, i) => {
            console.log(`  ${i + 1}. ${err}`);
        });
    }
    
    console.log('='.repeat(60) + '\n');
}

/**
 * Main function
 */
async function main() {
    stats.startTime = Date.now();
    let success = false;
    
    try {
        showBanner();
        
        await checkConnections();
        await clearRedisKeys();
        
        const keywordMap = await fetchMongoData();
        await rebuildRedisSets(keywordMap);
        
        const verifyResult = await verifyConsistency(keywordMap);
        
        if (!DRY_RUN) {
            await showSampleData();
        }
        
        success = verifyResult;
        
    } catch (error) {
        logger.error('❌ Rebuild failed:', error);
        stats.errors.push(error.message);
        success = false;
    } finally {
        showSummary(success);
        
        try {
            await redisClient.quit();
        } catch (e) {
            // Ignore
        }
        
        process.exit(success ? 0 : 1);
    }
}

// Run
main();
