import asyncHandler from 'express-async-handler';
import * as interviewService from '../services/interview.service.js';

/**
 * @desc    Lấy danh sách cuộc phỏng vấn của recruiter
 * @route   GET /api/interviews/my-interviews
 * @access  Private/Recruiter
 */
export const getMyInterviews = asyncHandler(async (req, res) => {
  const recruiterId = req.user._id;
  const { page, limit, status } = req.validatedQuery;

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
  const { page, limit, status } = req.validatedQuery;

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
 * @desc    Lấy chi tiết một cuộc phỏng vấn
 * @route   GET /api/interviews/:id
 * @access  Private
 */
export const getInterviewById = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const userId = req.user._id;
  const userRole = req.user.role;

  const interview = await interviewService.getInterviewDetails(id, userId, userRole);

  res.status(200).json({
    success: true,
    message: 'Lấy thông tin cuộc phỏng vấn thành công.',
    data: interview
  });
});

/**
 * @desc    Dời lịch phỏng vấn
 * @route   PATCH /api/interviews/:id/reschedule
 * @access  Private/Recruiter
 */
export const rescheduleInterview = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const recruiterId = req.user._id;
  const { scheduledTime, reason } = req.body;

  const interview = await interviewService.rescheduleInterview(id, recruiterId, {
    scheduledTime,
    reason
  });

  res.status(200).json({
    success: true,
    message: 'Dời lịch phỏng vấn thành công.',
    data: interview
  });
});

/**
 * @desc    Hủy lịch phỏng vấn
 * @route   PATCH /api/interviews/:id/cancel
 * @access  Private/Recruiter
 */
export const cancelInterview = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const recruiterId = req.user._id;
  const { reason } = req.body;

  const interview = await interviewService.cancelInterview(id, recruiterId, { reason });

  res.status(200).json({
    success: true,
    message: 'Hủy lịch phỏng vấn thành công.',
    data: interview
  });
});

/**
 * @desc    Bắt đầu phỏng vấn
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
 * @desc    Kết thúc phỏng vấn
 * @route   PATCH /api/interviews/:id/complete
 * @access  Private/Recruiter
 */
export const completeInterview = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const recruiterId = req.user._id;
  const { notes } = req.body;

  const interview = await interviewService.completeInterview(id, recruiterId, { notes });

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

