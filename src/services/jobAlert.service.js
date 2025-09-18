import JobAlertSubscription from '../models/JobAlertSubscription.js';
import NotificationHistory from '../models/NotificationHistory.js';
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
    
    const subscription = await JobAlertSubscription.create({ ...data, candidateId });
    // Update Redis with keyword mapping
    await redisClient.sAdd(RedisKeys.getKeywordKey(subscription.keyword), candidateId.toString());
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
    Object.assign(subscription, data);
    await subscription.save();

    // Handle Redis updates for keyword changes
    if (data.keyword && data.keyword.toLowerCase() !== oldKeyword.toLowerCase()) {
        const multi = redisClient.multi();
        multi.sRem(RedisKeys.getKeywordKey(oldKeyword), candidateId.toString());
        multi.sAdd(RedisKeys.getKeywordKey(data.keyword), candidateId.toString());
        await multi.exec();
    }
    return subscription;
};

export const deleteJobAlert = async (candidateId, subscriptionId) => {
    const subscription = await JobAlertSubscription.findOneAndDelete({ _id: subscriptionId, candidateId });
    if (!subscription) {
        throw new NotFoundError('Không tìm thấy đăng ký để xóa.');
    }

    // Clean up Redis data
    const multi = redisClient.multi();
    multi.sRem(RedisKeys.getKeywordKey(subscription.keyword), candidateId.toString());
    await multi.exec();
};

export const getMyJobAlerts = async (candidateId) => {
    return JobAlertSubscription.find({ candidateId }).lean();
};


export const getNotificationHistory = async (candidateId, options = {}) => {
    const {
        page = 1,
        limit = 20,
        subscriptionId,
        notificationType,
        status,
        startDate,
        endDate
    } = options;

    const skip = (page - 1) * limit;
    
    // Build query
    const query = { userId: candidateId };
    
    if (subscriptionId) {
        query.subscriptionId = subscriptionId;
    }
    
    if (notificationType) {
        query.notificationType = notificationType;
    }
    
    if (status) {
        query.status = status;
    }
    
    if (startDate || endDate) {
        query.sentAt = {};
        if (startDate) query.sentAt.$gte = new Date(startDate);
        if (endDate) query.sentAt.$lte = new Date(endDate);
    }

    // Execute queries
    const [notifications, total] = await Promise.all([
        NotificationHistory.find(query)
            .populate('subscriptionId', 'keyword frequency')
            .populate('jobIds', 'title company location')
            .sort({ sentAt: -1 })
            .skip(skip)
            .limit(limit)
            .lean(),
        NotificationHistory.countDocuments(query)
    ]);

    const totalPages = Math.ceil(total / limit);

    return {
        meta: {
            currentPage: page,
            totalPages,
            totalItems: total,
            itemsPerPage: limit,
            hasNextPage: page < totalPages,
            hasPrevPage: page > 1
        },
        data: notifications
    };
};
