import { NotFoundError, BadRequestError, ForbiddenError } from '../utils/AppError.js';
import logger from '../utils/logger.js';
import InterviewRoom from '../models/InterviewRoom.js';
import { User, Application, Job, RecruiterProfile } from '../models/index.js';
import * as queueService from './queue.service.js';
import * as rabbitmq from '../queues/rabbitmq.js';
import mongoose from 'mongoose';
import { v4 as uuidv4 } from 'uuid';
import { logActivity } from './application.service.js';

// =================================================================
// Core Interview Management Functions (Task 2.1)
// =================================================================

/**
 * Schedule a new interview
 * @param {string} recruiterId - ID of the recruiter
 * @param {string} candidateId - ID of the candidate
 * @param {string} jobId - ID of the job
 * @param {string} applicationId - ID of the application
 * @param {Date} scheduledAt - Scheduled interview time
 * @param {number} duration - Expected duration in minutes
 * @returns {Object} Created interview
 */
export const scheduleInterview = async (recruiterId, candidateId, jobId, applicationId, scheduledAt, duration = 60) => {
  // Validate inputs
  if (!recruiterId || !candidateId || !jobId || !applicationId || !scheduledAt) {
    throw new BadRequestError('Missing required fields for scheduling interview');
  }

  // Validate scheduled time is in the future
  const scheduledDate = new Date(scheduledAt);
  if (scheduledDate <= new Date()) {
    throw new BadRequestError('Scheduled time must be in the future');
  }

  // Validate duration
  if (duration < 15 || duration > 180) {
    throw new BadRequestError('Duration must be between 15 and 180 minutes');
  }

  // Verify application exists and belongs to the candidate
  const application = await Application.findById(applicationId)
    .populate('candidateProfileId', 'userId');

  if (!application) {
    throw new NotFoundError('Application not found');
  }

  // Verify job exists
  const job = await Job.findById(jobId).lean();
  if (!job) {
    throw new NotFoundError('Job not found');
  }
  const recruiterUserId = (await RecruiterProfile.findById(job.recruiterProfileId).lean()).userId;
  // Verify recruiter owns the job
  if (recruiterUserId.toString() !== recruiterId.toString()) {
    throw new ForbiddenError('You do not have permission to schedule interviews for this job');
  }

  // Generate unique room ID
  const roomId = `interview-${uuidv4()}`;

  // Create room name
  const roomName = `Phỏng vấn vị trí ${application.jobSnapshot?.title} - ${new Date(scheduledAt).toLocaleString('vi-VN')} - Ứng viên: ${application.candidateName}`;

  // Create interview
  const interview = await InterviewRoom.create({
    jobId,
    applicationId,
    recruiterId,
    candidateId,
    scheduledTime: scheduledDate,
    duration,
    roomId,
    roomName,
    status: 'SCHEDULED',
    changeHistory: [{
      timestamp: new Date(),
      action: 'CREATED',
      actor: recruiterId
    }]
  });

  // Update application activity history
  logActivity(application, 'SCHEDULED_INTERVIEW', `Nhà tuyển dụng đã lên lịch phỏng vấn vào ${scheduledDate.toLocaleString('vi-VN')}`);
  application.status = 'SCHEDULED_INTERVIEW';
  await application.save();


  // Send notification to candidate
  queueService.publishNotification(rabbitmq.ROUTING_KEYS.STATUS_UPDATE, {
    type: 'SCHEDULED_INTERVIEW',
    recipientId: candidateId.toString(),
    data: {
      interviewId: interview._id.toString(),
      applicationId: applicationId.toString()
    }
  });

  logger.info(`Interview ${interview._id} scheduled by recruiter ${recruiterId} for candidate ${candidateId}`);

  return interview;
};

/**
 * Get interview by ID with access control
 * @param {string} interviewId - ID of the interview
 * @param {string} userId - ID of the user requesting access
 * @returns {Object} Interview details
 */
export const getInterviewById = async (interviewId, userId) => {
  if (!interviewId || !userId) {
    throw new BadRequestError('Interview ID and User ID are required');
  }

  const interview = await InterviewRoom.findById(interviewId)
    .populate('candidateId', 'fullName email avatar')
    .populate('recruiterId', 'fullName email avatar')
    .populate({
      path: 'applicationId',
      select: 'jobSnapshot candidateProfileId appliedAt status candidateName candidateEmail candidatePhone coverLetter candidateRating notes submittedCV activityHistory'
    })
    .lean();

  if (!interview) {
    throw new NotFoundError('Interview not found');
  }

  // Check access control
  const isRecruiter = interview.recruiterId._id.toString() === userId.toString();
  const isCandidate = interview.candidateId._id.toString() === userId.toString();

  if (!isRecruiter && !isCandidate) {
    throw new ForbiddenError('You do not have permission to access this interview');
  }

  return interview;
};

/**
 * Get interviews by recruiter with filtering
 * @param {string} recruiterId - ID of the recruiter
 * @param {Object} filters - Filter options (status, page, limit)
 * @returns {Object} List of interviews with pagination
 */
export const getInterviewsByRecruiter = async (recruiterId, filters = {}) => {
  const { status, page = 1, limit = 10 } = filters;
  const skip = (page - 1) * limit;

  const query = { recruiterId };

  // Apply status filter if provided
  if (status) {
    // Support multiple statuses
    if (Array.isArray(status)) {
      query.status = { $in: status };
    } else {
      query.status = status;
    }
  }

  // Count total documents
  const total = await InterviewRoom.countDocuments(query);

  // Fetch interviews
  const interviews = await InterviewRoom.find(query)
    .populate('candidateId', 'fullName email avatar')
    .populate({
      path: 'applicationId',
      select: 'jobSnapshot candidateProfileId appliedAt status candidateName candidateEmail candidatePhone'
    })
    .sort({ scheduledTime: -1 })
    .skip(skip)
    .limit(Number(limit))
    .lean();

  const totalPages = Math.ceil(total / limit);

  return {
    data: interviews,
    meta: {
      currentPage: Number(page),
      totalPages,
      totalItems: total,
      limit: Number(limit)
    }
  };
};

/**
 * Get interviews by candidate with filtering
 * @param {string} candidateId - ID of the candidate
 * @param {Object} filters - Filter options (status, page, limit)
 * @returns {Object} List of interviews with pagination
 */
export const getInterviewsByCandidate = async (candidateId, filters = {}) => {
  const { status, page = 1, limit = 10 } = filters;
  const skip = (page - 1) * limit;

  const query = { candidateId };

  // Apply status filter if provided
  if (status) {
    // Support multiple statuses
    if (Array.isArray(status)) {
      query.status = { $in: status };
    } else {
      query.status = status;
    }
  }

  // Count total documents
  const total = await InterviewRoom.countDocuments(query);

  // Fetch interviews
  const interviews = await InterviewRoom.find(query)
    .populate('recruiterId', 'fullName email avatar')
    .populate({
      path: 'applicationId',
      select: 'jobSnapshot appliedAt status'
    })
    .sort({ scheduledTime: -1 })
    .skip(skip)
    .limit(Number(limit))
    .lean();

  const totalPages = Math.ceil(total / limit);

  return {
    data: interviews,
    meta: {
      currentPage: Number(page),
      totalPages,
      totalItems: total,
      limit: Number(limit)
    }
  };
};

/**
 * Update interview status with state transition validation
 * @param {string} interviewId - ID of the interview
 * @param {string} newStatus - New status to set
 * @param {string} userId - ID of the user making the change
 * @returns {Object} Updated interview
 */
export const updateInterviewStatus = async (interviewId, newStatus, userId) => {
  if (!interviewId || !newStatus || !userId) {
    throw new BadRequestError('Interview ID, status, and user ID are required');
  }

  const interview = await InterviewRoom.findById(interviewId);

  if (!interview) {
    throw new NotFoundError('Interview not found');
  }

  // Check if user has permission (must be recruiter or candidate)
  const isRecruiter = interview.recruiterId.toString() === userId.toString();
  const isCandidate = interview.candidateId.toString() === userId.toString();

  if (!isRecruiter && !isCandidate) {
    throw new ForbiddenError('You do not have permission to update this interview');
  }

  // Validate state transitions
  const validTransitions = {
    'SCHEDULED': ['STARTED', 'RESCHEDULED', 'CANCELLED'],
    'RESCHEDULED': ['STARTED', 'CANCELLED'],
    'STARTED': ['COMPLETED', 'CANCELLED'],
    'COMPLETED': [], // Cannot transition from completed
    'CANCELLED': [] // Cannot transition from cancelled
  };

  const allowedStatuses = validTransitions[interview.status] || [];

  if (!allowedStatuses.includes(newStatus)) {
    throw new BadRequestError(`Cannot transition from ${interview.status} to ${newStatus}`);
  }

  // Update status
  const oldStatus = interview.status;
  interview.status = newStatus;

  // Add to change history
  interview.changeHistory.push({
    timestamp: new Date(),
    action: `STATUS_CHANGED_TO_${newStatus}`,
    notes: `Status changed from ${oldStatus} to ${newStatus}`,
    actor: userId
  });

  await interview.save();

  logger.info(`Interview ${interviewId} status updated from ${oldStatus} to ${newStatus} by user ${userId}`);

  return interview;
};

// =================================================================
// Interview Session Control Functions (Task 2.2)
// =================================================================

/**
 * Join interview with time window validation
 * @param {string} interviewId - ID of the interview
 * @param {string} userId - ID of the user joining
 * @returns {Object} Interview details with join permission
 */
export const joinInterview = async (interviewId, userId) => {
  if (!interviewId || !userId) {
    throw new BadRequestError('Interview ID and User ID are required');
  }

  const interview = await InterviewRoom.findById(interviewId)
    .populate('candidateId', 'fullName email avatar')
    .populate('recruiterId', 'fullName email avatar')
    .lean();

  if (!interview) {
    throw new NotFoundError('Interview not found');
  }

  // Check if user is a participant
  const isRecruiter = interview.recruiterId._id.toString() === userId.toString();
  const isCandidate = interview.candidateId._id.toString() === userId.toString();

  if (!isRecruiter && !isCandidate) {
    throw new ForbiddenError('You are not a participant in this interview');
  }

  // Check if interview is in valid status
  if (!['SCHEDULED', 'RESCHEDULED', 'STARTED'].includes(interview.status)) {
    throw new BadRequestError(`Cannot join interview with status: ${interview.status}`);
  }

  // Validate time window (15 minutes before to 30 minutes after scheduled time)
  const now = new Date();
  const scheduledTime = new Date(interview.scheduledTime);
  const windowStart = new Date(scheduledTime.getTime() - 15 * 60000); // 15 min before
  const windowEnd = new Date(scheduledTime.getTime() + 30 * 60000); // 30 min after

  if (now < windowStart) {
    const minutesUntilStart = Math.ceil((windowStart - now) / 60000);
    throw new BadRequestError(`Interview can be joined ${minutesUntilStart} minutes before scheduled time`);
  }

  if (now > windowEnd) {
    throw new BadRequestError('Chỉ có thể tham gia phòng phỏng vấn 15 phút trước cho đến 30 phút sau phỏng vấn bắt đầu');
  }

  logger.info(`User ${userId} validated to join interview ${interviewId}`);

  return {
    interview,
    canJoin: true,
    userRole: isRecruiter ? 'recruiter' : 'candidate'
  };
};

/**
 * Start interview - mark as in-progress
 * @param {string} interviewId - ID of the interview
 * @param {string} userId - ID of the user starting (must be recruiter)
 * @returns {Object} Updated interview
 */
export const startInterview = async (interviewId, userId) => {
  if (!interviewId || !userId) {
    throw new BadRequestError('Interview ID and User ID are required');
  }

  const interview = await InterviewRoom.findById(interviewId);

  if (!interview) {
    throw new NotFoundError('Interview not found');
  }

  // Only recruiter can start the interview
  if (interview.recruiterId.toString() !== userId.toString()) {
    throw new ForbiddenError('Only the recruiter can start the interview');
  }

  // Can only start if status is SCHEDULED or RESCHEDULED
  if (!['SCHEDULED', 'RESCHEDULED'].includes(interview.status)) {
    throw new BadRequestError(`Cannot start interview with status: ${interview.status}`);
  }

  // Update interview
  interview.status = 'STARTED';
  interview.startTime = new Date();
  interview.changeHistory.push({
    timestamp: new Date(),
    action: 'STARTED',
    actor: userId
  });

  await interview.save();

  // Update application activity history
  if (interview.applicationId) {
    await Application.findByIdAndUpdate(interview.applicationId, {
      $push: {
        activityHistory: {
          action: 'INTERVIEW_STARTED',
          detail: `Interview started at ${interview.startTime.toLocaleString('vi-VN')}`,
          timestamp: new Date()
        }
      }
    });
  }

  // Send notification via RabbitMQ
  queueService.publishNotification(rabbitmq.ROUTING_KEYS.INTERVIEW_STARTED, {
    type: 'INTERVIEW_STARTED',
    data: {
      interviewId: interview._id.toString()
    }
  });

  logger.info(`Interview ${interviewId} started by recruiter ${userId}`);

  return interview;
};

/**
 * End interview with feedback storage
 * @param {string} interviewId - ID of the interview
 * @param {string} userId - ID of the user ending (must be recruiter)
 * @param {Object} feedback - Feedback data (rating, notes, technicalIssues, issueDescription)
 * @returns {Object} Updated interview
 */
export const endInterview = async (interviewId, userId, feedback = {}) => {
  if (!interviewId || !userId) {
    throw new BadRequestError('Interview ID and User ID are required');
  }

  const interview = await InterviewRoom.findById(interviewId)
    .populate('candidateId', 'fullName email')
    .populate({
      path: 'applicationId',
      select: 'jobSnapshot'
    });

  if (!interview) {
    throw new NotFoundError('Interview not found');
  }

  // Only recruiter can end the interview
  if (interview.recruiterId.toString() !== userId.toString()) {
    throw new ForbiddenError('Only the recruiter can end the interview');
  }

  // Can only end if status is STARTED
  if (interview.status !== 'STARTED') {
    throw new BadRequestError(`Cannot end interview with status: ${interview.status}`);
  }

  // Update interview
  interview.status = 'COMPLETED';
  interview.endTime = new Date();

  // Calculate duration
  const durationMs = interview.endTime - interview.startTime;
  const durationMinutes = Math.round(durationMs / (1000 * 60));

  // Add to change history
  interview.changeHistory.push({
    timestamp: new Date(),
    action: 'COMPLETED',
    notes: feedback.notes || `Interview completed. Duration: ${durationMinutes} minutes.`,
    actor: userId
  });

  await interview.save();

  // Update application status and activity history
  if (interview.applicationId) {
    const application = await Application.findById(interview.applicationId);
    if (application) {
      const oldStatus = application.status;
      application.status = 'INTERVIEWED';
      application.lastStatusUpdateAt = new Date();

      // Store feedback if provided
      if (feedback.rating || feedback.notes) {
        application.candidateRating = feedback.rating || application.candidateRating;
        if (feedback.notes) {
          application.notes = (application.notes || '') + `\n\nInterview Feedback (${new Date().toLocaleString('vi-VN')}): ${feedback.notes}`;
        }
      }

      application.activityHistory.push({
        action: 'INTERVIEW_COMPLETED',
        detail: `Interview completed. Duration: ${durationMinutes} minutes.`,
        timestamp: new Date()
      });

      application.activityHistory.push({
        action: 'STATUS_CHANGE',
        detail: `Status changed from ${oldStatus} to INTERVIEWED`,
        timestamp: new Date()
      });

      await application.save();
    }
  }

  // Send notification via RabbitMQ
  queueService.publishNotification(rabbitmq.ROUTING_KEYS.INTERVIEW_COMPLETE, {
    type: 'INTERVIEW_ENDED',
    data: {
      interviewId: interview._id.toString(),
      duration: durationMinutes
    }
  });

  logger.info(`Interview ${interviewId} ended by recruiter ${userId}. Duration: ${durationMinutes} minutes`);

  return interview;
};

/**
 * Cancel interview
 * @param {string} interviewId - ID of the interview
 * @param {string} userId - ID of the user cancelling (must be recruiter)
 * @param {string} reason - Reason for cancellation
 * @returns {Object} Updated interview
 */
export const cancelInterview = async (interviewId, userId, reason = '') => {
  if (!interviewId || !userId) {
    throw new BadRequestError('Interview ID and User ID are required');
  }

  const interview = await InterviewRoom.findById(interviewId)
    .populate('candidateId', 'fullName email')
    .populate({
      path: 'applicationId',
      select: 'jobSnapshot'
    });

  if (!interview) {
    throw new NotFoundError('Interview not found');
  }

  // Only recruiter can cancel
  if (interview.recruiterId.toString() !== userId.toString()) {
    throw new ForbiddenError('Only the recruiter can cancel the interview');
  }

  // Can only cancel if status is SCHEDULED or RESCHEDULED
  if (!['SCHEDULED', 'RESCHEDULED'].includes(interview.status)) {
    throw new BadRequestError(`Cannot cancel interview with status: ${interview.status}`);
  }

  // Update interview
  interview.status = 'CANCELLED';
  interview.changeHistory.push({
    timestamp: new Date(),
    action: 'CANCELLED',
    reason: reason || 'Interview cancelled by recruiter',
    actor: userId
  });

  await interview.save();

  // Update application activity history
  if (interview.applicationId) {
    await Application.findByIdAndUpdate(interview.applicationId, {
      $push: {
        activityHistory: {
          action: 'INTERVIEW_CANCELLED',
          detail: `Nhà tuyển dụng đã hủy cuộc phỏng vấn. Lý do: ${reason || 'Không có lý do được cung cấp'}`,
          timestamp: new Date()
        }
      }
    });
  }

  // Send notification via RabbitMQ
  queueService.publishNotification(rabbitmq.ROUTING_KEYS.INTERVIEW_CANCEL, {
    recipientId: interview.candidateId._id.toString(),
    data: {
      interviewId: interview._id.toString()
    }
  });

  logger.info(`Interview ${interviewId} cancelled by recruiter ${userId}`);

  return interview;
};

/**
 * Reschedule interview
 * @param {string} interviewId - ID of the interview
 * @param {string} userId - ID of the user rescheduling (must be recruiter)
 * @param {Date} newScheduledAt - New scheduled time
 * @param {string} reason - Reason for rescheduling
 * @returns {Object} Updated interview
 */
export const rescheduleInterview = async (interviewId, userId, newScheduledAt, reason = '') => {
  if (!interviewId || !userId || !newScheduledAt) {
    throw new BadRequestError('Interview ID, User ID, and new scheduled time are required');
  }

  // Validate new scheduled time is in the future
  const newScheduledDate = new Date(newScheduledAt);
  if (newScheduledDate <= new Date()) {
    throw new BadRequestError('New scheduled time must be in the future');
  }

  const interview = await InterviewRoom.findById(interviewId)
    .populate('candidateId', 'fullName email')
    .populate({
      path: 'applicationId',
      select: 'jobSnapshot'
    });

  if (!interview) {
    throw new NotFoundError('Interview not found');
  }

  // Only recruiter can reschedule
  if (interview.recruiterId.toString() !== userId.toString()) {
    throw new ForbiddenError('Only the recruiter can reschedule the interview');
  }

  // Can only reschedule if status is SCHEDULED or RESCHEDULED
  if (!['SCHEDULED', 'RESCHEDULED'].includes(interview.status)) {
    throw new BadRequestError(`Cannot reschedule interview with status: ${interview.status}`);
  }

  // Store old scheduled time
  const oldScheduledTime = interview.scheduledTime;

  // Update interview
  interview.scheduledTime = newScheduledDate;
  interview.status = 'RESCHEDULED';
  interview.isReminderSent = false; // Reset reminder flag
  interview.changeHistory.push({
    timestamp: new Date(),
    action: 'RESCHEDULED',
    fromTime: oldScheduledTime,
    toTime: newScheduledDate,
    reason: reason || 'Lịch phỏng vấn đã được dời',
    actor: userId
  });

  await interview.save();

  // Update application activity history
  if (interview.applicationId) {
    await Application.findByIdAndUpdate(interview.applicationId, {
      $push: {
        activityHistory: {
          action: 'INTERVIEW_RESCHEDULED',
          detail: `Nhà tuyển dụng đã thay đổi lịch phỏng vấn từ ${oldScheduledTime.toLocaleString('vi-VN')} sang ${newScheduledDate.toLocaleString('vi-VN')}`,
          timestamp: new Date()
        }
      }
    });
  }

  // Send notification via RabbitMQ
  queueService.publishNotification(rabbitmq.ROUTING_KEYS.INTERVIEW_RESCHEDULE, {
    recipientId: interview.candidateId._id.toString(),
    data: {
      interviewId: interview._id.toString(),
      newScheduledTime: newScheduledDate.toISOString()
    }
  });

  logger.info(`Interview ${interviewId} rescheduled by recruiter ${userId} to ${newScheduledDate.toISOString()}`);

  return interview;
};

// =================================================================
// Chat and Recording Functions (Task 2.3)
// =================================================================

/**
 * Save chat message to interview transcript
 * @param {string} interviewId - ID of the interview
 * @param {string} senderId - ID of the message sender
 * @param {string} message - Message content
 * @returns {Object} Updated interview with new message
 */
export const saveChatMessage = async (interviewId, senderId, message) => {
  if (!interviewId || !senderId || !message) {
    throw new BadRequestError('Interview ID, sender ID, and message are required');
  }

  // Validate message length
  if (message.length > 2000) {
    throw new BadRequestError('Message cannot exceed 2000 characters');
  }

  const interview = await InterviewRoom.findById(interviewId);

  if (!interview) {
    throw new NotFoundError('Interview not found');
  }

  // Check if sender is a participant
  const isParticipant =
    interview.recruiterId.toString() === senderId.toString() ||
    interview.candidateId.toString() === senderId.toString();

  if (!isParticipant) {
    throw new ForbiddenError('You are not a participant in this interview');
  }

  // Check if interview is active or scheduled
  const allowedStatuses = ['SCHEDULED', 'STARTED', 'RESCHEDULED'];
  if (!allowedStatuses.includes(interview.status)) {
    throw new BadRequestError('Can only send messages during an active or scheduled interview');
  }

  // Add message to chat transcript
  const newMessage = {
    senderId,
    message: message.trim(),
    timestamp: new Date()
  };

  // Use $push to add message without triggering full document validation
  // This avoids validation errors on scheduledTime for past interviews
  const result = await InterviewRoom.findByIdAndUpdate(
    interviewId,
    { $push: { chatTranscript: newMessage } },
    { new: true, runValidators: false } // Don't run validators to avoid scheduledTime validation
  );

  if (!result) {
    throw new NotFoundError('Interview not found after update');
  }

  // Get the newly added message (last item in array)
  const savedMessage = result.chatTranscript[result.chatTranscript.length - 1];

  logger.info(`Chat message saved to interview ${interviewId} from user ${senderId}`);

  return {
    success: true,
    message: savedMessage
  };
};

/**
 * Save recording metadata and Cloudinary integration
 * @param {string} interviewId - ID of the interview
 * @param {Object} recordingData - Recording metadata (url, duration, size, cloudinaryPublicId)
 * @returns {Object} Updated interview with recording info
 */
export const saveRecording = async (interviewId, recordingData) => {
  if (!interviewId || !recordingData) {
    throw new BadRequestError('Interview ID and recording data are required');
  }

  const { url, duration, size, cloudinaryPublicId } = recordingData;

  if (!url) {
    throw new BadRequestError('Recording URL is required');
  }

  const interview = await InterviewRoom.findById(interviewId);

  if (!interview) {
    throw new NotFoundError('Interview not found');
  }

  // Check if interview is completed
  if (interview.status !== 'COMPLETED') {
    throw new BadRequestError('Can only save recording for completed interviews');
  }

  // Update recording information
  interview.recording = {
    enabled: true,
    url,
    duration: duration || 0,
    size: size || 0
  };

  // Store cloudinaryPublicId in changeHistory for reference
  interview.changeHistory.push({
    timestamp: new Date(),
    action: 'RECORDING_SAVED',
    notes: `Recording saved. Duration: ${duration || 0}s, Size: ${size || 0} bytes${cloudinaryPublicId ? `, Cloudinary ID: ${cloudinaryPublicId}` : ''}`,
    actor: interview.recruiterId
  });

  await interview.save();

  // Send notification to candidate and recruiter that recording is available
  queueService.publishNotification(rabbitmq.ROUTING_KEYS.RECORDING_AVAILABLE, {
    type: 'RECORDING_AVAILABLE',
    data: {
      interviewId: interview._id.toString(),
      recordingDuration: duration || 0
    }
  });

  logger.info(`Recording saved for interview ${interviewId}. URL: ${url}`);

  return interview;
};

/**
 * Check if user has access to interview
 * @param {string} interviewId - ID of the interview
 * @param {string} userId - ID of the user
 * @returns {Object} Access information
 */
export const checkInterviewAccess = async (interviewId, userId) => {
  if (!interviewId || !userId) {
    throw new BadRequestError('Interview ID and User ID are required');
  }

  const interview = await InterviewRoom.findById(interviewId)
    .select('recruiterId candidateId status')
    .lean();

  if (!interview) {
    throw new NotFoundError('Interview not found');
  }

  const isRecruiter = interview.recruiterId.toString() === userId.toString();
  const isCandidate = interview.candidateId.toString() === userId.toString();
  const hasAccess = isRecruiter || isCandidate;

  return {
    hasAccess,
    isRecruiter,
    isCandidate,
    interviewStatus: interview.status
  };
};

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
    .populate('candidateId', 'fullName email avatar')
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
export const sendInterviewReminders = async (minutesBefore = 60) => {
  const now = new Date();
  const reminderTime = new Date(now.getTime() + minutesBefore * 60 * 1000);
  const endTime = new Date(now.getTime() + (minutesBefore + 60) * 60 * 1000);
  console.log(`Sending interview reminders for interviews scheduled between ${reminderTime} and ${endTime}`);
  const interviews = await InterviewRoom.find({
    status: { $in: ['SCHEDULED', 'RESCHEDULED'] },
    isReminderSent: false,
    scheduledTime: {
      $gte: reminderTime.toISOString(),
      $lt: endTime.toISOString()
    }
  });

  let sentCount = 0;

  for (const interview of interviews) {
    try {
      // Gửi reminder cho candidate/recruiter qua RabbitMQ (ko cần chỉ định recipientId vì đã có trong model)
      queueService.publishNotification(rabbitmq.ROUTING_KEYS.INTERVIEW_REMINDER, {
        type: 'INTERVIEW_REMINDER',
        data: {
          interviewId: interview._id.toString()
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