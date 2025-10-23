import express from 'express';
import passport from 'passport';
import * as validationMiddleware from '../middleware/validation.middleware.js';
import * as authMiddleware from '../middleware/auth.middleware.js';
import * as searchHistorySchema from '../schemas/searchHistory.schema.js';
import * as searchHistoryController from '../controllers/searchHistory.controller.js';

const router = express.Router();

// Create or update search history
router.post(
  '/',
  passport.authenticate('jwt', { session: false }),
  authMiddleware.candidateOnly,
  validationMiddleware.validateBody(searchHistorySchema.saveSearchHistorySchema),
  searchHistoryController.saveSearchHistory
);

// Get user's search history with pagination
router.get(
  '/',
  passport.authenticate('jwt', { session: false }),
  authMiddleware.candidateOnly,
  validationMiddleware.validateQuery(searchHistorySchema.getSearchHistorySchema),
  searchHistoryController.getUserSearchHistory
);



// Delete a specific search history entry
router.delete(
  '/:id',
  passport.authenticate('jwt', { session: false }),
  authMiddleware.candidateOnly,
  validationMiddleware.validateParams(searchHistorySchema.deleteSearchHistorySchema),
  searchHistoryController.deleteSearchHistory
);

// Clear all search history for the user
router.delete(
  '/',
  passport.authenticate('jwt', { session: false }),
  authMiddleware.candidateOnly,
  searchHistoryController.clearAllSearchHistory
);

export default router;
