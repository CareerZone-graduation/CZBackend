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

// === Routes chung cho cả Recruiter và Candidate ===
// Lấy chi tiết một cuộc phỏng vấn (đặt trước các routes có params động)
router.get(
  '/:id/details',
  authMiddleware.candidateOrRecruiter,
  validationMiddleware.validateParams(commonSchema.idParamSchema),
  interviewController.getInterviewDetails
);

// === Routes dành cho Recruiter ===
// Lấy danh sách cuộc phỏng vấn của recruiter
router.get(
  '/my-interviews',
  authMiddleware.recruiterOnly,
  validationMiddleware.validateQuery(interviewSchema.interviewQuerySchema),
  interviewController.getMyInterviews
);

// Dời lịch phỏng vấn
router.patch(
  '/:id/reschedule',
  authMiddleware.recruiterOnly,
  validationMiddleware.validateParams(commonSchema.idParamSchema),
  validationMiddleware.validateBody(interviewSchema.rescheduleInterviewSchema),
  interviewController.rescheduleInterview
);

// Hủy lịch phỏng vấn
router.patch(
  '/:id/cancel',
  authMiddleware.recruiterOnly,
  validationMiddleware.validateParams(commonSchema.idParamSchema),
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
  validationMiddleware.validateBody(interviewSchema.updateInterviewStatusSchema.pick({ notes: true })),
  interviewController.completeInterview
);

// Thêm ghi chú vào cuộc phỏng vấn
router.patch(
  '/:id/add-note',
  authMiddleware.recruiterOnly,
  validationMiddleware.validateParams(commonSchema.idParamSchema),
  validationMiddleware.validateBody(interviewSchema.updateInterviewStatusSchema.pick({ notes: true })),
  interviewController.addInterviewNote
);

// === Routes dành cho Candidate ===
// Lấy danh sách cuộc phỏng vấn của candidate
router.get(
  '/my-scheduled-interviews',
  authMiddleware.candidateOnly,
  validationMiddleware.validateQuery(interviewSchema.interviewQuerySchema),
  interviewController.getMyCandidateInterviews
);


export default router;