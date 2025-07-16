import express from 'express';
import * as applicationController from '../controllers/application.controller.js';
import * as authMiddleware from '../middleware/auth.middleware.js';
import * as validationMiddleware from '../middleware/validation.middleware.js';
import * as applicationSchema from '../schemas/application.schema.js';
import * as interviewSchema from '../schemas/interview.schema.js';

const router = express.Router();

// Route để lấy danh sách ứng viên đã ứng tuyển vào một công việc cụ thể
router.get(
  '/jobs/:jobId/applications',
  authMiddleware.authenticate,
  authMiddleware.recruiterOnly,
  validationMiddleware.validateParams(applicationSchema.jobIdParam),
  validationMiddleware.validateQuery(applicationSchema.getApplicationsQuery),
  applicationController.getApplicationsByJob
);

// Route để xem chi tiết một đơn ứng tuyển
router.get(
  '/:applicationId',
  authMiddleware.authenticate,
  authMiddleware.recruiterOnly,
  validationMiddleware.validateParams(applicationSchema.applicationIdParam),
  applicationController.getApplicationById
);

// Route để cập nhật trạng thái một đơn ứng tuyển
router.patch(
  '/:applicationId/status',
  authMiddleware.authenticate,
  authMiddleware.recruiterOnly,
  validationMiddleware.validateParams(applicationSchema.applicationIdParam),
  validationMiddleware.validateBody(applicationSchema.updateApplicationStatusBody),
  applicationController.updateApplicationStatus
);

// Route để đánh giá ứng viên
router.patch(
  '/:applicationId/rating',
  authMiddleware.authenticate,
  authMiddleware.recruiterOnly,
  validationMiddleware.validateParams(applicationSchema.applicationIdParam),
  validationMiddleware.validateBody(applicationSchema.updateCandidateRatingBody),
  applicationController.updateCandidateRating
);

// Route để cập nhật ghi chú cho đơn ứng tuyển
router.patch(
  '/:applicationId/notes',
  authMiddleware.authenticate,
  authMiddleware.recruiterOnly,
  validationMiddleware.validateParams(applicationSchema.applicationIdParam),
  validationMiddleware.validateBody(applicationSchema.updateApplicationNotesBody),
  applicationController.updateApplicationNotes
);

// Route để nhà tuyển dụng tạo lịch phỏng vấn cho một đơn ứng tuyển
router.post(
  '/:applicationId/interviews',
  authMiddleware.authenticate,
  authMiddleware.recruiterOnly,
  validationMiddleware.validateParams(applicationSchema.applicationIdParam),
  validationMiddleware.validateBody(interviewSchema.scheduleInterviewBody),
  applicationController.scheduleInterview
);

export default router;
