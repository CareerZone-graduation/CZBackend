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
 * Get notifications for a user with pagination and filtering
 * @param {string} userId - The ID of the user
 * @param {object} options - Query options (page, limit, type, isRead, search)
 * @returns {Promise<object>} - A promise that resolves to an object containing notifications and pagination metadata
 */
export const getNotifications = async (userId, options = {}) => {
  const page = parseInt(options.page, 10) || 1;
  const limit = parseInt(options.limit, 10) || 10;
  const skip = (page - 1) * limit;

  const query = { userId };

  // // Filter by type
  // if (options.type) {
  //   query.type = options.type;
  // }

  // Filter by read status
  if (options.isRead !== undefined) {
    query.isRead = options.isRead === 'true' || options.isRead === true;
  }

  // Search by title or message
  // if (options.search) {
  //   query.$or = [
  //     { title: { $regex: options.search, $options: 'i' } },
  //     { message: { $regex: options.search, $options: 'i' } }
  //   ];
  // }

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
    { _id: notificationId, userId },
    { 
      isRead: true,
      readAt: new Date()
    },
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
    { userId, isRead: false },
    { 
      isRead: true,
      readAt: new Date()
    }
  );

  return result;
};

/**
 * Create a notification directly (for immediate database storage)
 * @param {object} notificationData - The notification data
 * @returns {Promise<Notification>} - A promise that resolves to the created notification
 */
export const createNotification = async (notificationData) => {
  try {
    const {
      userId,
      title,
      message,
      type = 'system',
      relatedId = null,
      metadata = {}
    } = notificationData;

    const notification = await Notification.create({
      userId: new mongoose.Types.ObjectId(userId),
      title,
      message,
      type,
      entity: relatedId ? {
        type: getEntityTypeFromNotificationType(type),
        id: relatedId
      } : undefined,
      metadata
    });

    logger.info(`Successfully created notification for user ${userId}: ${title}`);
    return notification;
  } catch (error) {
    logger.error('Failed to create notification:', error);
    throw error;
  }
};

/**
 * Helper function to determine entity type from notification type
 * @param {string} notificationType - The type of notification
 * @returns {string} - The entity type
 */
const getEntityTypeFromNotificationType = (notificationType) => {
  const typeMapping = {
    'INTERVIEW_RESCHEDULE': 'InterviewRoom',
    'INTERVIEW_CANCEL': 'InterviewRoom',
    'INTERVIEW_COMPLETE': 'InterviewRoom',
    'INTERVIEW_REMINDER': 'InterviewRoom',
    'APPLICATION_STATUS_UPDATE': 'Application',
    'JOB_ALERT': 'Job',
    'SYSTEM': 'System'
  };
  
  return typeMapping[notificationType] || 'System';
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
    case 'SCHEDULED_INTERVIEW':
      return `Lịch phỏng vấn của bạn cho vị trí ${jobTitle} đã được lên lịch.`;
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
    case 'INTERVIEW_RESCHEDULE': {
      const { recipientId, data } = payload;
      const { interviewId, oldTime, newTime, message } = data;

      if (!recipientId || !interviewId) {
        logger.warn('INTERVIEW_RESCHEDULE payload is missing required fields.', payload);
        return;
      }

      // Format thời gian hiển thị
      const oldTimeFormatted = new Date(oldTime).toLocaleString('vi-VN', {
        dateStyle: 'short',
        timeStyle: 'short'
      });
      const newTimeFormatted = new Date(newTime).toLocaleString('vi-VN', {
        dateStyle: 'short', 
        timeStyle: 'short'
      });

      const title = '📅 Lịch phỏng vấn đã được thay đổi';
      const notificationMessage = `Lịch phỏng vấn đã được dời từ ${oldTimeFormatted} sang ${newTimeFormatted}.${message ? ` Lý do: ${message}` : ''}`;

      await Notification.create({
        userId: new mongoose.Types.ObjectId(recipientId),
        title,
        message: notificationMessage,
        type: 'interview',
        entity: {
          type: 'InterviewRoom',
          id: interviewId,
        },
        metadata: {
          interviewId,
          oldTime: new Date(oldTime),
          newTime: new Date(newTime),
          rescheduleReason: message,
          actionType: 'RESCHEDULE'
        },
      });

      logger.info(`Successfully created interview reschedule notification for user ${recipientId}, interview ${interviewId}`);
      break;
    }
    case 'INTERVIEW_CANCEL': {
      const { recipientId, data } = payload;
      const { interviewId, scheduledTime, message } = data;

      if (!recipientId || !interviewId) {
        logger.warn('INTERVIEW_CANCEL payload is missing required fields.', payload);
        return;
      }

      const scheduledTimeFormatted = new Date(scheduledTime).toLocaleString('vi-VN', {
        dateStyle: 'short',
        timeStyle: 'short'
      });

      const title = '❌ Lịch phỏng vấn đã bị hủy';
      const notificationMessage = `Cuộc phỏng vấn đã bị hủy. Thời gian đã định: ${scheduledTimeFormatted}. ${message || 'Vui lòng liên hệ nhà tuyển dụng để biết thêm thông tin.'}`;

      await Notification.create({
        userId: new mongoose.Types.ObjectId(recipientId),
        title,
        message: notificationMessage,
        type: 'interview',
        entity: {
          type: 'InterviewRoom',
          id: interviewId,
        },
        metadata: {
          interviewId,
          scheduledTime: new Date(scheduledTime),
          cancelReason: message,
          actionType: 'CANCEL'
        },
      });

      logger.info(`Successfully created interview cancel notification for user ${recipientId}, interview ${interviewId}`);
      break;
    }
    case 'INTERVIEW_COMPLETE': {
      const { recipientId, data } = payload;
      const { interviewId, duration, recruiterName, jobTitle, companyName, startTime, endTime } = data;

      if (!recipientId || !interviewId) {
        logger.warn('INTERVIEW_COMPLETE payload is missing required fields.', payload);
        return;
      }

      const title = '✅ Phỏng vấn đã hoàn thành';
      const notificationMessage = `Cuộc phỏng vấn cho vị trí "${jobTitle || 'Vị trí ứng tuyển'}" tại ${companyName || 'Công ty'} đã hoàn thành. Thời lượng: ${duration} phút. Cảm ơn bạn đã tham gia phỏng vấn!`;

      await Notification.create({
        userId: new mongoose.Types.ObjectId(recipientId),
        title,
        message: notificationMessage,
        type: 'interview',
        entity: {
          type: 'InterviewRoom',
          id: interviewId,
        },
        metadata: {
          interviewId,
          duration,
          recruiterName,
          jobTitle,
          companyName,
          startTime: new Date(startTime),
          endTime: new Date(endTime),
          actionType: 'COMPLETE'
        },
      });

      logger.info(`Successfully created interview complete notification for user ${recipientId}, interview ${interviewId}`);
      break;
    }
    case 'INTERVIEW_REMINDER': {
      const { recipientId, data } = payload;
      const { interviewId, scheduledTime, minutesBefore, candidateName, recruiterName, jobTitle, companyName } = data;

      if (!recipientId || !interviewId) {
        logger.warn('INTERVIEW_REMINDER payload is missing required fields.', payload);
        return;
      }

      const scheduledTimeFormatted = new Date(scheduledTime).toLocaleString('vi-VN', {
        dateStyle: 'short',
        timeStyle: 'short'
      });

      const title = '⏰ Nhắc nhở phỏng vấn';
      const notificationMessage = `Bạn có lịch phỏng vấn cho vị trí "${jobTitle || 'Vị trí ứng tuyển'}" tại ${companyName || 'Công ty'} vào ${scheduledTimeFormatted} (${minutesBefore || 30} phút nữa). Vui lòng chuẩn bị sẵn sàng!`;

      await Notification.create({
        userId: new mongoose.Types.ObjectId(recipientId),
        title,
        message: notificationMessage,
        type: 'interview',
        entity: {
          type: 'InterviewRoom',
          id: interviewId,
        },
        metadata: {
          interviewId,
          scheduledTime: new Date(scheduledTime),
          minutesBefore: minutesBefore || 30,
          recruiterName,
          jobTitle,
          companyName,
          actionType: 'REMINDER'
        },
      });

      logger.info(`Successfully created interview reminder notification for user ${recipientId}, interview ${interviewId}`);
      break;
    }
    default:
      logger.warn('Unknown notification type:', payload.type);
  }
};
