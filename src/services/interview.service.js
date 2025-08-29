import { NotFoundError, BadRequestError, ForbiddenError } from '../utils/AppError.js';
import logger from '../utils/logger.js';
import InterviewRoom from '../models/InterviewRoom.js';
import { User, Application } from '../models/index.js';
import * as queueService from './queue.service.js';
import * as rabbitmq from '../queues/rabbitmq.js';
import mongoose from 'mongoose';

/**
 * Lấy danh sách cuộc phỏng vấn của recruiter
 * @param {string} recruiterId - ID của recruiter
 * @param {Object} options - Tùy chọn phân trang và lọc
 * @returns {Object} Danh sách cuộc phỏng vấn với meta
 */
export const getRecruiterInterviews = async (recruiterId, options = {}) => {
  const { page = 1, limit = 10, status } = options;
  const skip = (page - 1) * limit;

  const query = { recruiterId };
  
  // Lọc theo status nếu có
  if (status) {
    query.status = status;
  }

  // Đếm tổng số bản ghi
  const total = await InterviewRoom.countDocuments(query);

  // Lấy danh sách cuộc phỏng vấn
  const interviews = await InterviewRoom.find(query)
    .populate('candidateId', 'fullName email avatar')
    .populate({
      path: 'applicationId',
      select: 'jobSnapshot candidateProfileId appliedAt status candidateName candidateEmail candidatePhone'
    })
    .sort({ scheduledTime: 1 })
    .skip(skip)
    .limit(Number(limit))
    .lean();

  const totalPages = Math.ceil(total / limit);

  // Tối ưu và định dạng lại dữ liệu trả về cho recruiter
  const formattedInterviews = interviews.map(interview => ({
    id: interview._id,
    roomName: interview.roomName,
    scheduledTime: interview.scheduledTime,
    startTime: interview.startTime,
    endTime: interview.endTime,
    status: interview.status,
    isReminderSent: interview.isReminderSent,
    createdAt: interview.createdAt,
    updatedAt: interview.updatedAt,
    candidate: {
      id: interview.candidateId._id,
      fullName: interview.candidateId.fullName || interview.applicationId?.candidateName,
      email: interview.candidateId.email || interview.applicationId?.candidateEmail,
      username: interview.candidateId.username,
      avatar: interview.candidateId.avatar,
      phone: interview.applicationId?.candidatePhone
    },
    application: interview.applicationId ? {
      id: interview.applicationId._id,
      appliedAt: interview.applicationId.appliedAt,
      status: interview.applicationId.status,
      candidateProfileId: interview.applicationId.candidateProfileId
    } : null,
    job: interview.applicationId?.jobSnapshot ? {
      title: interview.applicationId.jobSnapshot.title,
      company: {
        name: interview.applicationId.jobSnapshot.company,
        logo: interview.applicationId.jobSnapshot.logo
      },
      location: interview.applicationId.jobSnapshot.location,
      employmentType: interview.applicationId.jobSnapshot.employmentType,
      level: interview.applicationId.jobSnapshot.level
    } : null
  }));

  return {
    meta: {
      currentPage: Number(page),
      totalPages,
      totalItems: total,
      limit: Number(limit)
    },
    data: formattedInterviews
  };
};

/**
 * Lấy danh sách cuộc phỏng vấn của candidate
 * @param {string} candidateId - ID của candidate
 * @param {Object} options - Tùy chọn phân trang và lọc
 * @returns {Object} Danh sách cuộc phỏng vấn với meta
 */
export const getCandidateInterviews = async (candidateId, options = {}) => {
  const { page = 1, limit = 10, status } = options;
  const skip = (page - 1) * limit;

  const query = { candidateId };
  
  // Lọc theo status nếu có
  if (status) {
    query.status = status;
  }

  // Đếm tổng số bản ghi
  const total = await InterviewRoom.countDocuments(query);

  // Lấy danh sách cuộc phỏng vấn
  const interviews = await InterviewRoom.find(query)
    .populate({
      path: 'applicationId'
    })
    .sort({ scheduledTime: 1 })
    .skip(skip)
    .limit(Number(limit))
    .lean();

  const totalPages = Math.ceil(total / limit);

  // Tối ưu và định dạng lại dữ liệu trả về
  const formattedInterviews = interviews.map(interview => ({
    id: interview._id,
    roomName: interview.roomName,
    scheduledTime: interview.scheduledTime,
    startTime: interview.startTime,
    endTime: interview.endTime,
    status: interview.status,
    changeHistory: interview.changeHistory,
    isReminderSent: interview.isReminderSent,
    createdAt: interview.createdAt,
    updatedAt: interview.updatedAt,
    application: interview.applicationId 
    ? {
      id: interview.applicationId._id,
      jobId: interview.applicationId.jobId,
      candidateProfileId: interview.applicationId.candidateProfileId,
      coverLetter: interview.applicationId.coverLetter,
      status: interview.applicationId.status,
      candidateRating: interview.applicationId.candidateRating,
      isReapplied: interview.applicationId.isReapplied,
      candidateName: interview.applicationId.candidateName,
      candidateEmail: interview.applicationId.candidateEmail,
      candidatePhone: interview.applicationId.candidatePhone,
      submittedCV: interview.applicationId.submittedCV,
      jobSnapshot: interview.applicationId.jobSnapshot,
      appliedAt: interview.applicationId.appliedAt,
      status: interview.applicationId.status,
      lastStatusUpdateAt: interview.applicationId.lastStatusUpdateAt,
      createdAt: interview.applicationId.createdAt,
      updatedAt: interview.applicationId.updatedAt
    } : null
  }));

  return {
    meta: {
      currentPage: Number(page),
      totalPages,
      totalItems: total,
      limit

    },
    data: formattedInterviews
  };
};

/**
 * Lấy chi tiết một cuộc phỏng vấn
 * @param {string} interviewId - ID của cuộc phỏng vấn
 * @param {string} userId - ID của user đang truy cập
 * @param {string} userRole - Role của user
 * @returns {Object} Thông tin chi tiết cuộc phỏng vấn
 */
export const getInterviewDetails = async (interviewId, userId, userRole) => {
  const interview = await InterviewRoom.findById(interviewId)
    .populate('candidateId', 'fullName email avatar username')
    .populate('recruiterId', 'fullName email avatar')
    .populate({
      path: 'applicationId',
      select: 'jobSnapshot candidateProfileId appliedAt status candidateName candidateEmail candidatePhone coverLetter candidateRating notes submittedCV activityHistory'
    })
    .lean();

  if (!interview) {
    throw new NotFoundError('Không tìm thấy cuộc phỏng vấn.');
  }

  // Kiểm tra quyền truy cập
  const isRecruiter = userRole === 'recruiter' && interview.recruiterId._id.toString() === userId.toString();
  const isCandidate = userRole === 'candidate' && interview.candidateId._id.toString() === userId.toString();

  if (!isRecruiter && !isCandidate) {
    throw new ForbiddenError('Bạn không có quyền truy cập cuộc phỏng vấn này.');
  }

  // Tính thời lượng phỏng vấn nếu đã hoàn thành
  let duration = null;
  if (interview.startTime && interview.endTime) {
    const durationMs = interview.endTime - interview.startTime;
    duration = {
      minutes: Math.round(durationMs / (1000 * 60)),
      milliseconds: durationMs,
      formatted: `${Math.floor(durationMs / (1000 * 60))}:${Math.floor((durationMs % (1000 * 60)) / 1000).toString().padStart(2, '0')}`
    };
  }

  const formattedInterview = {
    id: interview._id,
    roomName: interview.roomName,
    scheduledTime: interview.scheduledTime,
    startTime: interview.startTime,
    endTime: interview.endTime,
    duration,
    status: interview.status,
    changeHistory: interview.changeHistory,
    isReminderSent: interview.isReminderSent,
    createdAt: interview.createdAt,
    updatedAt: interview.updatedAt,
    candidate: {
      id: interview.candidateId._id,
      fullName: interview.candidateId.fullName || interview.applicationId?.candidateName,
      email: interview.candidateId.email || interview.applicationId?.candidateEmail,
      username: interview.candidateId.username,
      avatar: interview.candidateId.avatar,
      phone: interview.applicationId?.candidatePhone
    },
    recruiter: isCandidate ? {
      id: interview.recruiterId._id,
      fullName: interview.recruiterId.fullName,
      email: interview.recruiterId.email,
      avatar: interview.recruiterId.avatar
    } : null,
    application: interview.applicationId ? {
      id: interview.applicationId._id,
      appliedAt: interview.applicationId.appliedAt,
      status: interview.applicationId.status,
      candidateProfileId: interview.applicationId.candidateProfileId,
      coverLetter: interview.applicationId.coverLetter,
      candidateRating: interview.applicationId.candidateRating,
      submittedCV: interview.applicationId.submittedCV,
      // Chỉ hiển thị notes cho recruiter
      notes: isRecruiter ? interview.applicationId.notes : undefined,
      // Chỉ hiển thị activity history cho recruiter
      activityHistory: isRecruiter ? interview.applicationId.activityHistory : undefined
    } : null,
    job: interview.applicationId?.jobSnapshot ? {
      title: interview.applicationId.jobSnapshot.title,
      company: {
        name: interview.applicationId.jobSnapshot.company,
        logo: interview.applicationId.jobSnapshot.logo
      },
      location: interview.applicationId.jobSnapshot.location,
      employmentType: interview.applicationId.jobSnapshot.employmentType,
      level: interview.applicationId.jobSnapshot.level,
      salary: interview.applicationId.jobSnapshot.salary,
      description: interview.applicationId.jobSnapshot.description,
      requirements: interview.applicationId.jobSnapshot.requirements,
      benefits: interview.applicationId.jobSnapshot.benefits
    } : null
  };

  return formattedInterview;
};

/**
 * Dời lịch phỏng vấn
 * @param {string} interviewId - ID của cuộc phỏng vấn
 * @param {string} recruiterId - ID của recruiter
 * @param {Object} data - Dữ liệu dời lịch
 * @returns {Object} Cuộc phỏng vấn đã được cập nhật
 */
export const rescheduleInterview = async (interviewId, recruiterId, data) => {
  const { scheduledTime, message } = data;

  // Tìm cuộc phỏng vấn với thông tin đầy đủ
  const interview = await InterviewRoom.findById(interviewId)
    .populate('candidateId', 'fullName email')
    .populate({
      path: 'applicationId', 
      select: 'jobSnapshot'
    });

  if (!interview) {
    throw new NotFoundError('Không tìm thấy cuộc phỏng vấn.');
  }

  // Kiểm tra quyền
  if (interview.recruiterId.toString() !== recruiterId.toString()) {
    throw new ForbiddenError('Bạn không có quyền dời lịch phỏng vấn này.');
  }

  // Chỉ có thể dời lịch khi status là SCHEDULED hoặc RESCHEDULED
  if (!['SCHEDULED', 'RESCHEDULED'].includes(interview.status)) {
    throw new BadRequestError('Chỉ có thể dời lịch phỏng vấn đang ở trạng thái SCHEDULED hoặc RESCHEDULED.');
  }

  // Lấy thông tin recruiter
  const recruiter = await User.findById(recruiterId).select('fullName');
  
  // Cập nhật thông tin
  const oldScheduledTime = interview.scheduledTime;
  interview.scheduledTime = scheduledTime;
  interview.status = 'RESCHEDULED';
  interview.isReminderSent = false; // Reset để có thể gửi reminder cho lịch mới
  
  // Thêm vào changeHistory thay vì cập nhật notes
  interview.changeHistory.push({
    timestamp: new Date(),
    action: 'RESCHEDULED',
    fromTime: oldScheduledTime,
    toTime: scheduledTime,
    reason: message || 'Không có lý do cụ thể',
    actor: recruiterId
  });

  await interview.save();

  if (interview.applicationId) {
    const application = await Application.findById(interview.applicationId);
    if (application) {
      application.activityHistory.push({
        actor: recruiterId,
        action: 'INTERVIEW_RESCHEDULED',
        detail: "Dời lịch phỏng vấn từ " + oldScheduledTime.toLocaleString('vi-VN') + " sang " + new Date(scheduledTime).toLocaleString('vi-VN'),
        timestamp: new Date()
      });
      
      await application.save();
    }
  }

  // Gửi thông báo qua RabbitMQ để worker xử lý
  queueService.publishNotification(rabbitmq.ROUTING_KEYS.INTERVIEW_RESCHEDULE, {
    type: 'APPLICATION_UPDATE',
    recipientId: interview.candidateId._id.toString(),
    data: {
      action: 'INTERVIEW_RESCHEDULED',
      applicationId: interview.applicationId ? interview.applicationId._id.toString() : null,
      jobTitle: interview.applicationId?.jobSnapshot?.title,
      companyName: interview.applicationId?.jobSnapshot?.company,
      scheduledTime: scheduledTime
    }
  });


  return interview;
};

/**
 * Hủy lịch phỏng vấn
 * @param {string} interviewId - ID của cuộc phỏng vấn
 * @param {string} recruiterId - ID của recruiter
 * @returns {Object} Cuộc phỏng vấn đã được hủy
 */
export const cancelInterview = async (interviewId, recruiterId) => {
  const interview = await InterviewRoom.findById(interviewId)
    .populate('candidateId', 'fullName email')
    .populate({
      path: 'applicationId', 
      select: 'jobSnapshot'
    });

  if (!interview) {
    throw new NotFoundError('Không tìm thấy cuộc phỏng vấn.');
  }

  // Kiểm tra quyền
  if (interview.recruiterId.toString() !== recruiterId.toString()) {
    throw new ForbiddenError('Bạn không có quyền hủy cuộc phỏng vấn này.');
  }

  // Chỉ có thể hủy khi status là SCHEDULED hoặc RESCHEDULED
  if (!['SCHEDULED', 'RESCHEDULED'].includes(interview.status)) {
    throw new BadRequestError('Chỉ có thể hủy cuộc phỏng vấn đang ở trạng thái SCHEDULED hoặc RESCHEDULED.');
  }

  // Lấy thông tin recruiter
  const recruiter = await User.findById(recruiterId).select('fullName');

  // Cập nhật status và changeHistory
  interview.status = 'CANCELLED';
  interview.changeHistory.push({
    timestamp: new Date(),
    action: 'CANCELLED',
    reason: 'Cuộc phỏng vấn đã bị hủy bởi nhà tuyển dụng',
    actor: recruiterId
  });
  
  await interview.save();

  if (interview.applicationId) {
    const application = await Application.findById(interview.applicationId);
    if (application) {
      application.activityHistory.push({
        actor: recruiterId,
        action: 'INTERVIEW_CANCELLED',
        detail: 'Cuộc phỏng vấn đã bị hủy bởi nhà tuyển dụng',
        timestamp: new Date()
      });
      
      await application.save();
    }
  }

  // Gửi thông báo qua RabbitMQ để worker xử lý
  queueService.publishNotification(rabbitmq.ROUTING_KEYS.INTERVIEW_CANCEL, {
    type: 'APPLICATION_UPDATE',
    recipientId: interview.candidateId._id.toString(),
    data: {
      action: 'INTERVIEW_CANCELLED',
      applicationId: interview.applicationId ? interview.applicationId._id.toString() : null,
      jobTitle: interview.applicationId?.jobSnapshot?.title,
      companyName: interview.applicationId?.jobSnapshot?.company
    }
  });

  logger.info(`Interview ${interviewId} cancelled by recruiter ${recruiterId}`);

  return interview;
};

/**
 * Bắt đầu phỏng vấn
 * @param {string} interviewId - ID của cuộc phỏng vấn
 * @param {string} recruiterId - ID của recruiter
 * @returns {Object} Cuộc phỏng vấn đã bắt đầu
 */
export const startInterview = async (interviewId, recruiterId) => {
  const interview = await InterviewRoom.findById(interviewId);

  if (!interview) {
    throw new NotFoundError('Không tìm thấy cuộc phỏng vấn.');
  }

  // Kiểm tra quyền
  if (interview.recruiterId.toString() !== recruiterId.toString()) {
    throw new ForbiddenError('Bạn không có quyền bắt đầu cuộc phỏng vấn này.');
  }

  // Chỉ có thể bắt đầu khi status là SCHEDULED hoặc RESCHEDULED
  if (!['SCHEDULED', 'RESCHEDULED'].includes(interview.status)) {
    throw new BadRequestError('Chỉ có thể bắt đầu cuộc phỏng vấn đang ở trạng thái SCHEDULED hoặc RESCHEDULED.');
  }

  // Cập nhật thông tin
  interview.status = 'STARTED';
  interview.startTime = new Date();
  interview.changeHistory.push({
    timestamp: new Date(),
    action: 'STARTED',
    actor: recruiterId
  });
  await interview.save();

  logger.info(`Interview ${interviewId} started by recruiter ${recruiterId}`);

  return interview;
};

/**
 * Kết thúc phỏng vấn
 * @param {string} interviewId - ID của cuộc phỏng vấn
 * @param {string} recruiterId - ID của recruiter
 * @param {Object} data - Dữ liệu kết thúc phỏng vấn
 * @returns {Object} Cuộc phỏng vấn đã kết thúc
 */
export const completeInterview = async (interviewId, recruiterId, data) => {
  const { notes } = data;

  const interview = await InterviewRoom.findById(interviewId)
    .populate('candidateId', 'fullName email')
    .populate({
      path: 'applicationId',
      select: 'appliedPosition jobId',
      populate: {
        path: 'jobId',
        select: 'title company',
        populate: {
          path: 'company',
          select: 'companyName'
        }
      }
    });

  if (!interview) {
    throw new NotFoundError('Không tìm thấy cuộc phỏng vấn.');
  }

  // Kiểm tra quyền
  if (interview.recruiterId.toString() !== recruiterId.toString()) {
    throw new ForbiddenError('Bạn không có quyền kết thúc cuộc phỏng vấn này.');
  }

  // Chỉ có thể kết thúc khi status là STARTED
  if (interview.status !== 'STARTED') {
    throw new BadRequestError('Chỉ có thể kết thúc cuộc phỏng vấn đang ở trạng thái STARTED.');
  }

  // Lấy thông tin recruiter
  const recruiter = await User.findById(recruiterId).select('fullName');

  // Cập nhật thông tin interview
  interview.status = 'COMPLETED';
  interview.endTime = new Date();
  
  // Tính thời lượng phỏng vấn
  const durationMs = interview.endTime - interview.startTime;
  const durationMinutes = Math.round(durationMs / (1000 * 60));
  
  // Thêm vào changeHistory thay vì cập nhật notes
  interview.changeHistory.push({
    timestamp: new Date(),
    action: 'COMPLETED',
    notes: notes || `Phỏng vấn kết thúc. Thời lượng: ${durationMinutes} phút.`,
    actor: recruiterId
  });

  await interview.save();

  // === BƯỚC NÂNG CẤP: TỰ ĐỘNG CẬP NHẬT APPLICATION ===
  if (interview.applicationId) {
    const application = await Application.findById(interview.applicationId);
    if (application) {
      const oldStatus = application.status;
      application.status = 'INTERVIEWED';
      application.lastStatusUpdateAt = new Date();

      // Ghi log vào Application
      application.activityHistory.push({
        actor: recruiterId,
        action: 'INTERVIEW_COMPLETED',
        details: { interviewId: interview._id },
        timestamp: new Date()
      });
      
      application.activityHistory.push({
        actor: recruiterId,
        action: 'STATUS_CHANGE',
        details: { from: oldStatus, to: 'INTERVIEWED' },
        timestamp: new Date()
      });
      
      await application.save();
      logger.info(`Updated application ${application._id} status from ${oldStatus} to INTERVIEWED after interview completion`);
    }
  }

  // Lấy thông tin để gửi thông báo
  const jobTitle = interview.applicationId?.jobId?.title || 'Vị trí ứng tuyển';
  const companyName = interview.applicationId?.jobId?.company?.companyName || 'Công ty';

  // Gửi thông báo qua RabbitMQ để worker xử lý
  queueService.publishNotification(rabbitmq.ROUTING_KEYS.INTERVIEW_COMPLETE, {
    type: 'INTERVIEW_COMPLETE',
    recipientId: interview.candidateId._id.toString(),
    data: {
      interviewId: interview._id.toString(),
      roomName: interview.roomName,
      duration: durationMinutes,
      durationMs: durationMs,
      recruiterName: recruiter.fullName,
      candidateName: interview.candidateId.fullName,
      candidateEmail: interview.candidateId.email,
      jobTitle,
      companyName,
      startTime: interview.startTime,
      endTime: interview.endTime,
      emailSubject: `[${companyName}] Phỏng vấn đã hoàn thành`,
      emailTemplate: 'interview-complete'
    }
  });

  logger.info(`Interview ${interviewId} completed by recruiter ${recruiterId}. Duration: ${durationMinutes} minutes`);

  return interview;
};

/**
 * Thêm ghi chú vào cuộc phỏng vấn
 * @param {string} interviewId - ID của cuộc phỏng vấn
 * @param {string} recruiterId - ID của recruiter
 * @param {string} notes - Ghi chú cần thêm
 * @returns {Object} Cuộc phỏng vấn đã được cập nhật
 */
export const addInterviewNote = async (interviewId, recruiterId, notes) => {
  const interview = await InterviewRoom.findById(interviewId);

  if (!interview) {
    throw new NotFoundError('Không tìm thấy cuộc phỏng vấn.');
  }

  // Kiểm tra quyền
  if (interview.recruiterId.toString() !== recruiterId.toString()) {
    throw new ForbiddenError('Bạn không có quyền thêm ghi chú cho cuộc phỏng vấn này.');
  }

  // Thêm ghi chú vào changeHistory
  interview.changeHistory.push({
    timestamp: new Date(),
    action: 'NOTE_ADDED',
    notes: notes,
    actor: recruiterId
  });

  await interview.save();

  logger.info(`Note added to interview ${interviewId} by recruiter ${recruiterId}`);

  return interview;
};


/**
 * Gửi reminder cho các cuộc phỏng vấn sắp diễn ra
 * @param {number} minutesBefore - Số phút trước khi phỏng vấn để gửi reminder
 * @returns {number} Số lượng reminder đã gửi
 */
export const sendInterviewReminders = async (minutesBefore = 30) => {
  const now = new Date();
  const reminderTime = new Date(now.getTime() + minutesBefore * 60 * 1000);
  const endTime = new Date(now.getTime() + (minutesBefore + 5) * 60 * 1000);

  const interviews = await InterviewRoom.find({
    status: { $in: ['SCHEDULED', 'RESCHEDULED'] },
    isReminderSent: false,
    scheduledTime: { 
      $gte: reminderTime, 
      $lt: endTime 
    }
  })
  .populate('candidateId', 'fullName email')
  .populate('recruiterId', 'fullName email')
  .populate({
    path: 'applicationId',
    select: 'jobId',
    populate: {
      path: 'jobId',
      select: 'title company',
      populate: {
        path: 'company',
        select: 'companyName'
      }
    }
  });

  let sentCount = 0;

  for (const interview of interviews) {
    try {
      const jobTitle = interview.applicationId?.jobId?.title || 'Vị trí ứng tuyển';
      const companyName = interview.applicationId?.jobId?.company?.companyName || 'Công ty';
      
      // Gửi reminder cho candidate qua RabbitMQ
      queueService.publishNotification(rabbitmq.ROUTING_KEYS.INTERVIEW_REMINDER, {
        type: 'INTERVIEW_REMINDER',
        recipientId: interview.candidateId._id.toString(),
        data: {
          interviewId: interview._id.toString(),
          roomName: interview.roomName,
          scheduledTime: interview.scheduledTime,
          minutesBefore,
          candidateName: interview.candidateId.fullName,
          candidateEmail: interview.candidateId.email,
          recruiterName: interview.recruiterId.fullName,
          jobTitle,
          companyName
        }
      });

      // Gửi reminder cho recruiter qua RabbitMQ (nếu cần)
      queueService.publishNotification(rabbitmq.ROUTING_KEYS.INTERVIEW_REMINDER, {
        type: 'INTERVIEW_REMINDER',
        recipientId: interview.recruiterId._id.toString(),
        data: {
          interviewId: interview._id.toString(),
          roomName: interview.roomName,
          scheduledTime: interview.scheduledTime,
          minutesBefore,
          candidateName: interview.candidateId.fullName,
          recruiterName: interview.recruiterId.fullName,
          recruiterEmail: interview.recruiterId.email,
          jobTitle,
          companyName,
          isForRecruiter: true
        }
      });

      // Đánh dấu đã gửi reminder
      interview.isReminderSent = true;
      await interview.save();
      
      sentCount++;
    } catch (error) {
      logger.error(`Failed to send reminder for interview ${interview._id}:`, error);
    }
  }

  logger.info(`Sent ${sentCount} interview reminders`);
  return sentCount;
};