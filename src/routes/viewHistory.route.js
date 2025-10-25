import express from 'express';
import passport from 'passport';
import * as authMiddleware from '../middleware/auth.middleware.js';
import * as viewHistoryController from '../controllers/viewHistory.controller.js';

const router = express.Router();

// Get user's view history statistics
// Must come before /:id to avoid route conflict
router.get(
  '/stats',
  passport.authenticate('jwt', { session: false }),
  authMiddleware.candidateOnly,
  viewHistoryController.getUserViewStats
);

// Create or update view history
router.post(
  '/',
  passport.authenticate('jwt', { session: false }),
  authMiddleware.candidateOnly,
  viewHistoryController.saveViewHistory
);

// Get user's view history with pagination
router.get(
  '/',
  passport.authenticate('jwt', { session: false }),
  authMiddleware.candidateOnly,
  viewHistoryController.getUserViewHistory
);

// Delete a specific view history entry
router.delete(
  '/:id',
  passport.authenticate('jwt', { session: false }),
  authMiddleware.candidateOnly,
  viewHistoryController.deleteViewHistory
);

// Clear all view history for the user
// Must come after /:id route
router.delete(
  '/',
  passport.authenticate('jwt', { session: false }),
  authMiddleware.candidateOnly,
  viewHistoryController.clearAllViewHistory
);

export default router;
