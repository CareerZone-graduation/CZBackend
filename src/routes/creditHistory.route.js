import express from 'express';
import passport from 'passport';
import * as creditHistoryController from '../controllers/creditHistory.controller.js';
import * as validationMiddleware from '../middleware/validation.middleware.js';
import * as creditHistorySchema from '../schemas/creditHistory.schema.js';

const router = express.Router();

/**
 * @route   GET /api/credit-history/summary
 * @desc    Get credit transaction summary statistics
 * @access  Private (JWT authentication required)
 */
router.get(
  '/summary',
  passport.authenticate('jwt', { session: false }),
  validationMiddleware.validateQuery(creditHistorySchema.getTransactionSummarySchema),
  creditHistoryController.getCreditSummary
);

/**
 * @route   GET /api/credit-history
 * @desc    Get credit transaction history with filtering and pagination
 * @access  Private (JWT authentication required)
 */
router.get(
  '/',
  passport.authenticate('jwt', { session: false }),
  validationMiddleware.validateQuery(creditHistorySchema.getCreditHistorySchema),
  creditHistoryController.getCreditHistory
);

export default router;
