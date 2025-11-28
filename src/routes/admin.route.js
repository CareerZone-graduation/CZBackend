import express from 'express';
import passport from 'passport';
import * as adminController from '../controllers/admin.controller.js';
import * as authMiddleware from '../middleware/auth.middleware.js';
import * as validationMiddleware from '../middleware/validation.middleware.js';
import * as adminSchema from '../schemas/admin.schema.js';

const router = express.Router();

// Tất cả routes admin phải được xác thực và chỉ admin mới có quyền truy cập
router.use(passport.authenticate('jwt', { session: false }), authMiddleware.adminOnly);

// Quản lý Tin tuyển dụng
router
  .route('/jobs')
  .get(
    validationMiddleware.validateQuery(adminSchema.adminJobsQuerySchema),
    adminController.getJobs
  );

router
  .route('/jobs/:id')
  .get(
    validationMiddleware.validateParams(adminSchema.idParamsSchema),
    adminController.getJobDetail
  );

router
  .route('/jobs/:id/approve')
  .patch(
    validationMiddleware.validateParams(adminSchema.idParamsSchema),
    adminController.approveJob
  );

router
  .route('/jobs/:id/reject')
  .patch(
    validationMiddleware.validateParams(adminSchema.idParamsSchema),
    adminController.rejectJob
  );

// Quản lý Người dùng
router
  .route('/users')
  .get(
    validationMiddleware.validateQuery(adminSchema.adminUsersQuerySchema),
    adminController.getUsers
  );

router
  .route('/users/:id')
  .get(
    validationMiddleware.validateParams(adminSchema.idParamsSchema),
    adminController.getUserDetail
  );

router
  .route('/users/:id/status')
  .patch(
    validationMiddleware.validateParams(adminSchema.idParamsSchema),
    validationMiddleware.validateBody(adminSchema.userStatusSchema),
    adminController.updateUserStatus
  );

// Quản lý Công ty
router
  .route('/companies')
  .get(
    validationMiddleware.validateQuery(adminSchema.adminCompaniesQuerySchema),
    adminController.getCompanies
  );


router
  .route('/companies/:id')
  .get(
    validationMiddleware.validateParams(adminSchema.idParamsSchema),
    adminController.getCompanyDetail
  );

router
  .route('/companies/:id/approve')
  .patch(
    validationMiddleware.validateParams(adminSchema.idParamsSchema),
    adminController.approveCompany
  );

router
  .route('/companies/:id/reject')
  .patch(
    validationMiddleware.validateParams(adminSchema.idParamsSchema),
    validationMiddleware.validateBody(adminSchema.rejectCompanySchema),
    adminController.rejectCompany
  );

// Dashboard Thống kê
router
  .route('/stats')
  .get(adminController.getStats);

// Quản lý Jobs của Công ty
router
  .route('/companies/:id/jobs')
  .get(
    validationMiddleware.validateParams(adminSchema.idParamsSchema),
    validationMiddleware.validateQuery(adminSchema.companyJobsQuerySchema),
    adminController.getCompanyJobs
  );

router
  .route('/jobs/:id/status')
  .patch(
    validationMiddleware.validateParams(adminSchema.idParamsSchema),
    validationMiddleware.validateBody(adminSchema.jobStatusSchema),
    adminController.updateJobStatusByAdmin
  );

router
  .route('/jobs/:id/activate')
  .patch(
    validationMiddleware.validateParams(adminSchema.idParamsSchema),
    adminController.activateJob
  );

router
  .route('/jobs/:id/deactivate')
  .patch(
    validationMiddleware.validateParams(adminSchema.idParamsSchema),
    adminController.deactivateJob
  );

export default router;

// =================================================================
// Quản lý Yêu cầu Hỗ trợ (Support Requests)
// =================================================================

import {
  getAdminSupportRequestsQuerySchema,
  respondToRequestSchema,
  updateStatusSchema,
  updatePrioritySchema,
  getAnalyticsQuerySchema,
  supportRequestIdSchema
} from '../schemas/supportRequest.schema.js';

/**
 * @route   GET /api/admin/support-requests/analytics
 * @desc    Get support request analytics
 * @access  Private (Admin only)
 * @note    This route must come BEFORE /:id to avoid route conflicts
 */
router
  .route('/support-requests/analytics')
  .get(
    validationMiddleware.validateQuery(getAnalyticsQuerySchema),
    adminController.getAnalytics
  );

/**
 * @route   GET /api/admin/support-requests
 * @desc    Get all support requests with filters
 * @access  Private (Admin only)
 */
router
  .route('/support-requests')
  .get(
    validationMiddleware.validateQuery(getAdminSupportRequestsQuerySchema),
    adminController.getAllSupportRequests
  );

/**
 * @route   GET /api/admin/support-requests/:id
 * @desc    Get support request by ID
 * @access  Private (Admin only)
 */
router
  .route('/support-requests/:id')
  .get(
    validationMiddleware.validateParams(supportRequestIdSchema),
    adminController.getAdminSupportRequestById
  );

/**
 * @route   POST /api/admin/support-requests/:id/respond
 * @desc    Respond to support request
 * @access  Private (Admin only)
 */
router
  .route('/support-requests/:id/respond')
  .post(
    validationMiddleware.validateParams(supportRequestIdSchema),
    validationMiddleware.validateBody(respondToRequestSchema),
    adminController.respondToRequest
  );

/**
 * @route   PATCH /api/admin/support-requests/:id/status
 * @desc    Update support request status
 * @access  Private (Admin only)
 */
router
  .route('/support-requests/:id/status')
  .patch(
    validationMiddleware.validateParams(supportRequestIdSchema),
    validationMiddleware.validateBody(updateStatusSchema),
    adminController.updateRequestStatus
  );

/**
 * @route   PATCH /api/admin/support-requests/:id/priority
 * @desc    Update support request priority
 * @access  Private (Admin only)
 */
router
  .route('/support-requests/:id/priority')
  .patch(
    validationMiddleware.validateParams(supportRequestIdSchema),
    validationMiddleware.validateBody(updatePrioritySchema),
    adminController.updateRequestPriority
  );

/**
 * @route   POST /api/admin/support-requests/:id/reopen
 * @desc    Reopen closed support request
 * @access  Private (Admin only)
 */
router
  .route('/support-requests/:id/reopen')
  .post(
    validationMiddleware.validateParams(supportRequestIdSchema),
    adminController.reopenRequest
  );
