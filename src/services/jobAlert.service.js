import JobAlertSubscription from '../models/JobAlertSubscription.js';
import { BadRequestError, NotFoundError } from '../utils/AppError.js';
import redisClient from '../config/redis.js';

const getKeywordRedisKey = (keyword) => `job_alert:keyword:${keyword.toLowerCase().trim()}`;

export const createJobAlert = async (candidateId, data) => {
    const count = await JobAlertSubscription.countDocuments({ candidateId, active: true });
    if (count >= 3) {
        throw new BadRequestError('Bạn chỉ có thể tạo tối đa 3 đăng ký.');
    }
    const subscription = await JobAlertSubscription.create({ ...data, candidateId });
    await redisClient.sAdd(getKeywordRedisKey(subscription.keyword), candidateId.toString());
    return subscription;
};

export const updateJobAlert = async (candidateId, subscriptionId, data) => {
    const subscription = await JobAlertSubscription.findById(subscriptionId);
    if (!subscription || subscription.candidateId.toString() !== candidateId) {
        throw new NotFoundError('Không tìm thấy đăng ký hoặc bạn không có quyền.');
    }
    const oldKeyword = subscription.keyword;
    Object.assign(subscription, data);
    await subscription.save();

    if (data.keyword && data.keyword.toLowerCase() !== oldKeyword.toLowerCase()) {
        const multi = redisClient.multi();
        multi.sRem(getKeywordRedisKey(oldKeyword), candidateId.toString());
        multi.sAdd(getKeywordRedisKey(data.keyword), candidateId.toString());
        await multi.exec();
    }
    return subscription;
};

export const deleteJobAlert = async (candidateId, subscriptionId) => {
    const subscription = await JobAlertSubscription.findOneAndDelete({ _id: subscriptionId, candidateId });
    if (!subscription) {
        throw new NotFoundError('Không tìm thấy đăng ký để xóa.');
    }
    await redisClient.sRem(getKeywordRedisKey(subscription.keyword), candidateId.toString());
};

export const getMyJobAlerts = async (candidateId) => {
    return JobAlertSubscription.find({ candidateId }).lean();
};
