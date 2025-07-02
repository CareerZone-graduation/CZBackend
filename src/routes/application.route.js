import express from 'express';
import * as applicationController from '../controllers/application.controller.js';
import { authenticate } from '../middleware/auth.middleware.js';
import { recruiterOnly } from '../middleware/auth.middleware.js';
import { validateParams, validateQuery, validateBody } from '../middleware/validation.middleware.js';
import * as applicationSchema from '../schemas/application.schema.js';
import * as interviewSchema from '../schemas/interview.schema.js';

const router = express.Router();

// Route để lấy danh sách ứng viên đã ứng tuyển vào một công việc cụ thể
router.get(
  '/jobs/:jobId/applications',
  authenticate,
  recruiterOnly,
  validateParams(applicationSchema.jobIdParam),
  validateQuery(applicationSchema.getApplicationsQuery),
  applicationController.getApplicationsByJob
);

// Route để xem chi tiết một đơn ứng tuyển
router.get(
  '/:applicationId',
  authenticate,
  recruiterOnly,
  validateParams(applicationSchema.applicationIdParam),
  applicationController.getApplicationById
);

// Route để cập nhật trạng thái một đơn ứng tuyển
router.patch(
  '/:applicationId/status',
  authenticate,
  recruiterOnly,
  validateParams(applicationSchema.applicationIdParam),
  validateBody(applicationSchema.updateApplicationStatusBody),
  applicationController.updateApplicationStatus
);

// Route để đánh giá ứng viên
router.patch(
  '/:applicationId/rating',
  authenticate,
  recruiterOnly,
  validateParams(applicationSchema.applicationIdParam),
  validateBody(applicationSchema.updateCandidateRatingBody),
  applicationController.updateCandidateRating
);

// Route để cập nhật ghi chú cho đơn ứng tuyển
router.patch(
  '/:applicationId/notes',
  authenticate,
  recruiterOnly,
  validateParams(applicationSchema.applicationIdParam),
  validateBody(applicationSchema.updateApplicationNotesBody),
  applicationController.updateApplicationNotes
);

// Route để nhà tuyển dụng tạo lịch phỏng vấn cho một đơn ứng tuyển
router.post(
  '/:applicationId/interviews',
  authenticate,
  recruiterOnly,
  validateParams(applicationSchema.applicationIdParam),
  validateBody(interviewSchema.scheduleInterviewBody),
  applicationController.scheduleInterview
);

export default router;
