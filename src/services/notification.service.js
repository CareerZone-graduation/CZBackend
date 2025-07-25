import Notification from '../models/Notification.js';
import Application from '../models/Application.js';
import CandidateProfile from '../models/CandidateProfile.js';
import InterviewRoom from '../models/InterviewRoom.js';
import { NotFoundError } from '../utils/AppError.js';
import logger from '../utils/logger.js';
import mongoose from 'mongoose';

// =================================================================
// Chức năng CRUD Thông báo (Phần tôi vừa thêm)
// =================================================================

/**
 * Get notifications for a user with pagination
 * @param {string} userId - The ID of the user
 * @param {object} options - Pagination options (page, limit)
 * @returns {Promise<object>} - A promise that resolves to an object containing notifications and pagination metadata
 */
export const getNotifications = async (userId, options = {}) => {
  const page = parseInt(options.page, 10) || 1;
  const limit = parseInt(options.limit, 10) || 10;
  const skip = (page - 1) * limit;

  const query = { userId };

  const notifications = await Notification.find(query)
    .sort({ createdAt: -1 })
    .skip(skip)
    .limit(limit)
    .lean();

  const totalItems = await Notification.countDocuments(query);
  const totalPages = Math.ceil(totalItems / limit);

  return {
    data: notifications,
    meta: {
      currentPage: page,
      totalPages,
      totalItems,
      limit,
    },
  };
};

/**
 * Mark a specific notification as read
 * @param {string} userId - The ID of the user
 * @param {string} notificationId - The ID of the notification
 * @returns {Promise<Notification>} - A promise that resolves to the updated notification
 */
export const markNotificationAsRead = async (userId, notificationId) => {
  const notification = await Notification.findOneAndUpdate(
    { _id: notificationId,  userId },
    { isRead: true },
    { new: true }
  ).lean();

  if (!notification) {
    throw new NotFoundError('Không tìm thấy thông báo hoặc bạn không có quyền truy cập.');
  }

  return notification;
};

/**
 * Mark all unread notifications as read for a user
 * @param {string} userId - The ID of the user
 * @returns {Promise<object>} - A promise that resolves to the result of the update operation
 */
export const markAllNotificationsAsRead = async (userId) => {
  const result = await Notification.updateMany(
    {  userId, isRead: false },
    { isRead: true }
  );

  return result;
};


// =================================================================
// Logic xử lý thông báo từ Worker/Queue (Phần đã có sẵn)
// =================================================================

const getStatusMessage = (status, jobTitle) => {
  switch (status) {
    case 'REVIEWING':
      return `Nhà tuyển dụng đang xem xét hồ sơ của bạn cho vị trí ${jobTitle}.`;
    case 'ACCEPTED':
      return `Chúc mừng! Hồ sơ ứng tuyển của bạn cho vị trí ${jobTitle} đã được chấp nhận.`;
    case 'REJECTED':
      return `Cảm ơn bạn đã ứng tuyển. Rất tiếc, hồ sơ của bạn cho vị trí ${jobTitle} chưa phù hợp.`;
    case 'INTERVIEWED':
      return `Bạn có một lịch phỏng vấn cho vị trí ${jobTitle}.`;
    default:
      return `Trạng thái hồ sơ ứng tuyển của bạn cho vị trí ${jobTitle} đã được cập nhật.`;
  }
};

/**
 * Xử lý logic cho một thông báo nhận được từ queue.
 * @param {object} payload - Dữ liệu của message.
 */
export const processNotification = async (payload) => {
  logger.info('Processing notification:', payload);

  switch (payload.type) {
    case 'APPLICATION_STATUS_UPDATE': {
      const { applicationId, newStatus } = payload.data;

      const application = await Application.findById(applicationId);
      if (!application) {
        throw new NotFoundError(`Application with id ${applicationId} not found.`);
      }

      const candidateProfile = await CandidateProfile.findById(application.candidateProfileId);
      if (!candidateProfile) {
        throw new NotFoundError(`CandidateProfile with id ${application.candidateProfileId} not found.`);
      }

      const title = `Cập nhật trạng thái ứng tuyển`;
      const message = getStatusMessage(newStatus, application.jobSnapshot.title);

      await Notification.create({
        userId: candidateProfile.userId,
        title,
        message,
        type: 'application',
        entity: {
          type: 'Application',
          id: applicationId,
        },
        metadata: {
          jobId: application.jobId,
          newStatus,
        },
      });

      logger.info(`Successfully created notification for application ${applicationId}`);
      break;
    }
    // case 'INTERVIEW_REMINDER': {
    //   const { interviewId } = payload.data;
    //   logger.info(`Handling interview reminder for interview ID: ${interviewId}`);

    //   const interview = await InterviewRoom.findById(interviewId).populate({
    //     path: 'applicationId',
    //     select: 'jobSnapshot.title',
    //   });

    //   if (!interview) {
    //     throw new NotFoundError(`Interview with id ${interviewId} not found.`);
    //   }

    //   const { candidateId, recruiterId, scheduledTime, applicationId } = interview;
    //   const jobTitle = applicationId?.jobSnapshot?.title || 'công việc đã ứng tuyển';
    //   const formattedTime = new Date(scheduledTime).toLocaleString('vi-VN', {
    //     hour: '2-digit',
    //     minute: '2-digit',
    //     day: '2-digit',
    //     month: '2-digit',
    //     year: 'numeric',
    //   });

    //   const notifications = [
    //     {
    //       userId: candidateId,
    //       title: 'Nhắc nhở lịch phỏng vấn',
    //       message: `Bạn có một buổi phỏng vấn cho vị trí "${jobTitle}" vào lúc ${formattedTime}.`,
    //       type: 'interview',
    //       entity: { type: 'InterviewRoom', id: interviewId },
    //       metadata: { applicationId: interview.applicationId },
    //     },
    //     {
    //       userId: recruiterId,
    //       title: 'Nhắc nhở lịch phỏng vấn',
    //       message: `Bạn có một buổi phỏng vấn với ứng viên cho vị trí "${jobTitle}" vào lúc ${formattedTime}.`,
    //       type: 'interview',
    //       entity: { type: 'InterviewRoom', id: interviewId },
    //       metadata: { applicationId: interview.applicationId },
    //     },
    //   ];

    //   await Notification.insertMany(notifications);
    //   logger.info(`Successfully created 2 interview reminders for interview ${interviewId}`);
    //   break;
    // }
    case 'DAILY_JOB_ALERT': {
      const { recipientId, data } = payload;
      const { keyword, jobs } = data;

      if (!recipientId || !jobs || jobs.length === 0) {
        logger.warn('DAILY_JOB_ALERT payload is missing recipientId or jobs.', payload);
        return; // Bỏ qua nếu payload không hợp lệ
      }

      const title = `Việc làm mới hàng ngày`;
      const message = `Chúng tôi đã tìm thấy ${jobs.length} công việc mới phù hợp với từ khóa "${keyword}" của bạn.`;

      await Notification.create({
        userId: new mongoose.Types.ObjectId(recipientId),
        title,
        message,
        type: 'job_alert',
        entity: {
          type: 'Job',
          // Lưu danh sách ID job để có thể click vào xem chi tiết
          ids: jobs.map(j => j._id),
        },
        metadata: {
          jobCount: jobs.length,
          keyword,
        },
      });

      // TODO: Implement email sending logic here if notificationMethod is 'EMAIL' or 'BOTH'
      logger.info(`Successfully created daily job alert notification for user ${recipientId}`);
      break;
    }
    default:
      logger.warn('Unknown notification type:', payload.type);
  }
};
