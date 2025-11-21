/**
 * Job Matching Worker - MongoDB Change Stream Implementation
 * 
 * This worker listens to MongoDB Change Streams on the Job collection
 * to detect new job insertions in real-time. When a new APPROVED and ACTIVE
 * job is created, it automatically matches the job against user subscriptions
 * and creates pending notifications.
 * 
 * Benefits of Change Streams over Kafka:
 * - Direct database listening - no message broker needed
 * - Guaranteed delivery - MongoDB handles reliability
 * - Simpler architecture - fewer moving parts
 * - Automatic reconnection on failures
 * - No need for separate producer/consumer setup
 */

import path from 'path';
import dotenv from 'dotenv';
dotenv.config({ path: path.resolve(process.cwd(), '.env') });

import connectDB from '../src/utils/connectDB.js';
import logger from '../src/utils/logger.js';
import redisClient from '../src/config/redis.js';
import Job from '../src/models/Job.js';
import JobAlertSubscription from '../src/models/JobAlertSubscription.js';
import PendingNotification from '../src/models/PendingNotification.js';
import RedisKeys from '../src/utils/redisKeys.js';

/**
 * Tính điểm độ phù hợp giữa job và subscription
 * @param {Object} job - Job document từ MongoDB
 * @param {Object} subscription - JobAlertSubscription document
 * @param {String} userId - ID của user (không sử dụng nhưng giữ lại cho tương lai)
 * @returns {Number} Điểm từ 0-70 (càng cao càng phù hợp)
 */
const calculateJobRelevanceScore = async (job, subscription, userId) => {
    let baseScore = 0;
    
    // 1. Điểm matching keyword (0-40 điểm)
    // Kiểm tra keyword xuất hiện ở đâu trong job
    const keywordInTitle = job.title.toLowerCase().includes(subscription.keyword.toLowerCase());
    const keywordInSkills = job.skills?.some(skill => 
        skill.toLowerCase().includes(subscription.keyword.toLowerCase())
    );
    const keywordInDescription = job.description?.toLowerCase().includes(subscription.keyword.toLowerCase());
    
    // Phân bổ điểm theo độ quan trọng
    if (keywordInTitle) baseScore += 20;        // Keyword trong title: quan trọng nhất
    if (keywordInSkills) baseScore += 15;       // Keyword trong skills: quan trọng thứ 2
    if (keywordInDescription) baseScore += 5;   // Keyword trong description: ít quan trọng nhất
    
    // 2. Điểm matching filters (0-30 điểm)
    // Kiểm tra job có khớp với tất cả filters của subscription không
    if (matchJobWithSubscription(job, subscription)) {
        baseScore += 30;  // Bonus lớn nếu match tất cả filters
    } else {
        return 0; // Không match filters → không gửi notification
    }
    
    // 3. Bonus điểm nếu category khớp chính xác (0-10 điểm)
    // Nếu user chọn category cụ thể (không phải 'ALL') và job khớp đúng category đó
    if (subscription.category !== 'ALL' && subscription.category === job.category) {
        baseScore += 10;
    }
    
    // Tổng điểm tối đa: 20 + 15 + 5 + 30 + 10 = 80 điểm
    // Nhưng thực tế max là 70 vì không thể có cả 3 keyword positions cùng lúc
    return Math.round(baseScore);
};

/**
 * Kiểm tra job có khớp với tất cả filters của subscription không
 * @param {Object} job - Job document
 * @param {Object} subscription - Subscription document
 * @returns {Boolean} true nếu job khớp tất cả filters, false nếu không
 */
const matchJobWithSubscription = (job, subscription) => {
    // Helper function: Kiểm tra salary range có khớp không
    const salaryMatch = (subRange) => {
        if (!subRange || subRange === 'ALL') return true; // User không filter salary
        
        const min = parseFloat(job.minSalary?.toString() || '0');
        const max = parseFloat(job.maxSalary?.toString() || '999999999');
        
        // Mapping các range với điều kiện
        const ranges = {
            'UNDER_10M': max < 10000000,                              // Dưới 10 triệu
            '10M_20M': min >= 10000000 && max <= 20000000,           // 10-20 triệu
            '20M_30M': min >= 20000000 && max <= 30000000,           // 20-30 triệu
            'OVER_30M': min > 30000000,                              // Trên 30 triệu
        };
        return ranges[subRange] || false;
    };

    // 1. Location matching (3 cấp: Tỉnh/Thành → Quận/Huyện → Phường/Xã)
    const location = subscription.location;
    const provinceMatch = location.province === 'ALL' || location.province === job.location.province;
    const districtMatch = !location.district || location.district === 'ALL' || location.district === job.location.district;
    const communeMatch = !location.commune || location.commune === job.location.commune;
    
    // 2. Category matching
    const categoryMatch = subscription.category === 'ALL' || subscription.category === job.category;
    
    // 3. Kết hợp tất cả filters (logic AND - phải match tất cả)
    return (
        provinceMatch &&                                                          // Tỉnh/Thành phố
        districtMatch &&                                                          // Quận/Huyện
        communeMatch &&                                                           // Phường/Xã
        categoryMatch &&                                                          // Ngành nghề
        (subscription.type === 'ALL' || subscription.type === job.type) &&       // Loại hình (Full-time, Part-time...)
        (subscription.workType === 'ALL' || subscription.workType === job.workType) && // Hình thức (Remote, On-site...)
        (subscription.experience === 'ALL' || subscription.experience === job.experience) && // Kinh nghiệm
        salaryMatch(subscription.salaryRange)                                     // Mức lương
    );
};

/**
 * Kiểm tra xem user đã nhận notification về job này chưa
 * Sử dụng Redis để cache, tránh gửi duplicate notifications
 * @param {String} userId - ID của user
 * @param {String} jobId - ID của job
 * @returns {Boolean} true nếu đã gửi rồi, false nếu chưa
 */
const isDuplicateNotification = async (userId, jobId) => {
    const duplicateKey = RedisKeys.getDuplicateJobKey(userId, jobId);
    // Redis key format: "job_alert:sent:userId:jobId"
    const exists = await redisClient.exists(duplicateKey);
    return exists === 1;
};

/**
 * Đánh dấu job đã được gửi cho user (lưu vào Redis)
 * TTL = 7 ngày, sau đó tự động xóa
 * @param {String} userId - ID của user
 * @param {String} jobId - ID của job
 */
const markJobAsSent = async (userId, jobId) => {
    const duplicateKey = RedisKeys.getDuplicateJobKey(userId, jobId);
    // Lưu vào Redis với TTL 7 ngày (604800 giây)
    // Sau 7 ngày, key tự động xóa → có thể gửi lại job này nếu vẫn còn active
    await redisClient.setEx(duplicateKey, 7 * 24 * 60 * 60, '1');
};

/**
 * Xử lý matching cho 1 job mới
 * Luồng xử lý:
 * 1. Trích xuất keywords từ job
 * 2. Query Redis để tìm users quan tâm keywords đó
 * 3. Lấy chi tiết subscriptions từ MongoDB
 * 4. Filter và tính điểm cho từng subscription
 * 5. Tạo pending notifications cho users phù hợp
 * 
 * @param {Object} job - Job document từ MongoDB Change Stream
 */
async function processJobForMatching(job) {
    logger.info(`Processing job ${job._id}: ${job.title}`);

    // BƯỚC 1: Trích xuất keywords từ job
    // Lấy từ: title, skills, và 10 từ đầu tiên của description
    const jobKeywords = [
        ...job.title.toLowerCase().split(/\s+/),                              // Tách title thành từng từ
        ...(job.skills || []).map(s => s.toLowerCase()),                      // Lowercase tất cả skills
        ...(job.description || '').toLowerCase().split(/\s+/).slice(0, 20)   // Lấy 20 từ đầu description
    ].filter((keyword, index, self) => 
        keyword.length > 2 && self.indexOf(keyword) === index                 // Loại bỏ từ ngắn (<3 ký tự) và duplicate
    );

    // Chuyển keywords thành Redis keys
    // Ví dụ: "nodejs" → "job_alert:keyword:nodejs"
    const redisKeys = jobKeywords.map(x => RedisKeys.getKeywordKey(x)).filter(key => key);
            
    if (redisKeys.length === 0) {
        logger.info(`No valid keywords found for job ${job._id}`);
        return;
    }


    // BƯỚC 2: Query Redis để tìm users quan tâm
    // SUNION = lấy tất cả userIds từ các Redis Sets
    // Ví dụ: SUNION job_alert:keyword:nodejs job_alert:keyword:react
    // → Kết quả: [userId1, userId2, userId3, ...]
    const matchedUserIds = await redisClient.sUnion(redisKeys);
    const allMatchedUserIds = [...new Set(matchedUserIds)]; // Remove duplicates

    logger.info(`Matched ${allMatchedUserIds.length} users for job ${job._id}`);

    if (allMatchedUserIds.length === 0) return; // Không có user nào quan tâm

    // BƯỚC 3: Lấy chi tiết subscriptions từ MongoDB
    // Chỉ query subscriptions của users đã match (hiệu quả hơn query toàn bộ)
    const allSubscriptions = await JobAlertSubscription.find({
        candidateId: { $in: allMatchedUserIds },
        active: true  // Chỉ lấy subscriptions đang active
    }).lean();

    logger.info(`Found ${allSubscriptions.length} active subscriptions for matched users.`);

    // BƯỚC 4: Group subscriptions theo user
    // Vì 1 user có thể có nhiều subscriptions (tối đa 3)
    const subsByUser = allSubscriptions.reduce((acc, sub) => {
        const userId = sub.candidateId.toString();
        if (!acc[userId]) acc[userId] = [];
        acc[userId].push(sub);
        return acc;
    }, {});

    const pendingNotificationsToInsert = [];
    const processedUsers = new Set();
    logger.info('allMatchedUserIds',allMatchedUserIds)

    // BƯỚC 5: Xử lý từng user
    for (const userId of allMatchedUserIds) {
        if (processedUsers.has(userId)) continue; // Skip nếu đã xử lý
        processedUsers.add(userId);
        logger.info(`Processing user ${userId}`);
        console.log(processedUsers)

        const userSubscriptions = subsByUser[userId];
        console.log(userSubscriptions)
        if (!userSubscriptions) continue; // User không có subscription active

        // Kiểm tra duplicate: User đã nhận notification về job này chưa?
        console.log("check duplicate");
        if (await isDuplicateNotification(userId, job._id)) {
            console.log("checkno")
            logger.info(`Skipping duplicate notification for user ${userId}, job ${job._id}`);
            continue;
        }

        let bestScore = 0;
        let bestSubscription = null;
        const allMatchingSubs = [];

        // Duyệt qua tất cả subscriptions của user
        for (const subscription of userSubscriptions) {
            console.log(subscription)
            // Filter nhanh: Kiểm tra job có match filters cơ bản không
            if (matchJobWithSubscription(job, subscription)) {
                // Tính điểm chi tiết
                const score = await calculateJobRelevanceScore(job, subscription, userId);
                console.log(score)
                // Threshold: Chỉ chấp nhận nếu score > 30
                // (30 = điểm của filter match, đảm bảo job ít nhất match filters cơ bản)
                if (score > 30) {
                    allMatchingSubs.push(subscription);
                    
                    // Lưu subscription có điểm cao nhất
                    if (score > bestScore) {
                        bestScore = score;
                        bestSubscription = subscription;
                    }
                }
            }
        }

        // BƯỚC 6: Tạo pending notification nếu có subscription phù hợp
        if (bestSubscription) {
            const notificationData = {
                userId,
                jobId: job._id,
                subscriptionId: bestSubscription._id,                          // Subscription có điểm cao nhất
                matchingSubscriptionIds: allMatchingSubs.map(sub => sub._id)   // Tất cả subscriptions match
            };

            pendingNotificationsToInsert.push(notificationData);

            // Đánh dấu đã gửi (lưu vào Redis với TTL 7 ngày)
            await markJobAsSent(userId, job._id);

            logger.info(`Queued pending notification for user ${userId}, job ${job._id} (score: ${bestScore})`);
        }
    }

    // BƯỚC 7: Batch insert tất cả notifications (hiệu quả hơn insert từng cái)
    if (pendingNotificationsToInsert.length > 0) {
        await PendingNotification.insertMany(pendingNotificationsToInsert);
        logger.info(`Batch inserted ${pendingNotificationsToInsert.length} pending notifications for job ${job._id}`);
    }
}

/**
 * Khởi động Matching Worker
 * Sử dụng MongoDB Change Streams để lắng nghe real-time khi có job mới hoặc job được duyệt
 * 
 * Cách hoạt động:
 * 1. Kết nối MongoDB
 * 2. Tạo Change Stream lắng nghe collection "jobs"
 * 3. Filter 3 trường hợp:
 *    - INSERT: Job mới được tạo với status APPROVED ngay từ đầu
 *    - UPDATE: Job được admin duyệt (PENDING → APPROVED)
 *    - UPDATE: Job được kích hoạt lại (INACTIVE → ACTIVE)
 * 4. Khi có event match → gọi processJobForMatching()
 * 5. Tự động reconnect nếu có lỗi
 * 
 * Tại sao cần lắng nghe UPDATE?
 * - Recruiter tạo job → status = PENDING (chờ duyệt)
 * - Admin duyệt job → moderationStatus = APPROVED
 * - Nếu chỉ lắng nghe INSERT, sẽ bỏ lỡ job này!
 */
async function startMatchingWorker() {
    try {
        await connectDB();
        logger.info('✅ Connected to MongoDB');
        
        // Kiểm tra MongoDB có phải Replica Set không
        const db = await import('mongoose').then(m => m.default.connection.db);
        const adminDb = db.admin();
        const serverStatus = await adminDb.serverStatus();
        
        if (!serverStatus.repl) {
            logger.error('❌ MongoDB is NOT a Replica Set! Change Streams require Replica Set.');
            logger.error('Please convert to Replica Set or use a MongoDB Atlas cluster.');
            process.exit(1);
        }
        
        logger.info(`✅ MongoDB Replica Set detected: ${serverStatus.repl.setName}`);
        logger.info('Matching worker started. Listening to Job collection changes...');

        // Tạo Change Stream trên collection Job
        // Change Stream = tính năng của MongoDB Replica Set để lắng nghe thay đổi real-time
        // Lắng nghe 2 loại events:
        // 1. INSERT: Job mới được tạo với status APPROVED ngay từ đầu
        // 2. UPDATE: Job được tạo với status PENDING, sau đó admin duyệt → APPROVED
        // Pipeline để filter events
        const pipeline = [
            {
                $match: {
                    $or: [
                        // Case 1: Job mới insert với status APPROVED
                        {
                            operationType: 'insert',
                            'fullDocument.moderationStatus': 'APPROVED',
                            'fullDocument.status': 'ACTIVE'
                        },
                        // Case 2: Job được update từ PENDING → APPROVED
                        {
                            operationType: 'update',
                            'updateDescription.updatedFields.moderationStatus': 'APPROVED',
                            'fullDocument.status': 'ACTIVE'
                        },
                        // Case 3: Job được update từ INACTIVE → ACTIVE (và đã APPROVED)
                        {
                            operationType: 'update',
                            'updateDescription.updatedFields.status': 'ACTIVE',
                            'fullDocument.moderationStatus': 'APPROVED'
                        },
                        // không check updateDescription.* nữa → mọi update trên job đã duyệt + active đều vào

                        {
                            operationType: 'update',
                            'fullDocument.moderationStatus': 'APPROVED',
                            'fullDocument.status': 'ACTIVE'
                            
                        }
                    ]
                }
            }
        ];
                
        const changeStream = Job.watch(pipeline, {
            fullDocument: 'updateLookup'  // Lấy toàn bộ document sau khi update
        });
        
        logger.info('✅ Change Stream created successfully. Waiting for events...');

        // Event handler: Khi có thay đổi trong collection
        changeStream.on('change', async (change) => {
            try {
                
                const job = change.fullDocument;
                
                if (!job) {
                    logger.warn('No fullDocument in change event!');
                    return;
                }
                
                
                // Validation bổ sung (double-check)
                if (job.moderationStatus !== 'APPROVED' || job.status !== 'ACTIVE') {
                    logger.info(`Skipping job ${job._id}: not approved (${job.moderationStatus}) or not active (${job.status})`);
                    return;
                }

                // Xử lý matching cho job này (cả insert và update đều xử lý giống nhau)
                await processJobForMatching(job);
                
            } catch (error) {
                logger.error('Error processing change stream event:', error);
                logger.error('Error stack:', error.stack);
                // Không throw error để worker tiếp tục chạy
            }
        });

        // Event handler: Khi có lỗi với Change Stream
        changeStream.on('error', (error) => {
            logger.error('Change stream error:', error);
            
            // Tự động reconnect sau 5 giây
            setTimeout(() => {
                logger.info('Attempting to restart change stream...');
                changeStream.close();
                startMatchingWorker();  // Recursive call để restart
            }, 5000);
        });

        // Event handler: Khi Change Stream bị đóng
        changeStream.on('close', () => {
            logger.warn('Change stream closed. Attempting to restart...');
            
            // Tự động restart sau 5 giây
            setTimeout(() => {
                startMatchingWorker();
            }, 5000);
        });

        // Graceful shutdown: Xử lý tín hiệu SIGINT (Ctrl+C)
        process.on('SIGINT', async () => {
            logger.info('Received SIGINT. Closing change stream...');
            await changeStream.close();
            await redisClient.quit();
            process.exit(0);
        });

        // Graceful shutdown: Xử lý tín hiệu SIGTERM (pm2 stop, docker stop...)
        process.on('SIGTERM', async () => {
            logger.info('Received SIGTERM. Closing change stream...');
            await changeStream.close();
            await redisClient.quit();
            process.exit(0);
        });

    } catch (error) {
        logger.error('Error in matching worker:', error);
        process.exit(1);
    }
}

// Khởi động worker
startMatchingWorker();
