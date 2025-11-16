import asyncHandler from 'express-async-handler';
import * as interviewService from '../services/interview.service.js';

// =================================================================
// Task 4.1: Core Interview Controller Functions
// =================================================================

/**
 * @desc    Schedule a new interview
 * @route   POST /api/interviews
 * @access  Private/Recruiter
 * Requirements: 1.1, 1.2
 */
export const scheduleInterview = asyncHandler(async (req, res) => {
  const recruiterId = req.user._id;
  const { jobId, applicationId, candidateId, scheduledAt, duration } = req.body;

  const interview = await interviewService.scheduleInterview(
    recruiterId,
    candidateId,
    jobId,
    applicationId,
    scheduledAt,
    duration
  );

  res.status(201).json({
    success: true,
    message: 'Interview scheduled successfully',
    data: interview
  });
});

/**
 * @desc    Get interview by ID
 * @route   GET /api/interviews/:id
 * @access  Private
 * Requirements: 9.1, 9.2
 */
export const getInterviewById = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const userId = req.user._id;

  const interview = await interviewService.getInterviewById(id, userId);

  res.status(200).json({
    success: true,
    message: 'Interview retrieved successfully',
    data: interview
  });
});

/**
 * @desc    List interviews with filtering
 * @route   GET /api/interviews
 * @access  Private
 * Requirements: 9.1, 9.2
 */
export const listInterviews = asyncHandler(async (req, res) => {
  const userId = req.user._id;
  const userRole = req.user.role;
  const filters = req.validatedQuery || req.query;

  let result;
  
  if (userRole === 'recruiter') {
    result = await interviewService.getInterviewsByRecruiter(userId, filters);
  } else if (userRole === 'candidate') {
    result = await interviewService.getInterviewsByCandidate(userId, filters);
  } else {
    return res.status(403).json({
      success: false,
      message: 'Access denied'
    });
  }

  res.status(200).json({
    success: true,
    message: 'Interviews retrieved successfully',
    data: result.data,
    meta: result.meta
  });
});

/**
 * @desc    Update interview status
 * @route   PATCH /api/interviews/:id/status
 * @access  Private
 * Requirements: 1.1, 1.2
 */
export const updateInterviewStatus = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const userId = req.user._id;
  const { status } = req.body;

  const interview = await interviewService.updateInterviewStatus(id, status, userId);

  res.status(200).json({
    success: true,
    message: 'Interview status updated successfully',
    data: interview
  });
});

/**
 * @desc    Lấy danh sách cuộc phỏng vấn của recruiter
 * @route   GET /api/interviews/my-interviews
 * @access  Private/Recruiter
 */
export const getMyInterviews = asyncHandler(async (req, res) => {
  const recruiterId = req.user._id;
  const { page, limit, status } = req.validatedQuery || req.query;

  const result = await interviewService.getRecruiterInterviews(recruiterId, { page, limit, status });

  res.status(200).json({
    success: true,
    message: 'Lấy danh sách cuộc phỏng vấn thành công.',
    meta: result.meta,
    data: result.data
  });
});

/**
 * @desc    Lấy danh sách cuộc phỏng vấn của candidate
 * @route   GET /api/interviews/my-scheduled-interviews
 * @access  Private/Candidate
 */
export const getMyCandidateInterviews = asyncHandler(async (req, res) => {
  const candidateId = req.user._id;
  const { page, limit, status } = req.validatedQuery || req.query;

  const result = await interviewService.getCandidateInterviews(candidateId, { page, limit, status });

  res.status(200).json({
    success: true,
    message: 'Lấy danh sách cuộc phỏng vấn thành công.',
    meta: result.meta,
    data: result.data
  });
});

/**
 * @desc    Lấy chi tiết một cuộc phỏng vấn
 * @route   GET /api/interviews/:id/details
 * @access  Private
 */
export const getInterviewDetails = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const userId = req.user._id;
  const userRole = req.user.role;

  const interview = await interviewService.getInterviewDetails(id, userId, userRole);

  res.status(200).json({
    success: true,
    message: 'Lấy thông tin chi tiết cuộc phỏng vấn thành công.',
    data: interview
  });
});


/**
 * @desc    Dời lịch phỏng vấn (Legacy)
 * @route   PATCH /api/interviews/:id/reschedule
 * @access  Private/Recruiter
 */
export const rescheduleInterview = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const recruiterId = req.user._id;
  const { scheduledTime, reason } = req.body;

  const interview = await interviewService.rescheduleInterview(id, recruiterId, scheduledTime, reason);

  res.status(200).json({
    success: true,
    message: 'Dời lịch phỏng vấn thành công.',
    data: interview
  });
});

/**
 * @desc    Hủy lịch phỏng vấn (Legacy)
 * @route   PATCH /api/interviews/:id/cancel
 * @access  Private/Recruiter
 */
export const cancelInterview = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const recruiterId = req.user._id;
  const { reason } = req.body;

  const interview = await interviewService.cancelInterview(id, recruiterId, reason);

  res.status(200).json({
    success: true,
    message: 'Hủy lịch phỏng vấn thành công.',
    data: interview
  });
});

/**
 * @desc    Bắt đầu phỏng vấn (Legacy)
 * @route   PATCH /api/interviews/:id/start
 * @access  Private/Recruiter
 */
export const startInterview = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const recruiterId = req.user._id;

  const interview = await interviewService.startInterview(id, recruiterId);

  res.status(200).json({
    success: true,
    message: 'Bắt đầu phỏng vấn thành công.',
    data: interview
  });
});

/**
 * @desc    Kết thúc phỏng vấn (Legacy)
 * @route   PATCH /api/interviews/:id/complete
 * @access  Private/Recruiter
 */
export const completeInterview = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const recruiterId = req.user._id;
  const { notes } = req.body;

  // Use endInterview service function with feedback object
  const interview = await interviewService.endInterview(id, recruiterId, { notes });

  res.status(200).json({
    success: true,
    message: 'Kết thúc phỏng vấn thành công.',
    data: interview
  });
});

/**
 * @desc    Thêm ghi chú vào cuộc phỏng vấn
 * @route   PATCH /api/interviews/:id/add-note
 * @access  Private/Recruiter
 */
export const addInterviewNote = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const recruiterId = req.user._id;
  const { notes } = req.body;

  const interview = await interviewService.addInterviewNote(id, recruiterId, notes);

  res.status(200).json({
    success: true,
    message: 'Thêm ghi chú thành công.',
    data: interview
  });
});

// =================================================================
// Task 4.2: Interview Session Controllers
// =================================================================

/**
 * @desc    Join interview with validation
 * @route   POST /api/interviews/:id/join
 * @access  Private
 * Requirements: 2.1, 7.1
 */
export const joinInterview = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const userId = req.user._id;
  const deviceInfo = req.body.deviceInfo || {};

  const result = await interviewService.joinInterview(id, userId);

  res.status(200).json({
    success: true,
    message: 'Interview join validated successfully',
    data: {
      interview: result.interview,
      canJoin: result.canJoin,
      userRole: result.userRole,
      roomId: result.interview.roomId
    }
  });
});

/**
 * @desc    Start interview
 * @route   POST /api/interviews/:id/start
 * @access  Private/Recruiter
 * Requirements: 2.1, 7.1
 */
export const startInterviewSession = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const userId = req.user._id;

  const interview = await interviewService.startInterview(id, userId);

  res.status(200).json({
    success: true,
    message: 'Interview started successfully',
    data: interview
  });
});

/**
 * @desc    End interview with feedback
 * @route   POST /api/interviews/:id/end
 * @access  Private/Recruiter
 * Requirements: 7.1, 7.3
 */
export const endInterviewSession = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const userId = req.user._id;
  const feedback = req.body.feedback || {};

  const interview = await interviewService.endInterview(id, userId, feedback);

  res.status(200).json({
    success: true,
    message: 'Interview ended successfully',
    data: interview
  });
});

/**
 * @desc    Reschedule interview
 * @route   PATCH /api/interviews/:id/reschedule
 * @access  Private/Recruiter
 * Requirements: 1.5
 */
export const rescheduleInterviewSession = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const userId = req.user._id;
  const { scheduledAt, reason } = req.body;

  const interview = await interviewService.rescheduleInterview(id, userId, scheduledAt, reason);

  res.status(200).json({
    success: true,
    message: 'Interview rescheduled successfully',
    data: interview
  });
});

/**
 * @desc    Cancel interview
 * @route   DELETE /api/interviews/:id
 * @access  Private/Recruiter
 * Requirements: 7.3
 */
export const cancelInterviewSession = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const userId = req.user._id;
  const { reason } = req.body;

  const interview = await interviewService.cancelInterview(id, userId, reason);

  res.status(200).json({
    success: true,
    message: 'Interview cancelled successfully',
    data: interview
  });
});

/**
 * @desc    Get recording with access control
 * @route   GET /api/interviews/:id/recording
 * @access  Private
 * Requirements: 9.3
 */
export const getRecording = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const userId = req.user._id;

  // First check access
  const accessInfo = await interviewService.checkInterviewAccess(id, userId);
  
  if (!accessInfo.hasAccess) {
    return res.status(403).json({
      success: false,
      message: 'You do not have permission to access this recording'
    });
  }

  // Get interview with recording info
  const interview = await interviewService.getInterviewById(id, userId);

  if (!interview.recording || !interview.recording.url) {
    return res.status(404).json({
      success: false,
      message: 'Recording not found for this interview'
    });
  }

  res.status(200).json({
    success: true,
    message: 'Recording retrieved successfully',
    data: {
      recording: interview.recording,
      interviewId: interview._id,
      roomName: interview.roomName,
      scheduledTime: interview.scheduledTime
    }
  });
});

