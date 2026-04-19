import config from '../config/index.js';
import * as emailService from './email.service.js';
import admin from '../config/firebase.js';
import { Notification, Application, User, Job, InterviewRoom, CandidateProfile, JobAlertSubscription, RecruiterProfile } from '../models/index.js';
import { NotFoundError, BadRequestError } from '../utils/AppError.js';
import logger from '../utils/logger.js';
import mongoose from 'mongoose';
import { logActivity } from './application.service.js';


/**
 * Gửi và lưu thông báo
 * @param {string} userId - ID của người dùng nhận
 * @param {object} payload - Nội dung thông báo
 * @param {string} payload.title - Tiêu đề
 * @param {string} payload.body - Nội dung
 * @param {string} payload.type - Loại thông báo
 * @param {object} [payload.data] - Dữ liệu kèm theo (vd: link điều hướng)
 */
export async function pushNotification(userId, payload) {
  try {
    // --- BƯỚC 1: LƯU VÀO DATABASE ---
    // --- BƯỚC 2: PUSH NOTIFICATION ---
    const user = await User.findById(userId);
    if (!user || !user.fcmTokens || user.fcmTokens.length === 0) {
      logger.info(`User ${userId} has no FCM tokens.`);
      return { success: true, message: 'Notification saved, but user has no device tokens to push.' };
    }

    const uniqueTokens = [...new Set(user.fcmTokens)];

    // Convert payload.data values to strings to satisfy FCM requirements
    const stringData = {};
    if (payload.data) {
      for (const [key, value] of Object.entries(payload.data)) {
        stringData[key] = String(value);
      }
    }

    const message = {
      // notification: { ... }, // Removed to prevent double notifications (OS + SW)
      data: {
        ...stringData,
        title: String(payload.title),
        body: String(payload.body),
        type: String(payload.type || ''), // Optional: pass type if needed
      },
      tokens: uniqueTokens,
    };

    const response = await admin.messaging().sendEachForMulticast(message);

    // --- (Optional but recommended) Bước 3: Dọn dẹp token không hợp lệ ---
    if (response.failureCount > 0) {
      const tokensToRemove = [];
      response.responses.forEach((resp, idx) => {
        if (!resp.success) {
          const error = resp.error.code;
          // Các lỗi này cho thấy token đã không còn hợp lệ
          if (error === 'messaging/invalid-registration-token' ||
            error === 'messaging/registration-token-not-registered') {
            tokensToRemove.push(user.fcmTokens[idx]);
          }
        }
      });

      if (tokensToRemove.length > 0) {
        await User.updateOne(
          { _id: userId },
          { $pullAll: { fcmTokens: tokensToRemove } }
        );
        logger.info('Removed invalid tokens:', tokensToRemove);
      }
    }

    return { success: true, response };
  } catch (error) {
    logger.error('Error sending notification:', error);
    return { success: false, error };
  }
}

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
// Các Hàm Logic Nghiệp Vụ Cốt Lõi (Pure Business Logic Functions)
// =================================================================


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
  // đồng thời push thông báo đẩy
  await pushNotification(interview.candidateId, {
    title: notification.title,
    body: notification.message,
    data: {
      url: `/interviews/${interviewId}`,
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
  // đồng thời push thông báo đẩy
  await pushNotification(interview.candidateId, {
    title: notification.title,
    body: notification.message,
    data: {
      url: `/interviews/${interviewId}`,
    }
  })

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

  // đồng thời push thông báo đẩy
  await pushNotification(interview.candidateId, {
    title,
    body: message,
    data: {
      url: `/interviews/${interviewId}`,
    }
  });
  await pushNotification(interview.recruiterId, {
    title,
    body: message,
    data: {
      url: `/interviews/${interviewId}`,
    }
  });
};

/**
 * Tạo thông báo khi phỏng vấn bắt đầu.
 * @param {string} interviewId - ID của cuộc phỏng vấn
 * @returns {Promise<void>}
 */
export const createInterviewStartedNotification = async (interviewId) => {
  const interview = await InterviewRoom.findById(interviewId)
    .populate('candidateId', 'fullName')
    .populate('recruiterId', 'fullName')
    .populate({
      path: 'applicationId',
      select: 'jobSnapshot'
    });

  if (!interview) {
    logger.warn('INTERVIEW_STARTED - Interview not found', { interviewId });
    throw new NotFoundError('Cuộc phỏng vấn không tồn tại.');
  }

  const title = '🎥 Phỏng vấn đã bắt đầu';
  const candidateMessage = `Cuộc phỏng vấn cho vị trí "${interview.applicationId?.jobSnapshot?.title}" đã bắt đầu.`;
  const recruiterMessage = candidateMessage;

  // Thông báo cho candidate
  const notificationForCandidate = await Notification.create({
    userId: new mongoose.Types.ObjectId(interview.candidateId._id),
    title,
    message: candidateMessage,
    type: 'interview',
    entity: {
      type: 'InterviewRoom',
      id: new mongoose.Types.ObjectId(interviewId)
    },
    metadata: {
      interviewId: interviewId.toString(),
      startTime: interview.startTime?.toISOString()
    }
  });

  // Thông báo cho recruiter
  const notificationForRecruiter = await Notification.create({
    userId: new mongoose.Types.ObjectId(interview.recruiterId._id),
    title,
    message: recruiterMessage,
    type: 'interview',
    entity: {
      type: 'InterviewRoom',
      id: new mongoose.Types.ObjectId(interviewId)
    },
    metadata: {
      interviewId: interviewId.toString(),
      startTime: interview.startTime?.toISOString()
    }
  });

  // Push notifications
  await pushNotification(interview.candidateId._id, {
    title,
    body: candidateMessage,
    data: {
      url: `/interviews/${interviewId}`,
    }
  });

  await pushNotification(interview.recruiterId._id, {
    title,
    body: recruiterMessage,
    data: {
      url: `/interviews/${interviewId}`,
    }
  });

  logger.info(`Interview started notifications sent for interview ${interviewId}`);
};

/**
 * Tạo thông báo khi phỏng vấn kết thúc.
 * @param {string} interviewId - ID của cuộc phỏng vấn
 * @param {number} duration - Thời lượng phỏng vấn (phút)
 * @returns {Promise<void>}
 */
export const createInterviewEndedNotification = async (interviewId, duration) => {
  const interview = await InterviewRoom.findById(interviewId)
    .populate('candidateId', 'fullName')
    .populate('recruiterId', 'fullName')
    .populate({
      path: 'applicationId',
      select: 'jobSnapshot'
    });

  if (!interview) {
    logger.warn('INTERVIEW_ENDED - Interview not found', { interviewId });
    throw new NotFoundError('Cuộc phỏng vấn không tồn tại.');
  }

  const title = '✅ Phỏng vấn đã kết thúc';
  const candidateMessage = `Cuộc phỏng vấn cho vị trí "${interview.applicationId?.jobSnapshot?.title}" đã kết thúc. Thời lượng: ${duration} phút.`;
  const recruiterMessage = candidateMessage;

  // Thông báo cho candidate
  const notificationForCandidate = await Notification.create({
    userId: new mongoose.Types.ObjectId(interview.candidateId._id),
    title,
    message: candidateMessage,
    type: 'interview',
    entity: {
      type: 'InterviewRoom',
      id: new mongoose.Types.ObjectId(interviewId)
    },
    metadata: {
      interviewId: interviewId.toString(),
      endTime: interview.endTime?.toISOString(),
      duration
    }
  });

  // Thông báo cho recruiter
  const notificationForRecruiter = await Notification.create({
    userId: new mongoose.Types.ObjectId(interview.recruiterId._id),
    title,
    message: recruiterMessage,
    type: 'interview',
    entity: {
      type: 'InterviewRoom',
      id: new mongoose.Types.ObjectId(interviewId)
    },
    metadata: {
      interviewId: interviewId.toString(),
      endTime: interview.endTime?.toISOString(),
      duration
    }
  });

  // Push notifications
  await pushNotification(interview.candidateId._id, {
    title,
    body: candidateMessage,
    data: {
      url: `/interviews/${interviewId}`,
    }
  });

  await pushNotification(interview.recruiterId._id, {
    title,
    body: recruiterMessage,
    data: {
      url: `/interviews/${interviewId}`,
    }
  });

  logger.info(`Interview ended notifications sent for interview ${interviewId}`);
};

/**
 * Tạo thông báo khi recording đã sẵn sàng.
 * @param {string} interviewId - ID của cuộc phỏng vấn
 * @param {number} recordingDuration - Thời lượng recording (giây)
 * @returns {Promise<void>}
 */
export const createRecordingAvailableNotification = async (interviewId, recordingDuration) => {
  const interview = await InterviewRoom.findById(interviewId)
    .populate('candidateId', 'fullName')
    .populate('recruiterId', 'fullName')
    .populate({
      path: 'applicationId',
      select: 'jobSnapshot'
    });

  if (!interview) {
    logger.warn('RECORDING_AVAILABLE - Interview not found', { interviewId });
    throw new NotFoundError('Cuộc phỏng vấn không tồn tại.');
  }

  const durationMinutes = Math.round(recordingDuration / 60);
  const title = '🎬 Bản ghi phỏng vấn đã sẵn sàng';
  const candidateMessage = `Bản ghi phỏng vấn cho vị trí "${interview.applicationId?.jobSnapshot?.title}" đã sẵn sàng để xem. Thời lượng: ${durationMinutes} phút.`;
  const recruiterMessage = `Bản ghi phỏng vấn với ${interview.candidateId.fullName} đã sẵn sàng để xem. Thời lượng: ${durationMinutes} phút.`;

  // Thông báo cho candidate
  const notificationForCandidate = await Notification.create({
    userId: new mongoose.Types.ObjectId(interview.candidateId._id),
    title,
    message: candidateMessage,
    type: 'interview',
    entity: {
      type: 'InterviewRoom',
      id: new mongoose.Types.ObjectId(interviewId)
    },
    metadata: {
      interviewId: interviewId.toString(),
      recordingDuration,
      recordingUrl: interview.recording?.url
    }
  });

  // Thông báo cho recruiter
  const notificationForRecruiter = await Notification.create({
    userId: new mongoose.Types.ObjectId(interview.recruiterId._id),
    title,
    message: recruiterMessage,
    type: 'interview',
    entity: {
      type: 'InterviewRoom',
      id: new mongoose.Types.ObjectId(interviewId)
    },
    metadata: {
      interviewId: interviewId.toString(),
      recordingDuration,
      recordingUrl: interview.recording?.url
    }
  });

  // Push notifications
  await pushNotification(interview.candidateId._id, {
    title,
    body: candidateMessage,
    data: {
      url: `/interviews/${interviewId}`,
    }
  });

  await pushNotification(interview.recruiterId._id, {
    title,
    body: recruiterMessage,
    data: {
      url: `/interviews/${interviewId}`,
    }
  });

  logger.info(`Recording available notifications sent for interview ${interviewId}`);
};


// TODO
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

  const notification = await Notification.create({
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

  // Gửi push notification
  await pushNotification(recipientId, {
    title,
    body: message,
    data: {
      url: `/recruiters/profile/${recruiterProfileId}`
    }
  });

  return notification;
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

  const notification = await Notification.create({
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

  // Gửi push notification
  await pushNotification(recipientId, {
    title,
    body: message,
    data: {
      url: '/jobs/recommendations'
    }
  });

  return notification;
};


// =================================================================
// Các Hàm Xử Lý Message từ Worker (Handler Functions)
// Tất cả các hàm này nhận payload làm tham số duy nhất
// =================================================================

/**
 * Xử lý message NEW_APPLICATION - Tạo thông báo gộp cho nhà tuyển dụng.
 * @param {object} payload - Toàn bộ payload từ RabbitMQ
 * @returns {Promise<Notification>} - Thông báo đã tạo
 */
export const handleNewApplication = async (payload) => {
  try {
    const applicationId = payload.data.applicationId;
    const application = await Application.findById(applicationId);
    const recruiterId = payload.recipientId;
    const jobId = application.jobId;
    const jobTitle = application.jobSnapshot.title;
    const aggregationKey = `job:${jobId}:applicants`;
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
        userId: new mongoose.Types.ObjectId(recruiterId),
        type: 'job_applicants_rollup',
        aggregationKey,
      },
      [ // Mở đầu pipeline
        {
          $set: {
            title: `Có ứng viên mới cho vị trí "${jobTitle}"`,
            isRead: false,
            readAt: null, // Reset thời gian đọc
            // gán lại createdAt
            createdAt: now,
            'metadata.jobId': new mongoose.Types.ObjectId(jobId),
            'metadata.jobTitle': jobTitle,
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
                      { case: { $eq: ["$$total", 1] }, then: { $concat: [{ $arrayElemAt: ["$$names", 0] }, ` đã nộp đơn vào vị trí "${jobTitle}" của bạn.`] } },
                      { case: { $eq: ["$$total", 2] }, then: { $concat: [{ $arrayElemAt: ["$$names", 0] }, ", ", { $arrayElemAt: ["$$names", 1] }, ` đã nộp đơn vào vị trí "${jobTitle}" của bạn.`] } }
                    ],
                    default: { $concat: [{ $arrayElemAt: ["$$names", 0] }, ", ", { $arrayElemAt: ["$$names", 1] }, " và ", { $toString: { $subtract: ["$$total", 2] } }, ` người khác đã nộp đơn vào vị trí "${jobTitle}" của bạn.`] }
                  }
                }
              }
            }
          }
        }
      ], // Kết thúc pipeline
      { upsert: true, new: true }
    ).lean();

    // đồng thời push  thông báo đẩy
    await pushNotification(recruiterId, {
      body: updatedNotification.message,
      title: updatedNotification.title,
      data: {
        url: `/jobs/${jobId}/applicants`
      }
    });

    return updatedNotification;
  } catch (error) {
    logger.error('Error in upsertRecruiterApplicantsRollup:', error);
    throw error;
  }
};

/**
 * Xử lý message STATUS_UPDATE - Route đến các handler con tương ứng.
 * @param {object} payload - Toàn bộ payload từ RabbitMQ
 */
export const handleStatusUpdate = async (payload) => {
  const applicationId = payload.data.applicationId;

  switch (payload.type) {
    case 'APPLICATION_SUBMITTED':
      // lấy userId từ applicationId
      const application = await Application.findById(applicationId);
      const candidateId = payload.recipientId;
      await Notification.create({
        userId: new mongoose.Types.ObjectId(candidateId),
        title: "Nộp đơn thành công",
        message: `Bạn đã nộp đơn thành công vào vị trí "${application.jobSnapshot.title}" tại ${application.jobSnapshot.company}.`,
        type: 'application',
        entity: {
          type: "Application",
          id: new mongoose.Types.ObjectId(applicationId)
        },
        metadata: {
          applicationId: applicationId.toString(),
          jobId: application.jobId.toString(),
        }
      });

      // đồng thời push thông báo đẩy
      await pushNotification(candidateId, {
        title: "Nộp đơn thành công",
        body: `Bạn đã nộp đơn thành công vào vị trí "${application.jobSnapshot.title}" tại ${application.jobSnapshot.company}.`,
        data: {
          url: `/dashboard/applications/${applicationId}`,
        }
      });
      break;


    case 'APPLICATION_VIEWED':
      return createApplicationViewedNotification(applicationId);

    case 'SUITABLE':
    case 'SCHEDULED_INTERVIEW':
    case 'OFFER_SENT':
    case 'REJECTED':
    case 'INTERVIEW_FAILED': // Added INTERVIEW_FAILED
      return createStatusChangeNotification(applicationId, payload.type, payload.data?.feedback);

    case 'OFFER_ACCEPTED':
    case 'OFFER_DECLINED':
      return createOfferResponseNotification(applicationId, payload.type);

    case 'STATUS_CHANGE':
      return createStatusChangeNotification(applicationId, payload.data.newStatus, payload.data?.feedback);

    case 'PROFILE_VIEW':
      return createProfileViewNotification(payload);

    case 'WORKFLOW_NOTIFICATION':
      return handleWorkflowNotification(payload);

    default:
      logger.warn(`⚠️ Unknown STATUS_UPDATE type: ${payload.type}`);
  }
};

/**
 * Xử lý thông báo từ workflow engine (ví dụ: giao bài test, thông báo kết quả...).
 * @param {object} payload - Payload từ RabbitMQ
 */
export const handleWorkflowNotification = async (payload) => {
  const { recipientId, data } = payload;
  const { applicationId, testAssignmentId, title, message } = data;

  if (!recipientId) {
    logger.warn('WORKFLOW_NOTIFICATION payload is missing recipientId.', payload);
    return;
  }

  // recipientId ở đây là candidateProfileId, cần lookup userId
  const candidateProfile = await CandidateProfile.findById(recipientId).select('userId').lean();
  if (!candidateProfile) {
    logger.warn(`WORKFLOW_NOTIFICATION - CandidateProfile not found for id ${recipientId}`);
    return;
  }

  const userId = candidateProfile.userId;

  const notification = await Notification.create({
    userId: new mongoose.Types.ObjectId(userId),
    title: title || 'Thông báo từ quy trình tuyển dụng',
    message: message || 'Bạn có một thông báo mới từ quy trình tuyển dụng.',
    type: 'workflow',
    entity: applicationId ? {
      type: 'Application',
      id: new mongoose.Types.ObjectId(applicationId)
    } : undefined,
    metadata: {
      applicationId: applicationId?.toString(),
      testAssignmentId: testAssignmentId?.toString(),
      source: 'WORKFLOW_ENGINE'
    }
  });

  // Push notification real-time
  await pushNotification(userId, {
    title: title || 'Thông báo từ quy trình tuyển dụng',
    body: message || 'Bạn có một thông báo mới từ quy trình tuyển dụng.',
    data: {
      url: testAssignmentId
        ? `/tests/${testAssignmentId}/take`
        : `/dashboard/applications/${applicationId}`
    }
  });

  logger.info(`Workflow notification sent to user ${userId} (candidateProfile ${recipientId})`);
  return notification;
};

/**
 * Tạo thông báo khi nhà tuyển dụng xem đơn ứng tuyển.
 * @param {string} applicationId
 */
export const createApplicationViewedNotification = async (applicationId) => {
  const application = await Application.findById(applicationId);
  if (!application) return;

  const candidateProfileId = application.candidateProfileId;
  const candidate = await CandidateProfile.findById(candidateProfileId).select('userId');
  if (!candidate) return;

  const title = 'Nhà tuyển dụng đã xem hồ sơ của bạn';
  const message = `Nhà tuyển dụng tại ${application.jobSnapshot.company} đã xem đơn ứng tuyển của bạn cho vị trí "${application.jobSnapshot.title}".`;

  const notification = await Notification.create({
    userId: candidate.userId,
    title,
    message,
    type: 'application',
    entity: {
      type: "Application",
      id: applicationId
    },
    metadata: {
      applicationId: applicationId.toString(),
      jobId: application.jobId.toString(),
      status: 'APPLICATION_VIEWED'
    }
  });

  await pushNotification(candidate.userId, {
    title,
    body: message,
    data: {
      url: `/dashboard/applications/${applicationId}`
    }
  });

  return notification;
};


/**
 * Tạo thông báo khi trạng thái đơn ứng tuyển thay đổi.
 * @param {string} applicationId - ID của đơn ứng tuyển
 * @param {string} newStatus - Trạng thái mới
 * @param {string} [feedback] - Phản hồi từ nhà tuyển dụng (cho INTERVIEW_FAILED)
 */
export const createStatusChangeNotification = async (applicationId, newStatus, feedback) => {
  const application = await Application.findById(applicationId);
  if (!application) {
    throw new NotFoundError('Không tìm thấy đơn ứng tuyển');
  }

  const candidateProfileId = application.candidateProfileId;
  const candidateId = (await CandidateProfile.findById(candidateProfileId).select('userId')).userId;

  let title = 'Cập nhật trạng thái đơn ứng tuyển';
  let message = '';

  switch (newStatus) {
    case 'SUITABLE':
      message = `Nhà tuyển dụng đã đánh giá hồ sơ của bạn cho vị trí "${application.jobSnapshot.title}" tại ${application.jobSnapshot.company} là phù hợp.`;
      break;
    case 'SCHEDULED_INTERVIEW':
      message = `Nhà tuyển dụng đã đặt lịch phỏng vấn cho đơn ứng tuyển của bạn cho vị trí "${application.jobSnapshot.title}" tại ${application.jobSnapshot.company}.`;
      break;
    case 'OFFER_SENT':
      title = '🎉 Chúc mừng! Bạn nhận được lời mời làm việc';
      message = `Bạn đã nhận được lời mời làm việc cho vị trí "${application.jobSnapshot.title}" tại ${application.jobSnapshot.company}.`;
      break;
    case 'OFFER_ACCEPTED':
      title = '🎉 Chúc mừng! Bạn đã được nhận';
      message = `Chúc mừng bạn đã chính thức trở thành thành viên của ${application.jobSnapshot.company} cho vị trí "${application.jobSnapshot.title}".`;
      break;
    case 'REJECTED':
      message = `Nhà tuyển dụng đã đánh giá hồ sơ của bạn cho vị trí "${application.jobSnapshot.title}" tại ${application.jobSnapshot.company} là không phù hợp.`;
      break;
    case 'INTERVIEW_FAILED':
      title = '⚠️ Kết quả phỏng vấn';
      message = `Rất tiếc, bạn chưa đạt yêu cầu phỏng vấn cho vị trí "${application.jobSnapshot.title}" tại ${application.jobSnapshot.company}.`;
      if (feedback) {
        message += ` Phản hồi: "${feedback}"`;
      }
      break;
    default:
      message = `Trạng thái đơn ứng tuyển của bạn cho vị trí "${application.jobSnapshot.title}" tại ${application.jobSnapshot.company} đã chuyển sang: ${newStatus}.`;
  }

  const notification = await Notification.create({
    userId: new mongoose.Types.ObjectId(candidateId),
    title,
    message,
    type: 'application',
    entity: {
      type: "Application",
      id: new mongoose.Types.ObjectId(applicationId)
    },
    metadata: {
      applicationId: applicationId.toString(),
      jobId: application.jobId.toString(),
      status: newStatus,
      feedback: feedback || undefined // Include feedback in metadata if available
    }
  });

  // đồng thời push thông báo đẩy
  await pushNotification(candidateId, {
    title: notification.title,
    body: notification.message,
    data: {
      url: `/dashboard/applications/${applicationId}`,
    }
  });
};

/**
 * Create notification for recruiter when candidate responds to offer.
 * @param {string} applicationId
 * @param {string} status - ACCEPTED or OFFER_DECLINED
 */
export const createOfferResponseNotification = async (applicationId, status) => {
  const application = await Application.findById(applicationId).populate('jobId');
  if (!application) {
    throw new NotFoundError('Không tìm thấy đơn ứng tuyển');
  }

  const job = application.jobId;
  const recruiterProfileId = job.recruiterProfileId;
  const recruiterProfile = await RecruiterProfile.findById(recruiterProfileId);

  if (!recruiterProfile) {
    logger.warn(`Recruiter profile not found for application ${applicationId}`);
    return;
  }

  const recruiterUserId = recruiterProfile.userId;

  let title = 'Cập nhật phản hồi lời mời làm việc';
  let message = '';

  if (status === 'ACCEPTED' || status === 'OFFER_ACCEPTED') {
    title = '🎉 Ứng viên đã chấp nhận lời mời!';
    message = `Ứng viên ${application.candidateName} đã chấp nhận lời mời làm việc cho vị trí "${job.title}".`;
  } else if (status === 'OFFER_DECLINED') {
    title = 'Ứng viên đã từ chối lời mời';
    message = `Ứng viên ${application.candidateName} đã từ chối lời mời làm việc cho vị trí "${job.title}".`;
  }

  const notification = await Notification.create({
    userId: recruiterUserId,
    title,
    message,
    type: 'application',
    entity: {
      type: "Application",
      id: applicationId
    },
    metadata: {
      applicationId: applicationId.toString(),
      jobId: job._id.toString(),
      status: status
    }
  });

  // Push notification
  await pushNotification(recruiterUserId, {
    title,
    body: message,
    data: {
      url: `/jobs/${job._id}/applications/${applicationId}`
    }
  });

  return notification;
};

/**
 * Xử lý message INTERVIEW_REMINDER.
 * @param {object} payload - Toàn bộ payload từ RabbitMQ
 */
export const handleInterviewReminder = async (payload) => {
  const { interviewId } = payload.data;
  if (!interviewId) {
    throw new BadRequestError('Missing interviewId in payload');
  }
  return createInterviewReminderNotification(interviewId);
};

/**
 * Xử lý message INTERVIEW_STARTED.
 * @param {object} payload - Toàn bộ payload từ RabbitMQ
 */
export const handleInterviewStarted = async (payload) => {
  const { interviewId } = payload.data;
  if (!interviewId) {
    throw new BadRequestError('Missing interviewId in payload');
  }
  return createInterviewStartedNotification(interviewId);
};

/**
 * Xử lý message INTERVIEW_ENDED.
 * @param {object} payload - Toàn bộ payload từ RabbitMQ
 */
export const handleInterviewEnded = async (payload) => {
  const { interviewId, duration } = payload.data;
  if (!interviewId) {
    throw new BadRequestError('Missing interviewId in payload');
  }
  return createInterviewEndedNotification(interviewId, duration);
};

/**
 * Xử lý message RECORDING_AVAILABLE.
 * @param {object} payload - Toàn bộ payload từ RabbitMQ
 */
export const handleRecordingAvailable = async (payload) => {
  const { interviewId, recordingDuration } = payload.data;
  if (!interviewId) {
    throw new BadRequestError('Missing interviewId in payload');
  }
  return createRecordingAvailableNotification(interviewId, recordingDuration);
};

/**
 * Xử lý message INTERVIEW_RESCHEDULE.
 * @param {object} payload - Toàn bộ payload từ RabbitMQ
 */
export const handleInterviewReschedule = async (payload) => {
  const { interviewId, newScheduledTime } = payload.data;
  if (!interviewId || !newScheduledTime) {
    throw new BadRequestError('Missing interviewId or newScheduledTime in payload');
  }
  return createInterviewRescheduledNotification(interviewId, newScheduledTime);
};

/**
 * Xử lý message INTERVIEW_CANCEL.
 * @param {object} payload - Toàn bộ payload từ RabbitMQ
 */
export const handleInterviewCancel = async (payload) => {
  const { interviewId } = payload.data;
  if (!interviewId) {
    throw new BadRequestError('Missing interviewId in payload');
  }
  return createInterviewCanceledNotification(interviewId);
};

/**
 * Xử lý message JOB_ALERT (DAILY/WEEKLY).
 * @param {object} payload - Toàn bộ payload từ RabbitMQ
 */
export const processJobAlertNotification = async (payload) => {
  logger.info('Processing job alert notification', { payload });
  const { userId, subscriptionId, jobIds, notificationType, deliveryMethod, keyword } = payload.data;

  if (!userId || !subscriptionId || !jobIds || jobIds.length === 0) {
    logger.error('Job alert task is missing required data', { payload });
    return;
  }

  try {
    // Fetch all data in parallel
    const [user, subscription, jobs] = await Promise.all([
      User.findById(userId).select('fullName email').lean(),
      JobAlertSubscription.findById(subscriptionId).lean(),
      Job.find({ _id: { $in: jobIds } })
        .populate('recruiterProfileId', 'company.name company.logo')
        .limit(20)
        .lean()
    ]);

    if (!user || !subscription || jobs.length === 0) {
      logger.warn('Missing data for processing job alert notification.', {
        userId,
        subscriptionId,
        hasJobs: jobs.length > 0
      });
      return;
    }

    const frequency = subscription.frequency;
    const templateType = notificationType;

    // Import các dependencies cần thiết
    const NotificationTemplateService = (await import('./notificationTemplate.service.js')).default;
    const emailService = await import('./email.service.js');

    // 1. Handle EMAIL notifications
    if (deliveryMethod === 'EMAIL' || deliveryMethod === 'BOTH') {
      const subject = NotificationTemplateService.generateSubject(jobs, keyword, frequency);

      const templateData = {
        user,
        jobs,
        subscription,
        notificationId: subscriptionId // Use subscriptionId for tracking
      };

      const html = await NotificationTemplateService.generateEmailTemplate(templateType, templateData);

      await emailService.sendEmail({
        to: user.email,
        subject,
        html,
      });

      logger.info(`Job alert email sent to ${user.email} for subscription ${subscriptionId}`);
    }

    // 2. Handle IN-APP notifications
    if (deliveryMethod === 'APPLICATION' || deliveryMethod === 'BOTH') {
      const title = NotificationTemplateService.generateSubject(jobs, keyword, frequency);
      const message = `Có ${jobs.length} việc làm mới phù hợp với tìm kiếm của bạn cho từ khóa "${keyword}".`;

      await Notification.create({
        userId,
        title,
        message,
        type: 'job_alert',
        entity: {
          type: 'JobAlertSubscription',
          id: subscriptionId,
        },
        metadata: {
          subscriptionId: subscriptionId.toString(),
          jobIds: jobIds.map(j => j.toString()),
          keyword: keyword,
        },
      });

      // Gửi push notification
      await pushNotification(userId, {
        title,
        body: message,
        data: {
          url: `/my-settings/job-alerts/${subscriptionId}`
        }
      });

      logger.info(`In-app job alert and push notification created for user ${userId} for subscription ${subscriptionId}`);
    }

    logger.info(`Job alert notification processed successfully for user ${userId}, subscription ${subscriptionId}`);
  } catch (error) {
    logger.error(`Error processing job alert notification for user ${userId}, subscription ${subscriptionId}:`, error);
    throw error;
  }
};

/**
 * Xử lý message COMPANY_VERIFICATION - Tạo thông báo khi công ty được phê duyệt/từ chối.
 * @param {object} payload
 * @returns {Promise<Notification>}
 */
export const handleCompanyVerification = async (payload) => {
  const { recipientId, data } = payload;
  const { status, reason, companyName } = data;

  if (!recipientId) {
    logger.warn('COMPANY_VERIFICATION payload is missing recipientId.', payload);
    return;
  }

  let title = '';
  let message = '';
  let type = 'company_verification';
  let url = '/company-profile';

  if (status === 'approved') {
    title = '✅ Công ty đã được xác thực';
    message = `Hồ sơ công ty "${companyName || 'của bạn'}" đã được phê duyệt. Bạn có thể bắt đầu đăng tin tuyển dụng ngay bây giờ.`;
  } else if (status === 'rejected') {
    title = '❌ Xác thực công ty bị từ chối';
    message = `Hồ sơ công ty "${companyName || 'của bạn'}" bị từ chối. Lý do: ${reason || 'Thông tin chưa hợp lệ'}. Vui lòng cập nhật và gửi lại.`;
  } else {
    logger.warn(`Unknown company verification status: ${status}`);
    return;
  }

  const notification = await Notification.create({
    userId: new mongoose.Types.ObjectId(recipientId),
    title,
    message,
    type,
    metadata: {
      status,
      reason,
      companyName
    }
  });

  // Gửi push notification
  await pushNotification(recipientId, {
    title,
    body: message,
    data: {
      url
    }
  });

  logger.info(`Company verification notification sent to ${recipientId} [${status}]`);
  return notification;
};

/**
 * Xử lý message JOB_APPROVAL - Tạo thông báo khi tin tuyển dụng được phê duyệt/từ chối.
 * @param {object} payload
 * @returns {Promise<Notification>}
 */
export const handleJobApproval = async (payload) => {
  const { recipientId, data } = payload;
  const { status, jobTitle, jobId, rejectionReason } = data;

  if (!recipientId) {
    logger.warn('JOB_APPROVAL payload is missing recipientId.', payload);
    return;
  }

  let title = '';
  let message = '';
  let type = 'job_approval';
  let url = `/jobs/recruiter/${jobId}`;

  if (status === 'APPROVED') {
    title = '✅ Tin tuyển dụng được phê duyệt';
    message = `Tin tuyển dụng "${jobTitle}" đã được duyệt và đang hiển thị công khai.`;
  } else if (status === 'REJECTED') {
    title = '❌ Tin tuyển dụng bị từ chối';
    if (rejectionReason) {
      message = `Tin tuyển dụng "${jobTitle}" đã bị từ chối duyệt. Lý do: ${rejectionReason}`;
    } else {
      message = `Tin tuyển dụng "${jobTitle}" đã bị từ chối duyệt. Vui lòng kiểm tra lại nội dung.`;
    }
  } else {
    logger.warn(`Unknown job approval status: ${status}`);
    return;
  }

  const notification = await Notification.create({
    userId: new mongoose.Types.ObjectId(recipientId),
    title,
    message,
    type,
    entity: {
      type: 'Job',
      id: jobId ? new mongoose.Types.ObjectId(jobId) : null
    },
    metadata: {
      status,
      jobTitle,
      jobId,
      rejectionReason
    }
  });

  // Gửi push notification
  await pushNotification(recipientId, {
    title,
    body: message,
    data: {
      url,
      jobId
    }
  });

  logger.info(`Job approval notification sent to ${recipientId} [${status}]`);
  return notification;
};

/**
 * Xử lý message SUPPORT_REQUEST - Thông báo yêu cầu hỗ trợ
 * @param {object} payload - Payload từ RabbitMQ
 */
export const handleSupportRequest = async (payload) => {
  const { recipientId, data, type } = payload;
  let title = '';
  let message = '';
  const url = data.url || '/support';

  if (type === 'ADMIN_RESPONSE') {
    title = '💬 Phản hồi từ quản trị viên';
    message = `Bạn có phản hồi mới cho yêu cầu hỗ trợ: "${data.subject}"`;
  } else if (type === 'NEW_REQUEST') {
    // Trường hợp thông báo cho admin
    title = '🆘 Yêu cầu hỗ trợ mới';
    message = `${data.requesterName} đã gửi yêu cầu hỗ trợ: "${data.subject}"`;
  } else if (type === 'AUTO_CLOSED') {
    title = 'Yêu cầu hỗ trợ đã đóng';
    message = `Yêu cầu hỗ trợ "${data.subject}" đã được đóng tự động do quá hạn 48h chưa xử lý.`;
  } else {
    // Default fallback
    title = 'Thông báo hỗ trợ';
    message = data.message || 'Bạn có thông báo mới từ hỗ trợ.';
  }

  // 1. Tạo notification trong DB
  const notification = await Notification.create({
    userId: new mongoose.Types.ObjectId(recipientId),
    title,
    message,
    type: 'support_request',
    entity: {
      type: 'SupportRequest',
      id: new mongoose.Types.ObjectId(data.supportRequestId)
    },
    metadata: {
      supportRequestId: data.supportRequestId,
      url
    }
  });

  // 2. Gửi Push Notification
  await pushNotification(recipientId, {
    title,
    body: message,
    data: {
      url,
      supportRequestId: data.supportRequestId
    }
  });

  return notification;
};

/**
 * Xử lý message TALENT_POOL_INVITATION - Mời ứng viên từ Talent Pool.
 * @param {object} payload - Toàn bộ payload từ RabbitMQ
 */
export const handleTalentPoolInvitation = async (payload) => {
  const { candidateUserId, recruiterProfileId, jobId, jobTitle, companyName, companyLogo } = payload;

  const missingFields = [];
  if (!candidateUserId) missingFields.push('candidateUserId');
  if (!jobId) missingFields.push('jobId');

  if (missingFields.length > 0) {
    logger.warn(`TALENT_POOL_INVITATION payload is missing required fields: ${missingFields.join(', ')}`, payload);
    return;
  }

  // 1. Tạo in-app notification
  const notification = await Notification.create({
    userId: new mongoose.Types.ObjectId(candidateUserId),
    type: 'talent_pool_invitation',
    title: 'Lời mời ứng tuyển từ Talent Pool',
    message: `${companyName} mời bạn ứng tuyển vào vị trí "${jobTitle}"`,
    metadata: {
      jobId: jobId.toString(),
      recruiterProfileId: recruiterProfileId.toString(),
      companyName,
      companyLogo,
      invitedAt: new Date()
    },
    entity: {
      type: 'Job',
      id: new mongoose.Types.ObjectId(jobId)
    }
  });

  // 2. Gửi push notification
  await pushNotification(candidateUserId, {
    title: 'Lời mời ứng tuyển mới',
    body: `${companyName} mời bạn ứng tuyển vào vị trí "${jobTitle}"`,
    type: 'talent_pool_invitation',
    data: {
      jobId: jobId.toString(),
      route: `/jobs/${jobId}`
    }
  });

  // 3. Gửi email
  const user = await User.findById(candidateUserId).select('email fullName');
  if (user && user.email) {
    try {
      await emailService.sendEmail({
        to: user.email,
        subject: `Lời mời ứng tuyển từ ${companyName}`,
        template: 'talent-pool-invitation',
        data: {
          candidateName: user.fullName,
          companyName,
          jobTitle,
          jobUrl: `${config.CANDIDATE_FE_URL}/jobs/${jobId}`,
          companyLogo
        }
      });
    } catch (emailError) {
      logger.error(`Failed to send talent pool invitation email to ${user.email}`, emailError);
    }
  }

  logger.info(`Sent talent pool invitation to user ${candidateUserId} for job ${jobId}`);
  return notification;
};
