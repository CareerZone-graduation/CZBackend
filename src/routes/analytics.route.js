// src/routes/analytics.route.js
import express from 'express';
import passport from 'passport';
import * as analyticsController from '../controllers/analytics.controller.js';
import * as authMiddleware from '../middleware/auth.middleware.js';
import * as validationMiddleware from '../middleware/validation.middleware.js';
import * as analyticsSchema from '../schemas/analytics.schema.js';

const router = express.Router();

// === Public Routes (không cần authentication) ===
router.get('/job-categories', analyticsController.getJobCategories);
router.get('/top-companies', analyticsController.getTopCompanies);
router.get('/most-applied-companies', analyticsController.getMostAppliedCompanies);

// Debug endpoint để test applications data
import * as testController from '../controllers/test-applications.controller.js';
router.get('/debug-applications', testController.testApplicationsData);

// === Admin Only Routes ===
// Tất cả các route sau đây đều yêu cầu quyền admin
router.use(passport.authenticate('jwt', { session: false }), authMiddleware.adminOnly);

// Dashboard & Analytics APIs
router.get('/dashboard-stats', analyticsController.getDashboardStats);

router.get(
  '/user-growth',
  validationMiddleware.validateQuery(analyticsSchema.timeSeriesSchema),
  analyticsController.getUserGrowth
);

router.get(
  '/revenue-trends',
  validationMiddleware.validateQuery(analyticsSchema.timeSeriesSchema),
  analyticsController.getRevenueTrends
);

router.get('/user-demographics', analyticsController.getUserDemographics);

router.get('/company-stats', analyticsController.getCompanyStats);

// KPI Metrics - Các chỉ số KPI nghiệp vụ từ dữ liệu thực
router.get('/kpi-metrics', analyticsController.getKPIMetrics);

// Transaction Analytics - API cho phân tích giao dịch
router.get(
  '/transaction-trends',
  validationMiddleware.validateQuery(analyticsSchema.transactionAnalyticsSchema),
  analyticsController.getTransactionTrends
);

// Transaction Today Stats - Thống kê giao dịch hôm nay
router.get('/transaction-today', analyticsController.getTransactionToday);

// Top Spending Users - Danh sách người dùng chi tiêu nhiều nhất
router.get(
  '/top-spending-users',
  validationMiddleware.validateQuery(analyticsSchema.transactionAnalyticsSchema),
  analyticsController.getTopSpendingUsers
);

// [MỚI] Lấy danh sách giao dịch với bộ lọc và phân trang
router.get(
  '/transactions',
  validationMiddleware.validateQuery(analyticsSchema.transactionListSchema),
  analyticsController.getAllTransactions
);

export default router;
