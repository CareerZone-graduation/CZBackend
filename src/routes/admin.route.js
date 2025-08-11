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
    adminController.rejectCompany
  );

// Dashboard Thống kê
router
  .route('/stats')
  .get(adminController.getStats);

export default router;
