import JobAlertSubscription from '../models/JobAlertSubscription.js';
import { BadRequestError, NotFoundError } from '../utils/AppError.js';
import redisClient from '../config/redis.js';
import logger from '../utils/logger.js';
import RedisKeys from '../utils/redisKeys.js';

// Enhanced subscription limit validation
const validateSubscriptionLimit = async (candidateId, excludeId = null) => {
    const query = { candidateId, active: true };
    if (excludeId) {
        query._id = { $ne: excludeId };
    }
    const count = await JobAlertSubscription.countDocuments(query);
    if (count >= 3) {
        throw new BadRequestError('Bạn chỉ có thể tạo tối đa 3 đăng ký.');
    }
};

export const createJobAlert = async (candidateId, data) => {
    // Enhanced subscription limit validation
    await validateSubscriptionLimit(candidateId);
    
    // Normalize keyword: trim, lowercase, ensure single word
    const normalizedData = {
        ...data,
        keyword: data.keyword?.trim().toLowerCase()
    };
    
    const subscription = await JobAlertSubscription.create({ ...normalizedData, candidateId });
    
    // Update Redis with keyword mapping (chỉ nếu subscription active)
    // Mặc định subscription.active = true khi tạo mới (theo model default)
    if (subscription.active) {
        try {
            if (redisClient.isOpen && redisClient.isReady) {
                await redisClient.sAdd(
                    RedisKeys.getKeywordKey(subscription.keyword), 
                    candidateId.toString()
                );
                logger.info(`Subscription created and added to Redis: keyword=${subscription.keyword}`);
            } else {
                logger.warn(`Redis not available, subscription created but not cached: keyword=${subscription.keyword}`);
            }
        } catch (error) {
            logger.error(`Failed to add subscription to Redis: ${error.message}`);
            // Continue - subscription is already saved to DB
        }
    } else {
        logger.info(`Subscription created but NOT added to Redis (inactive): keyword=${subscription.keyword}`);
    }
    
    return subscription;
};

export const updateJobAlert = async (candidateId, subscriptionId, data) => {
    logger.info(`Updating job alert subscription ${subscriptionId} for candidate ${candidateId}`);

    const subscription = await JobAlertSubscription.findById(subscriptionId);

    if (!subscription || !subscription.candidateId.equals(candidateId)) {
        throw new NotFoundError('Không tìm thấy đăng ký hoặc bạn không có quyền.');
    }

    // Validate subscription limit if activating an inactive subscription
    if (data.active === true && !subscription.active) {
        await validateSubscriptionLimit(candidateId, subscriptionId);
    }

    const oldKeyword = subscription.keyword;
    const oldActive = subscription.active;
    
    // Normalize keyword if provided
    if (data.keyword) {
        data.keyword = data.keyword.trim().toLowerCase();
    }
    
    Object.assign(subscription, data);
    await subscription.save();

    // Xử lý Redis dựa trên các trường hợp
    try {
        if (redisClient.isOpen && redisClient.isReady) {
            const multi = redisClient.multi();
            
            // Case 1: Đổi keyword (bất kể active hay không)
            if (data.keyword && data.keyword !== oldKeyword) {
                // Remove khỏi set cũ
                multi.sRem(
                    RedisKeys.getKeywordKey(oldKeyword),
                    candidateId.toString()
                );
                
                // Add vào set mới (chỉ nếu subscription đang active)
                if (subscription.active) {
                    multi.sAdd(
                        RedisKeys.getKeywordKey(subscription.keyword),
                        candidateId.toString()
                    );
                }
                
                logger.info(`Keyword changed: ${oldKeyword} → ${subscription.keyword}, active: ${subscription.active}`);
            }
            // Case 2: Không đổi keyword, nhưng thay đổi trạng thái active
            else if (data.active !== undefined && data.active !== oldActive) {
                if (subscription.active) {
                    // Kích hoạt lại → Add vào Redis
                    multi.sAdd(
                        RedisKeys.getKeywordKey(subscription.keyword),
                        candidateId.toString()
                    );
                    logger.info(`Subscription activated: keyword=${subscription.keyword}`);
                } else {
                    // Tạm ngưng → Remove khỏi Redis
                    multi.sRem(
                        RedisKeys.getKeywordKey(subscription.keyword),
                        candidateId.toString()
                    );
                    logger.info(`Subscription deactivated: keyword=${subscription.keyword}`);
                }
            }
            // Case 3: Không đổi keyword, không đổi active → Đảm bảo consistency
            else if (subscription.active) {
                // Nếu subscription đang active, đảm bảo user có trong Redis
                multi.sAdd(
                    RedisKeys.getKeywordKey(subscription.keyword),
                    candidateId.toString()
                );
            }
            
            await multi.exec();
        } else {
            logger.warn('Redis not available, subscription updated in DB only');
        }
    } catch (error) {
        logger.error(`Failed to update Redis: ${error.message}`);
        // Continue - subscription is already saved to DB
    }
    
    return subscription;
};

export const deleteJobAlert = async (candidateId, subscriptionId) => {
    const subscription = await JobAlertSubscription.findOneAndDelete({ _id: subscriptionId, candidateId });
    if (!subscription) {
        throw new NotFoundError('Không tìm thấy đăng ký để xóa.');
    }

    // Clean up Redis data
    try {
        if (redisClient.isOpen && redisClient.isReady) {
            const multi = redisClient.multi();
            multi.sRem(RedisKeys.getKeywordKey(subscription.keyword), candidateId.toString());
            await multi.exec();
            logger.info(`Subscription deleted from Redis: keyword=${subscription.keyword}`);
        } else {
            logger.warn('Redis not available, subscription deleted from DB only');
        }
    } catch (error) {
        logger.error(`Failed to delete subscription from Redis: ${error.message}`);
        // Continue - subscription is already deleted from DB
    }
};

export const getMyJobAlerts = async (candidateId) => {
    return JobAlertSubscription.find({ candidateId }).lean();
};
