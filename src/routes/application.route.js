import express from 'express';
import passport from 'passport';
import * as applicationController from '../controllers/application.controller.js';
import * as authMiddleware from '../middleware/auth.middleware.js';
import * as validationMiddleware from '../middleware/validation.middleware.js';
import * as applicationSchema from '../schemas/application.schema.js';
import * as interviewSchema from '../schemas/interview.schema.js';
import * as workflowController from '../controllers/workflow.controller.js';
import { z } from 'zod';

const router = express.Router();



// ==========================================================
// === EXISTING ROUTES (JOB-SPECIFIC) ===
// ==========================================================

// Route so sánh ứng viên tự do
router.post(
  '/compare-ai',
  passport.authenticate('jwt', { session: false }),
  authMiddleware.recruiterOnly,
  applicationController.compareWithAI
);

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

// Route để candidate xem chi tiết đơn ứng tuyển của mình
router.get(
  '/my/:applicationId',
  passport.authenticate('jwt', { session: false }),
  authMiddleware.candidateOnly,
  validationMiddleware.validateParams(applicationSchema.applicationIdParam),
  applicationController.getMyApplicationDetail
);

// Route chấm điểm CV (Candidate only) - ĐẶT TRƯỚC /:applicationId
router.post(
  '/:applicationId/score-cv',
  passport.authenticate('jwt', { session: false }),
  authMiddleware.candidateOnly,
  validationMiddleware.validateParams(applicationSchema.applicationIdParam),
  applicationController.scoreCV
);

// Route tạo CV mới từ AI (Candidate only) - ĐẶT TRƯỚC /:applicationId
router.post(
  '/:applicationId/generate-cv',
  passport.authenticate('jwt', { session: false }),
  authMiddleware.candidateOnly,
  // Tạm thời comment validation để test
  // validationMiddleware.validateParams(applicationSchema.applicationIdParam),
  applicationController.generateCV
);

// Test route to verify routing works
router.get(
  '/:applicationId/test-route',
  (req, res) => {
    res.json({ message: 'Route works!', applicationId: req.params.applicationId });
  }
);

// Route để xem chi tiết một đơn ứng tuyển (Recruiter only)
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
  validationMiddleware.validateParams(applicationSchema.applicationIdParam),
  // validationMiddleware.validateBody(applicationSchema.updateApplicationStatusBody), // Tạm tắt validate body vì dùng FormData
  (req, res, next) => {
    // Middleware xử lý upload trước
    import('../middleware/upload.middleware.js').then(({ uploadOfferFile }) => {
      uploadOfferFile(req, res, (err) => {
        if (err) return next(err);
        next();
      });
    }).catch(next);
  },
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

// Route đánh giá kết quả phỏng vấn
router.post(
  '/:applicationId/interview-result',
  passport.authenticate('jwt', { session: false }),
  authMiddleware.recruiterOnly,
  validationMiddleware.validateParams(applicationSchema.applicationIdParam),
  validationMiddleware.validateBody(z.object({
    result: z.enum(['PASSED', 'FAILED']),
    feedback: z.string().optional()
  })),
  applicationController.evaluateInterviewResult
);

// Route export Application PDF using Snapshot
router.get(
  '/:applicationId/export-pdf',
  passport.authenticate('jwt', { session: false }),
  authMiddleware.recruiterOnly,
  validationMiddleware.validateParams(applicationSchema.applicationIdParam),
  applicationController.exportApplicationCvPdf
);

// Route để lấy các workflow executions bị lỗi của ứng viên
router.get(
  '/:applicationId/failed-executions',
  passport.authenticate('jwt', { session: false }),
  authMiddleware.recruiterOnly,
  validationMiddleware.validateParams(applicationSchema.applicationIdParam),
  applicationController.getFailedExecutions
);


export default router;
