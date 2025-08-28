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
    .populate('candidateId', 'username email')
    .populate({
      path: 'applicationId',
      select: 'jobSnapshot candidateProfileId appliedAt status'
    })
    .sort({ scheduledTime: 1 }) // Sắp xếp theo thời gian sắp tới trước
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
    notes: interview.notes,
    isReminderSent: interview.isReminderSent,
    createdAt: interview.createdAt,
    updatedAt: interview.updatedAt,
    candidate: {
      id: interview.candidateId._id,
      username: interview.candidateId.username,
      email: interview.candidateId.email
    },
    application: interview.applicationId ? {
      id: interview.applicationId._id,
      appliedAt: interview.applicationId.appliedAt,
      status: interview.applicationId.status,
      job: {
        title: interview.applicationId.jobSnapshot?.title,
        company: {
          name: interview.applicationId.jobSnapshot?.company,
          logo: interview.applicationId.jobSnapshot?.logo
        }
      }
    } : null
  }));

  return {
    meta: {
      currentPage: Number(page),
      totalPages,
      totalItems: total,
      hasNextPage: page < totalPages,
      hasPrevPage: page > 1
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
    notes: interview.notes,
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
     .populate({
      path: 'applicationId'
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

  const formattedInterview = {
    id: interview._id,
    roomName: interview.roomName,
    scheduledTime: interview.scheduledTime,
    startTime: interview.startTime,
    endTime: interview.endTime,
    status: interview.status,
    notes: interview.notes,
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
  };
  // nếu là recruiter thì thêm notes trong application
  if (isRecruiter) {
    formattedInterview.application.notes = interview.applicationId.notes;
  }

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
  
  // Cập nhật notes với thông tin dời lịch
  const rescheduleNote = `\n[${new Date().toLocaleString('vi-VN')}] Lịch phỏng vấn đã được dời từ ${oldScheduledTime.toLocaleString('vi-VN')} sang ${scheduledTime.toLocaleString('vi-VN')}`;
  if (message) {
    interview.notes = `${interview.notes || ''}${rescheduleNote}\nLý do: ${message}`.trim();
  } else {
    interview.notes = `${interview.notes || ''}${rescheduleNote}`.trim();
  }

  await interview.save();

  // Lấy thông tin để gửi thông báo

  // Gửi thông báo qua RabbitMQ để worker xử lý
  queueService.publishNotification(rabbitmq.ROUTING_KEYS.INTERVIEW_RESCHEDULE, {
    type: 'INTERVIEW_RESCHEDULE',
    recipientId: interview.candidateId._id.toString(),
    data: {
      interviewId: interview._id.toString(),
      oldTime: oldScheduledTime,
      newTime: scheduledTime,
      message: message || 'Nhà tuyển dụng đã dời lịch phỏng vấn.'
    }
  });

  logger.info(`Interview ${interviewId} rescheduled by recruiter ${recruiterId} from ${oldScheduledTime} to ${scheduledTime}`);

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

  // Cập nhật status và notes
  interview.status = 'CANCELLED';
  interview.notes = `${interview.notes || ''}\n[${new Date().toLocaleString('vi-VN')}] Cuộc phỏng vấn đã bị hủy bởi nhà tuyển dụng.`.trim();
  
  await interview.save();

  // Gửi thông báo qua RabbitMQ để worker xử lý
  queueService.publishNotification(rabbitmq.ROUTING_KEYS.INTERVIEW_CANCEL, {
    type: 'INTERVIEW_CANCEL',
    recipientId: interview.candidateId._id.toString(),
    data: {
      interviewId: interview._id.toString(),
      scheduledTime: interview.scheduledTime,
      message: 'Nhà tuyển dụng đã hủy cuộc phỏng vấn.',
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

  // Cập nhật thông tin
  interview.status = 'COMPLETED';
  interview.endTime = new Date();
  
  // Tính thời lượng phỏng vấn
  const durationMs = interview.endTime - interview.startTime;
  const durationMinutes = Math.round(durationMs / (1000 * 60));
  
  // Cập nhật notes
  let completionNote = `\n[${new Date().toLocaleString('vi-VN')}] Phỏng vấn kết thúc. Thời lượng: ${durationMinutes} phút.`;
  if (notes) {
    completionNote += `\nGhi chú từ nhà tuyển dụng: ${notes}`;
  }
  interview.notes = `${interview.notes || ''}${completionNote}`.trim();

  await interview.save();

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