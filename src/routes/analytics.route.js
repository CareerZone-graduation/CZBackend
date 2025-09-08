// src/routes/analytics.route.js
import express from 'express';
import passport from 'passport';
import * as analyticsController from '../controllers/analytics.controller.js';
import * as authMiddleware from '../middleware/auth.middleware.js';
import * as validationMiddleware from '../middleware/validation.middleware.js';
import * as analyticsSchema from '../schemas/analytics.schema.js';

const router = express.Router();

// Tất cả các route trong file này đều yêu cầu quyền admin
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

router.get('/job-categories', analyticsController.getJobCategories);

export default router;
router.get('/company-stats', analyticsController.getCompanyStats);