import express from 'express';
import passport from 'passport';
import * as applicationController from '../controllers/application.controller.js';
import * as authMiddleware from '../middleware/auth.middleware.js';
import * as validationMiddleware from '../middleware/validation.middleware.js';
import * as applicationSchema from '../schemas/application.schema.js';
import * as interviewSchema from '../schemas/interview.schema.js';

const router = express.Router();

// ==========================================================
// === NEW: ALL CANDIDATES MANAGEMENT ROUTES (PUT FIRST) ===
// ==========================================================

// Route để lấy TẤT CẢ applications từ tất cả jobs của recruiter
router.get(
  '/recruiter/all',
  passport.authenticate('jwt', { session: false }),
  authMiddleware.recruiterOnly,
  validationMiddleware.validateQuery(applicationSchema.getAllApplicationsQuery),
  applicationController.getAllApplications
);

// Route để lấy thống kê tổng quan
router.get(
  '/recruiter/statistics',
  passport.authenticate('jwt', { session: false }),
  authMiddleware.recruiterOnly,
  validationMiddleware.validateQuery(applicationSchema.getStatisticsQuery),
  applicationController.getApplicationsStatistics
);

// Route để bulk update status
router.patch(
  '/recruiter/bulk/status',
  passport.authenticate('jwt', { session: false }),
  authMiddleware.recruiterOnly,
  validationMiddleware.validateBody(applicationSchema.bulkUpdateStatusBody),
  applicationController.bulkUpdateStatus
);



// Route để export applications to CSV
router.post(
  '/recruiter/export',
  passport.authenticate('jwt', { session: false }),
  authMiddleware.recruiterOnly,
  validationMiddleware.validateBody(applicationSchema.exportApplicationsBody),
  applicationController.exportApplications
);

// ==========================================================
// === EXISTING ROUTES (JOB-SPECIFIC) ===
// ==========================================================

// Route để lấy danh sách ứng viên đã ứng tuyển vào một công việc cụ thể
router.get(
  '/jobs/:jobId/applications',
  passport.authenticate('jwt', { session: false }),
  authMiddleware.recruiterOnly,
  validationMiddleware.validateParams(applicationSchema.jobIdParam),
  validationMiddleware.validateQuery(applicationSchema.getApplicationsQuery),
  applicationController.getApplicationsByJob
);

// Route để lấy dữ liệu CV template để render trong iframe (ĐẶT TRƯỚC /:applicationId)
// Hỗ trợ token từ query param (cho iframe) hoặc header Authorization
router.get(
  '/:applicationId/render-cv',
  // Custom middleware để xử lý token từ query param
  (req, res, next) => {
    // Nếu có token trong query param, chuyển vào header để passport xử lý
    if (req.query.token && !req.headers.authorization) {
      req.headers.authorization = `Bearer ${req.query.token}`;
    }
    next();
  },
  passport.authenticate('jwt', { session: false }),
  authMiddleware.recruiterOnly,
  validationMiddleware.validateParams(applicationSchema.applicationIdParam),
  applicationController.getApplicationCVData
);

// Route để xem chi tiết một đơn ứng tuyển
router.get(
  '/:applicationId',
  passport.authenticate('jwt', { session: false }),
  authMiddleware.recruiterOnly,
  validationMiddleware.validateParams(applicationSchema.applicationIdParam),
  applicationController.getApplicationById
);

// Route để cập nhật trạng thái một đơn ứng tuyển
router.patch(
  '/:applicationId/status',
  passport.authenticate('jwt', { session: false }),
  authMiddleware.recruiterOnly,
  validationMiddleware.validateParams(applicationSchema.applicationIdParam),
  validationMiddleware.validateBody(applicationSchema.updateApplicationStatusBody),
  applicationController.updateApplicationStatus
);

// Route để cập nhật ghi chú cho đơn ứng tuyển
router.patch(
  '/:applicationId/notes',
  passport.authenticate('jwt', { session: false }),
  authMiddleware.recruiterOnly,
  validationMiddleware.validateParams(applicationSchema.applicationIdParam),
  validationMiddleware.validateBody(applicationSchema.updateApplicationNotesBody),
  applicationController.updateApplicationNotes
);



export default router;
