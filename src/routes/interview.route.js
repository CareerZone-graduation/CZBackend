import express from 'express';
import passport from 'passport';
import * as interviewController from '../controllers/interview.controller.js';
import * as authMiddleware from '../middleware/auth.middleware.js';
import * as validationMiddleware from '../middleware/validation.middleware.js';
import * as interviewSchema from '../schemas/interview.schema.js';
import * as commonSchema from '../schemas/common.schema.js';

const router = express.Router();

// Tất cả route yêu cầu xác thực
router.use(passport.authenticate('jwt', { session: false }));
// === Routes dành cho Recruiter ===
// Lấy danh sách cuộc phỏng vấn của recruiter
router.get(
  '/my-interviews',
  authMiddleware.recruiterOnly,
  validationMiddleware.validateQuery(interviewSchema.interviewQuerySchema),
  interviewController.getMyInterviews
);

// === Routes dành cho Candidate ===
// Lấy danh sách cuộc phỏng vấn của candidate
router.get(
  '/my-scheduled-interviews',
  authMiddleware.candidateOnly,
  validationMiddleware.validateQuery(interviewSchema.interviewQuerySchema),
  interviewController.getMyCandidateInterviews
);

// === Core Interview Management Routes (Task 4.1) ===

/**
 * @route   POST /api/interviews
 * @desc    Schedule a new interview
 * @access  Private/Recruiter
 * Requirements: 1.1, 1.2
 */
router.post(
  '/',
  authMiddleware.recruiterOnly,
  validationMiddleware.validateBody(interviewSchema.scheduleInterviewBody),
  interviewController.scheduleInterview
);

/**
 * @route   GET /api/interviews
 * @desc    List interviews with filtering (role-based)
 * @access  Private
 * Requirements: 9.1, 9.2
 */
router.get(
  '/',
  authMiddleware.candidateOrRecruiter,
  validationMiddleware.validateQuery(interviewSchema.getInterviewsQuery),
  interviewController.listInterviews
);

/**
 * @route   GET /api/interviews/:id
 * @desc    Get interview by ID
 * @access  Private
 * Requirements: 9.1, 9.2
 */
router.get(
  '/:id',
  authMiddleware.candidateOrRecruiter,
  validationMiddleware.validateParams(interviewSchema.interviewIdParam),
  interviewController.getInterviewById
);

/**
 * @route   PATCH /api/interviews/:id/status
 * @desc    Update interview status
 * @access  Private
 * Requirements: 1.1, 1.2
 */
router.patch(
  '/:id/status',
  authMiddleware.candidateOrRecruiter,
  validationMiddleware.validateParams(interviewSchema.interviewIdParam),
  validationMiddleware.validateBody(interviewSchema.updateInterviewStatusBody),
  interviewController.updateInterviewStatus
);

// === Interview Session Control Routes (Task 4.2) ===

/**
 * @route   POST /api/interviews/:id/join
 * @desc    Join interview with validation
 * @access  Private
 * Requirements: 2.1, 7.1
 */
router.post(
  '/:id/join',
  authMiddleware.candidateOrRecruiter,
  validationMiddleware.validateParams(interviewSchema.interviewIdParam),
  validationMiddleware.validateBody(interviewSchema.joinInterviewBody),
  interviewController.joinInterview
);

/**
 * @route   POST /api/interviews/:id/start
 * @desc    Start interview
 * @access  Private/Recruiter
 * Requirements: 2.1, 7.1
 */
router.post(
  '/:id/start',
  authMiddleware.recruiterOnly,
  validationMiddleware.validateParams(interviewSchema.interviewIdParam),
  interviewController.startInterviewSession
);

/**
 * @route   POST /api/interviews/:id/end
 * @desc    End interview with feedback
 * @access  Private/Recruiter
 * Requirements: 7.1, 7.3
 */
router.post(
  '/:id/end',
  authMiddleware.recruiterOnly,
  validationMiddleware.validateParams(interviewSchema.interviewIdParam),
  validationMiddleware.validateBody(interviewSchema.endInterviewBody),
  interviewController.endInterviewSession
);

/**
 * @route   PATCH /api/interviews/:id/reschedule
 * @desc    Reschedule interview
 * @access  Private/Recruiter
 * Requirements: 1.5
 */
router.patch(
  '/:id/reschedule',
  authMiddleware.recruiterOnly,
  validationMiddleware.validateParams(interviewSchema.interviewIdParam),
  validationMiddleware.validateBody(interviewSchema.rescheduleInterviewBody),
  interviewController.rescheduleInterviewSession
);

/**
 * @route   DELETE /api/interviews/:id
 * @desc    Cancel interview
 * @access  Private/Recruiter
 * Requirements: 7.3
 */
router.delete(
  '/:id',
  authMiddleware.recruiterOnly,
  validationMiddleware.validateParams(interviewSchema.interviewIdParam),
  validationMiddleware.validateBody(interviewSchema.cancelInterviewBody),
  interviewController.cancelInterviewSession
);

/**
 * @route   GET /api/interviews/:id/recording
 * @desc    Get recording with access control
 * @access  Private
 * Requirements: 9.3
 */
router.get(
  '/:id/recording',
  authMiddleware.candidateOrRecruiter,
  validationMiddleware.validateParams(interviewSchema.interviewIdParam),
  interviewController.getRecording
);

// =================================================================
// Legacy Routes (Backward Compatibility)
// =================================================================

// === Routes chung cho cả Recruiter và Candidate ===
// Lấy chi tiết một cuộc phỏng vấn (đặt trước các routes có params động)
router.get(
  '/:id/details',
  authMiddleware.candidateOrRecruiter,
  validationMiddleware.validateParams(commonSchema.idParamSchema),
  interviewController.getInterviewDetails
);

// Hủy lịch phỏng vấn
router.patch(
  '/:id/cancel',
  authMiddleware.recruiterOnly,
  validationMiddleware.validateParams(commonSchema.idParamSchema),
  validationMiddleware.validateBody(interviewSchema.cancelInterviewBody),
  interviewController.cancelInterview
);

// Bắt đầu phỏng vấn
router.patch(
  '/:id/start',
  authMiddleware.recruiterOnly,
  validationMiddleware.validateParams(commonSchema.idParamSchema),
  interviewController.startInterview
);

// Kết thúc phỏng vấn
router.patch(
  '/:id/complete',
  authMiddleware.recruiterOnly,
  validationMiddleware.validateParams(commonSchema.idParamSchema),
  interviewController.completeInterview
);

// Thêm ghi chú vào cuộc phỏng vấn
router.patch(
  '/:id/add-note',
  authMiddleware.recruiterOnly,
  validationMiddleware.validateParams(commonSchema.idParamSchema),
  interviewController.addInterviewNote
);




export default router;