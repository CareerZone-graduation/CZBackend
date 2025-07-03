import JobAlertSubscription from '../models/JobAlertSubscription.js';
import { NotFoundError, UnauthorizedError, BadRequestError } from '../utils/AppError.js';

/**
 * Create a new job alert subscription
 * @param {string} candidateId
 * @param {object} data
 * @returns {Promise<JobAlertSubscription>}
 */
export const createJobAlert = async (candidateId, data) => {
    const count = await JobAlertSubscription.countDocuments({ candidateId, active: true });
    if (count >= 3) {
        throw new BadRequestError('Bạn chỉ có thể tạo tối đa 3 đăng ký nhận thông báo.');
    }

    const subscription = new JobAlertSubscription({
        ...data,
        candidateId: candidateId,
    });
    await subscription.save();
    // bỏ createAt, updateAt , -v
    // return subscription;
    return {
        _id: subscription._id,
        candidateId: subscription.candidateId,
        title: subscription.title,
        description: subscription.description,
        location: subscription.location,
        salaryRange: subscription.salaryRange,
        frequency: subscription.frequency,
        type: subscription.type,
        workType: subscription.workType,
        experience: subscription.experience,
        active: subscription.active
    };
};

/**
 * Get all job alert subscriptions for a user
 * @param {string} candidateId
 * @returns {Promise<Array>}
 */
export const getMyJobAlerts = async (candidateId) => {
    const subscriptions = await JobAlertSubscription.find({ candidateId: candidateId }).select('-__v -createdAt -updatedAt').lean();
    return subscriptions;
};

/**
 * Update a job alert subscription
 * @param {string} candidateId
 * @param {string} subscriptionIdJobAlertSubscription
 * @param {object} data
 * @returns {Promise<JobAlertSubscription>}
 */
export const updateJobAlert = async (candidateId, subscriptionId, data) => {
    const subscription = await JobAlertSubscription.findById(subscriptionId);

    if (!subscription) {
        throw new NotFoundError('Không tìm thấy đăng ký nhận thông báo.');
    }

    if (subscription.candidateId.toString() !== candidateId) {
        throw new UnauthorizedError('Bạn không có quyền cập nhật đăng ký này.');
    }

    Object.assign(subscription, data);
    await subscription.save();
    return {
        _id: subscription._id,
        candidateId: subscription.candidateId,
        title: subscription.title,
        description: subscription.description,
        location: subscription.location,
        salaryRange: subscription.salaryRange,
        frequency: subscription.frequency,
        type: subscription.type,
        workType: subscription.workType,
        experience: subscription.experience,
        active: subscription.active
    }
};

/**
 * Delete a job alert subscription
 * @param {string} candidateId
 * @param {string} subscriptionId
 * @returns {Promise<void>}
 */
export const deleteJobAlert = async (candidateId, subscriptionId) => {
    const subscription = await JobAlertSubscription.findById(subscriptionId);

    if (!subscription) {
        throw new NotFoundError('Không tìm thấy đăng ký nhận thông báo.');
    }

    if (subscription.candidateId.toString() !== candidateId) {
        throw new UnauthorizedError('Bạn không có quyền xóa đăng ký này.');
    }

    await subscription.deleteOne();
};
