import { Notification, Application, User, Job, InterviewRoom, CandidateProfile } from '../models/index.js';
import { NotFoundError, BadRequestError } from '../utils/AppError.js';
import logger from '../utils/logger.js';
import mongoose from 'mongoose';
import { logActivity } from './application.service.js';
import e, { application } from 'express';

// =================================================================
// Chức năng CRUD Thông báo
// =================================================================


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

export const getUnreadNotificationCount = async (userId) => {
  const count = await Notification.countDocuments({ 
    userId, 
    isRead: false 
  });
  
  return count;
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

// =================================================================
// Các Hàm Logic Nghiệp Vụ Cốt Lõi (Pure Business Logic Functions)
// =================================================================

/**
 * Tạo thông báo xác nhận cho ứng viên khi nộp đơn thành công.
 */
export const createApplicationSubmittedNotification = async (applicationId) => {

    // lấy userId từ applicationId
    const application = await Application.findById(applicationId);
    const candidateProfileId = application.candidateProfileId;
    const candidateId = await CandidateProfile.findById(candidateProfileId).select('userId').userId;
    const notification = await Notification.create({
      userId: new mongoose.Types.ObjectId(candidateId),
      title:"Nộp đơn thành công",
      message: `Bạn đã nộp đơn thành công vào vị trí "${application.jobSnapshot.title}" tại ${application.jobSnapshot.company}.`,
      type: 'application',
      entity: {
        type: "Application",
        id: new mongoose.Types.ObjectId(applicationId)
      },
      metadata: {
        applicationId: applicationId.toString(),
      }
    });

};

export const createRatingUpdateNotification = async (applicationId, newRating) => {
  const application = await Application.findById(applicationId);
  const candidateProfileId = application.candidateProfileId;
  const candidateId = await CandidateProfile.findById(candidateProfileId).select('userId').userId;
  const ratingMessage = newRating === "NOT_RATED" ? "chưa được đánh giá" :
        newRating === "NOT_SUITABLE" ? "không phù hợp" :
        newRating === "MAYBE" ? "có thể phù hợp" :
        newRating === "SUITABLE" ? "phù hợp" :
        newRating === "PERFECT_MATCH" ? "rất phù hợp" : newRating;
  const notification = await Notification.create({
    userId: new mongoose.Types.ObjectId(candidateId),
    title: "Cập nhật trạng thái đơn ứng tuyển",
    message: `Nhà tuyển dụng đã đánh giá hồ sơ của bạn cho vị trí "${application.jobSnapshot.title}" tại ${application.jobSnapshot.company} là: ${ratingMessage}.`,
    type: 'application',
    entity: {
      type: "Application",
      id: new mongoose.Types.ObjectId(applicationId)
    },
    metadata: {
      applicationId: applicationId.toString(),
    }
  });
}


export const createInterviewScheduledNotification = async (applicationId, interviewId) => {
  const application = await Application.findById(applicationId);
  const interview = await InterviewRoom.findById(interviewId);
  const candidateProfileId = application.candidateProfileId;
  const candidateId = await CandidateProfile.findById(candidateProfileId).select('userId').userId;

  const notification = await Notification.create({
    userId: new mongoose.Types.ObjectId(candidateId),
    title: "Lịch phỏng vấn đã được lên lịch",
    message: `Bạn có một lịch phỏng vấn cho vị trí "${application.jobSnapshot.title}" tại ${application.jobSnapshot.company}.`,
    type: 'interview',
    entity: {
      type: "InterviewRoom",
      id: new mongoose.Types.ObjectId(interviewId)
    },
    metadata: {
      interviewId: interviewId.toString()
    }
  });

};

// createInterviewRescheduledNotification
export const createInterviewRescheduledNotification = async (interviewId, newScheduledTime) => {

  if (!interviewId || !newScheduledTime) {
    logger.warn('INTERVIEW_RESCHEDULED payload is missing required fields.', { interviewId, newScheduledTime });
    throw new BadRequestError('Thiếu thông tin bắt buộc để tạo thông báo.');
  }

  const interview = await InterviewRoom.findById(interviewId);
  if (!interview) {
    logger.warn('INTERVIEW_RESCHEDULED - Interview not found', { interviewId });
    throw new NotFoundError('Cuộc phỏng vấn không tồn tại.');
  }

  const notification = await Notification.create({
    userId: new mongoose.Types.ObjectId(interview.candidateId),
    title: "Lịch phỏng vấn đã được dời",
    message: `Lịch phỏng vấn: "${interview.roomName}" đã được dời sang ${newScheduledTime}.`,
    type: 'interview',
    entity: {
      type: "InterviewRoom",
      id: new mongoose.Types.ObjectId(interviewId)
    },
    metadata: {
      interviewId: interviewId.toString()
    }
  });

};


// notificationService.createInterviewCanceledNotification
export const createInterviewCanceledNotification = async (interviewId) => {
  const interview = await InterviewRoom.findById(interviewId);
  if (!interview) {
    logger.warn('INTERVIEW_CANCELED - Interview not found', { interviewId });
    throw new NotFoundError('Cuộc phỏng vấn không tồn tại.');
  }

  const notification = await Notification.create({
    userId: new mongoose.Types.ObjectId(interview.candidateId),
    title: "Lịch phỏng vấn đã bị hủy",
    message: `Lịch phỏng vấn: "${interview.roomName}" đã bị hủy.`,
    type: 'interview',
    entity: {
      type: "InterviewRoom",
      id: new mongoose.Types.ObjectId(interviewId)
    },
    metadata: {
      interviewId: interviewId.toString()
    }
  });

};



/**
 * Tạo thông báo nhắc nhở phỏng vấn.
 * @param {object} interviewId - Dữ liệu từ worker
 * @returns {Promise<Notification>} - Thông báo đã tạo
 */
export const createInterviewReminderNotification = async (interviewId) => {
  const interview = await InterviewRoom.findById(interviewId);
  const scheduledTime = interview.scheduledTime;
  const scheduledTimeFormatted = new Date(scheduledTime).toLocaleString('vi-VN', {
    dateStyle: 'short',
    timeStyle: 'short'
  });

  const title = '⏰ Nhắc nhở phỏng vấn';
  const message = interview.roomName + ` sẽ bắt đầu vào ${scheduledTimeFormatted}. Vui lòng chuẩn bị sẵn sàng!`;

  const notificationForCandidate = await Notification.create({
    userId: new mongoose.Types.ObjectId(interview.candidateId),
    title,
    message,
    type: 'interview',
    entity: {
      type: 'InterviewRoom',
      id: interviewId,
    },
    metadata: {
      interviewId: interviewId.toString()
    },
  });
  const notificationForRecruiter = await Notification.create({
    userId: new mongoose.Types.ObjectId(interview.recruiterId),
    title,
    message,
    type: 'interview',
    entity: {
      type: 'InterviewRoom',
      id: interviewId,
    },
    metadata: {
      interviewId: interviewId.toString()
    },
  });
  interview.isReminderSent = true;
  await interview.save();
};

/**
 * Tạo thông báo khi hồ sơ được xem.
 * @param {object} payload - Dữ liệu từ worker
 * @returns {Promise<Notification>} - Thông báo đã tạo
 */
export const createProfileViewNotification = async (payload) => {
  const { recipientId, data } = payload;
  const { recruiterProfileId, companyId, companyName, companyLogo } = data;

  if (!recipientId || !recruiterProfileId) {
    logger.warn('PROFILE_VIEW payload is missing required fields.', payload);
    throw new BadRequestError('Thiếu thông tin bắt buộc để tạo thông báo.');
  }

  const title = '👀 Hồ sơ của bạn đã được xem';
  const message = `Nhà tuyển dụng từ ${companyName || 'Một công ty'} vừa xem hồ sơ của bạn.`;

  return await Notification.create({
    userId: new mongoose.Types.ObjectId(recipientId),
    title,
    message,
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
};

/**
 * Tạo thông báo gợi ý việc làm.
 * @param {object} payload - Dữ liệu từ worker
 * @returns {Promise<Notification>} - Thông báo đã tạo
 */
export const createJobRecommendationNotification = async (payload) => {
  const { recipientId, data } = payload;
  const { reason, source, jobIds } = data;

  if (!recipientId || !jobIds || jobIds.length === 0) {
    logger.warn('JOB_RECOMMENDATION payload is missing required fields.', payload);
    throw new BadRequestError('Thiếu thông tin bắt buộc để tạo thông báo.');
  }

  const title = '🎯 Gợi ý việc làm phù hợp';
  const message = `Chúng tôi đã tìm thấy ${jobIds.length} công việc phù hợp với bạn. ${reason || ''}`;

  return await Notification.create({
    userId: new mongoose.Types.ObjectId(recipientId),
    title,
    message,
    type: 'recommendation',
    metadata: {
      reason: reason || 'Dựa trên hồ sơ và sở thích của bạn',
      source: source || 'AI_MATCHING',
      jobIds: jobIds.map(id => id.toString())
    },
  });
};

/**
 * Tạo thông báo hệ thống.
 * @param {object} payload - Dữ liệu từ worker
 * @returns {Promise<Notification>} - Thông báo đã tạo
 */
export const createSystemNotification = async (payload) => {
  const { recipientId, data } = payload;
  const { actionType, entityId, entityTitle, link, icon, actionText, customTitle, customMessage } = data;

  if (!recipientId) {
    logger.warn('SYSTEM_NOTIFICATION payload is missing recipientId.', payload);
    throw new BadRequestError('Thiếu thông tin bắt buộc để tạo thông báo.');
  }

  const title = customTitle || getSystemNotificationTitle(actionType);
  const message = customMessage || getSystemNotificationMessage(actionType, entityTitle);

  return await Notification.create({
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
};

/**
 * Hàm wrapper để xử lý backward compatibility với logic cũ.
 * Worker sẽ gọi hàm này cho các message với format cũ.
 * @param {object} payload - Dữ liệu message theo format cũ
 * @returns {Promise<Notification>} - Thông báo đã tạo
 */
export const processLegacyNotification = async (payload) => {
  logger.info('Processing legacy notification:', payload);

  try {
    switch (payload.type) {
      case 'APPLICATION_UPDATE':
        return await createApplicationUpdateNotification(payload);
      
      case 'INTERVIEW_REMINDER':
        return await createInterviewReminderNotification(payload);
      
      case 'PROFILE_VIEW':
        return await createProfileViewNotification(payload);
      
      case 'JOB_RECOMMENDATION':
        return await createJobRecommendationNotification(payload);
      
      case 'SYSTEM_NOTIFICATION':
        return await createSystemNotification(payload);
      
      default:
        logger.warn('Unknown legacy notification type:', payload.type);
        throw new BadRequestError(`Unknown notification type: ${payload.type}`);
    }
  } catch (error) {
    logger.error('Error processing legacy notification:', error);
    throw error;
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

// =================================================================
// Chức năng Thông báo Gộp nhóm cho Nhà tuyển dụng
// =================================================================

/**
 * Upsert thông báo gộp cho nhà tuyển dụng khi có ứng viên mới.
 * Sử dụng pipeline update của MongoDB để đảm bảo tính nguyên tử và hiệu suất.
 * Đây là pure business logic function, được gọi từ worker.
 * @param {object} payload - Dữ liệu từ RabbitMQ { recruiterUserId, job, application }.
 * @returns {Promise<Notification>} - Thông báo đã upsert
 */
export const upsertRecruiterApplicantsRollup = async (payload) => {
  try {
    logger.info('Processing recruiter applicants rollup:', {
      recruiterUserId: payload.recruiterUserId,
      jobId: payload.job?._id,
      applicationId: payload.application?._id
    });
    
    const { recruiterUserId, job, application } = payload;
    
    // Validate input data
    if (!recruiterUserId || !job || !application) {
      logger.error('Missing required data in payload:', { 
        recruiterUserId, 
        jobId: job?._id, 
        applicationId: application?._id 
      });
      throw new BadRequestError('Thiếu thông tin bắt buộc để tạo thông báo gộp.');
    }

    const aggregationKey = `job:${job._id}:applicants`;
    const now = new Date();
    const candidateProfileId = application.candidateProfileId;
    const candidateName = application.candidateName || 'Ứng viên';

    const newApplicant = {
      candidateProfileId,
      candidateName,
      appliedAt: now,
    };

    // Sử dụng findOneAndUpdate với pipeline update để thực hiện logic phức tạp trong 1 lệnh
    const updatedNotification = await Notification.findOneAndUpdate(
      {
        userId: new mongoose.Types.ObjectId(recruiterUserId),
        type: 'job_applicants_rollup',
        aggregationKey,
      },
      [ // Mở đầu pipeline
        {
          $set: {
            title: `Có ứng viên mới cho vị trí "${job.title}"`,
            isRead: false,
            readAt: null, // Reset thời gian đọc
            'metadata.jobId': new mongoose.Types.ObjectId(job._id),
            'metadata.jobTitle': job.title,
            'metadata.companyName': job.recruiterProfileId?.company?.name || 'Công ty',
            'metadata.lastAppliedAt': now,
            // Dùng $setUnion để thêm ID mới và đảm bảo không trùng lặp
            'metadata.applicantIds': {
              $setUnion: [{ $ifNull: ['$metadata.applicantIds', []] }, [new mongoose.Types.ObjectId(candidateProfileId)]]
            },
            // Thêm ứng viên mới vào đầu danh sách và chỉ giữ lại 2 người gần nhất
            'metadata.latestApplicants': {
              $slice: [
                { $concatArrays: [[newApplicant], { $ifNull: ['$metadata.latestApplicants', []] }] },
                2
              ]
            }
          }
        },
        { // Giai đoạn 2: Cập nhật tổng số và message dựa trên dữ liệu đã cập nhật ở trên
          $set: {
            'metadata.totalApplicants': { $size: '$metadata.applicantIds' },
            message: { // Logic tạo message động ngay trong query
               $let: {
                  vars: {
                     total: { $size: '$metadata.applicantIds' },
                     names: { $map: { input: '$metadata.latestApplicants', as: 'applicant', in: '$$applicant.candidateName' } }
                  },
                  in: {
                     $switch: {
                        branches: [
                           { case: { $eq: [ "$$total", 1 ] }, then: { $concat: [ { $arrayElemAt: [ "$$names", 0 ] }, ` đã nộp đơn vào vị trí "${job.title}" của bạn.` ] } },
                           { case: { $eq: [ "$$total", 2 ] }, then: { $concat: [ { $arrayElemAt: [ "$$names", 0 ] }, ", ", { $arrayElemAt: [ "$$names", 1 ] }, ` đã nộp đơn vào vị trí "${job.title}" của bạn.` ] } }
                        ],
                        default: { $concat: [ { $arrayElemAt: [ "$$names", 0 ] }, ", ", { $arrayElemAt: [ "$$names", 1 ] }, " và ", { $toString: { $subtract: [ "$$total", 2 ] } }, ` người khác đã nộp đơn vào vị trí "${job.title}" của bạn.` ] }
                     }
                  }
               }
            }
          }
        }
      ], // Kết thúc pipeline
      { upsert: true, new: true }
    ).lean();

    logger.info(`Successfully upserted rollup notification for recruiter ${recruiterUserId}`, {
      jobId: job._id,
      totalApplicants: updatedNotification?.metadata?.totalApplicants || 1,
      notificationId: updatedNotification?._id
    });
    
    return updatedNotification;
  } catch (error) {
    logger.error('Error in upsertRecruiterApplicantsRollup:', error);
    throw error;
  }
};
