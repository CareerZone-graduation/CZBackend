import { Notification, Application, User, Job, InterviewRoom } from '../models/index.js';
import { NotFoundError, BadRequestError } from '../utils/AppError.js';
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
  const limit = Math.min(parseInt(options.limit, 10) || 10, 50); // Giới hạn tối đa 50
  const skip = (page - 1) * limit;

  const query = { userId };

  // Filter by read status
  if (options.isRead !== undefined) {
    query.isRead = options.isRead === 'true' || options.isRead === true;
  }


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
      limit
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
 * Get unread notification count for a user
 * @param {string} userId - The ID of the user
 * @returns {Promise<number>} - A promise that resolves to the count of unread notifications
 */
export const getUnreadNotificationCount = async (userId) => {
  const count = await Notification.countDocuments({ 
    userId, 
    isRead: false 
  });
  
  return count;
};

/**
 * Create a notification with enhanced metadata
 * @param {object} notificationData - The notification data
 * @returns {Promise<Notification>} - A promise that resolves to the created notification
 */
export const createNotificationWithMetadata = async (notificationData) => {
  try {
    const {
      userId,
      title,
      message,
      type,
      entityId = null,
      metadata = {}
    } = notificationData;

    // Validate required fields
    if (!userId || !title || !message || !type) {
      throw new BadRequestError('Thiếu thông tin bắt buộc để tạo thông báo.');
    }

    const notification = await Notification.create({
      userId: new mongoose.Types.ObjectId(userId),
      title,
      message,
      type,
      entity: entityId ? {
        type: getEntityTypeFromNotificationType(type),
        id: new mongoose.Types.ObjectId(entityId)
      } : undefined,
      metadata: await enhanceMetadata(type, metadata, entityId)
    });

    logger.info(`Successfully created notification for user ${userId}: ${title}`);
    return notification;
  } catch (error) {
    logger.error('Failed to create notification:', error);
    throw error;
  }
};

/**
 * Enhance metadata based on notification type and entityId
 * @param {string} type - Notification type
 * @param {object} baseMetadata - Base metadata
 * @param {string} entityId - Related entity ID
 * @returns {Promise<object>} - Enhanced metadata
 */
const enhanceMetadata = async (type, baseMetadata, entityId) => {
  try {
    let enhancedMetadata = { ...baseMetadata };

    switch (type) {
      case 'application':
        if (entityId) {
          const application = await Application.findById(entityId)
            .populate('jobId', 'title company')
            .lean();
          
          if (application) {
            enhancedMetadata = {
              ...enhancedMetadata,
              applicationId: application._id.toString(),
              jobId: application.jobId._id.toString(),
              jobTitle: application.jobSnapshot?.title || application.jobId?.title || 'N/A',
              companyName: application.jobSnapshot?.company?.name || application.jobId?.company?.name || 'N/A',
              companyLogo: application.jobSnapshot?.company?.logo || application.jobId?.company?.logo
            };
          }
        }
        break;

      case 'interview':
        if (entityId) {
          const interview = await InterviewRoom.findById(entityId)
            .populate({
              path: 'applicationId',
              populate: {
                path: 'jobId',
                select: 'title company'
              }
            })
            .lean();
          
          if (interview) {
            enhancedMetadata = {
              ...enhancedMetadata,
              interviewId: interview._id.toString(),
              applicationId: interview.applicationId?._id?.toString(),
              jobTitle: interview.applicationId?.jobSnapshot?.title || interview.applicationId?.jobId?.title || 'N/A',
              companyName: interview.applicationId?.jobSnapshot?.company?.name || interview.applicationId?.jobId?.company?.name || 'N/A',
              scheduledTime: interview.scheduledTime?.toISOString()
            };
          }
        }
        break;

      case 'job_alert':
        // Job alert metadata is usually provided by the caller
        break;

      default:
        // Keep base metadata as is
        break;
    }

    return enhancedMetadata;
  } catch (error) {
    logger.warn('Failed to enhance metadata:', error);
    return baseMetadata; // Return base metadata if enhancement fails
  }
};

/**
 * Helper function to determine entity type from notification type
 * @param {string} notificationType - The type of notification
 * @returns {string} - The entity type
 */
const getEntityTypeFromNotificationType = (notificationType) => {
  const typeMapping = {
    'application': 'Application',
    'interview': 'InterviewRoom',
    'job_alert': 'Job',
    'recommendation': 'Job',
    'profile_view': 'RecruiterProfile',
    'system': 'System'
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
    case 'APPLICATION_UPDATE': {
      const { recipientId, data } = payload;
      const { action, applicationId, jobTitle, companyName } = data;

      if (!recipientId || !applicationId || !action) {
        logger.warn('APPLICATION_UPDATE payload is missing required fields.', payload);
        return;
      }

      let title, message, metadata;

      switch (action) {
        case 'RATING_UPDATE': {
          const { newRating } = data;
          title = 'Cập nhật trạng thái ứng tuyển';
          const ratingMessage = newRating === "NOT_RATED" ? "chưa được đánh giá" :
            newRating === "NOT_SUITABLE" ? "không phù hợp" :
            newRating === "MAYBE" ? "có thể phù hợp" :
            newRating === "SUITABLE" ? "phù hợp" :
            newRating === "PERFECT_MATCH" ? "rất phù hợp" : newRating;
          message = `Nhà tuyển dụng đã đánh giá hồ sơ của bạn cho vị trí "${jobTitle}" là: ${ratingMessage}.`;
          metadata = {
            applicationId: applicationId.toString(),
            jobTitle: jobTitle || 'N/A',
            companyName: companyName || 'N/A',
            actionType: 'RATING_UPDATE',
            newRating
          };
          break;
        }

        case 'INTERVIEW_SCHEDULED': {
          const { scheduledTime } = data;
          const scheduledTimeFormatted = new Date(scheduledTime).toLocaleString('vi-VN', {
            dateStyle: 'short',
            timeStyle: 'short'
          });

          title = 'Cập nhật trạng thái ứng tuyển';
          message = `Bạn có lịch phỏng vấn cho vị trí "${jobTitle}" tại ${companyName || 'Công ty'} vào ${scheduledTimeFormatted}. Vui lòng chuẩn bị sẵn sàng!`;
          
          metadata = {
            applicationId: applicationId.toString(),
            jobTitle: jobTitle || 'N/A',
            companyName: companyName || 'N/A',
            actionType: 'INTERVIEW_SCHEDULED',
            scheduledTime: new Date(scheduledTime).toISOString()
          };
          break;
        }

        case 'INTERVIEW_RESCHEDULED': {
          const { scheduledTime } = data;
          const scheduledTimeFormatted = new Date(scheduledTime).toLocaleString('vi-VN', {
            dateStyle: 'short',
            timeStyle: 'short'
          });

          title = 'Cập nhật trạng thái ứng tuyển';
          message = `Lịch phỏng vấn cho vị trí "${jobTitle}" tại ${companyName || 'Công ty'} đã được dời sang ${scheduledTimeFormatted}.`;

          metadata = {
            applicationId: applicationId.toString(),
            jobTitle: jobTitle || 'N/A',
            companyName: companyName || 'N/A',
            actionType: 'INTERVIEW_RESCHEDULED',
            scheduledTime: new Date(scheduledTime).toISOString()
          };
          break;
        }

        case 'INTERVIEW_CANCELLED': {
          title = 'Cập nhật trạng thái ứng tuyển';
          message = `Cuộc phỏng vấn cho vị trí "${jobTitle}" tại ${companyName || 'Công ty'} đã bị hủy. Vui lòng liên hệ nhà tuyển dụng để biết thêm thông tin.`;

          metadata = {
            applicationId: applicationId.toString(),
            jobTitle: jobTitle || 'N/A',
            companyName: companyName || 'N/A',
            actionType: 'INTERVIEW_CANCELLED'
          };
          break;
        }

        default: {
          break;
        }
      }

      await Notification.create({
        userId: new mongoose.Types.ObjectId(recipientId),
        title,
        message,
        type: 'application',
        entity: {
          type: 'Application',
          id: applicationId,
        },
        metadata
      });

      logger.info(`Successfully created application ${action} notification for user ${recipientId}, application ${applicationId}`);
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
          interviewId: interviewId.toString(),
          jobTitle: jobTitle || 'N/A',
          companyName: companyName || 'N/A',
          actionType: 'REMINDER',
          scheduledTime: new Date(scheduledTime).toISOString(),
          minutesBefore: minutesBefore || 30,
          recruiterName,
          candidateName
        },
      });

      logger.info(`Successfully created interview reminder notification for user ${recipientId}, interview ${interviewId}`);
      break;
    }

    case 'PROFILE_VIEW': {
      const { recipientId, data } = payload;
      const { recruiterProfileId, companyId, companyName, companyLogo } = data;

      if (!recipientId || !recruiterProfileId) {
        logger.warn('PROFILE_VIEW payload is missing required fields.', payload);
        return;
      }

      const title = '👀 Hồ sơ của bạn đã được xem';
      const notificationMessage = `Nhà tuyển dụng từ ${companyName || 'Một công ty'} vừa xem hồ sơ của bạn.`;

      await Notification.create({
        userId: new mongoose.Types.ObjectId(recipientId),
        title,
        message: notificationMessage,
        type: 'profile_view',
        entity: {
          type: 'RecruiterProfile',
          id: recruiterProfileId,
        },
        metadata: {
          recruiterProfileId: recruiterProfileId.toString(),
          companyId: companyId?.toString(),
          companyName: companyName || 'N/A',
          companyLogo
        },
      });

      logger.info(`Successfully created profile view notification for user ${recipientId}`);
      break;
    }

    case 'JOB_RECOMMENDATION': {
      const { recipientId, data } = payload;
      const { reason, source, jobIds } = data;

      if (!recipientId || !jobIds || jobIds.length === 0) {
        logger.warn('JOB_RECOMMENDATION payload is missing required fields.', payload);
        return;
      }

      const title = '🎯 Gợi ý việc làm phù hợp';
      const notificationMessage = `Chúng tôi đã tìm thấy ${jobIds.length} công việc phù hợp với bạn. ${reason || ''}`;

      await Notification.create({
        userId: new mongoose.Types.ObjectId(recipientId),
        title,
        message: notificationMessage,
        type: 'recommendation',
        metadata: {
          reason: reason || 'Dựa trên hồ sơ và sở thích của bạn',
          source: source || 'AI_MATCHING',
          jobIds: jobIds.map(id => id.toString())
        },
      });

      logger.info(`Successfully created job recommendation notification for user ${recipientId}`);
      break;
    }

    case 'SYSTEM_NOTIFICATION': {
      const { recipientId, data } = payload;
      const { actionType, entityId, entityTitle, link, icon, actionText, customTitle, customMessage } = data;

      if (!recipientId) {
        logger.warn('SYSTEM_NOTIFICATION payload is missing recipientId.', payload);
        return;
      }

      const title = customTitle || getSystemNotificationTitle(actionType);
      const message = customMessage || getSystemNotificationMessage(actionType, entityTitle);

      await Notification.create({
        userId: new mongoose.Types.ObjectId(recipientId),
        title,
        message,
        type: 'system',
        entity: entityId ? {
          type: getEntityTypeFromActionType(actionType),
          id: entityId,
        } : undefined,
        metadata: {
          actionType,
          entityId: entityId?.toString(),
          entityTitle,
          link,
          icon: icon || 'info',
          actionText
        },
      });

      logger.info(`Successfully created system notification for user ${recipientId}`);
      break;
    }

    default:
      logger.warn('Unknown notification type:', payload.type);
  }
};

/**
 * Helper function to get system notification title
 * @param {string} actionType - The action type
 * @returns {string} - The notification title
 */
const getSystemNotificationTitle = (actionType) => {
  const titleMapping = {
    'JOB_APPROVED': '✅ Tin đăng đã được duyệt',
    'JOB_REJECTED': '❌ Tin đăng bị từ chối',
    'COMPANY_VERIFIED': '🎉 Công ty đã được xác thực',
    'ACCOUNT_VERIFIED': '✅ Tài khoản đã được xác thực'
  };
  
  return titleMapping[actionType] || '📢 Thông báo hệ thống';
};

/**
 * Helper function to get system notification message
 * @param {string} actionType - The action type
 * @param {string} entityTitle - The entity title
 * @returns {string} - The notification message
 */
const getSystemNotificationMessage = (actionType, entityTitle) => {
  const messageMapping = {
    'JOB_APPROVED': `Tin tuyển dụng "${entityTitle}" của bạn đã được admin phê duyệt và hiển thị công khai.`,
    'JOB_REJECTED': `Tin tuyển dụng "${entityTitle}" của bạn đã bị từ chối. Vui lòng kiểm tra và chỉnh sửa lại.`,
    'COMPANY_VERIFIED': `Công ty "${entityTitle}" đã được xác thực thành công. Bạn có thể sử dụng đầy đủ các tính năng dành cho nhà tuyển dụng.`,
    'ACCOUNT_VERIFIED': 'Tài khoản của bạn đã được xác thực thành công. Chào mừng bạn đến với CareerZone!'
  };
  
  return messageMapping[actionType] || 'Bạn có thông báo mới từ hệ thống.';
};

/**
 * Helper function to get entity type from action type
 * @param {string} actionType - The action type
 * @returns {string} - The entity type
 */
const getEntityTypeFromActionType = (actionType) => {
  const typeMapping = {
    'JOB_APPROVED': 'Job',
    'JOB_REJECTED': 'Job',
    'COMPANY_VERIFIED': 'RecruiterProfile',
    'ACCOUNT_VERIFIED': 'User'
  };
  
  return typeMapping[actionType] || 'System';
};
