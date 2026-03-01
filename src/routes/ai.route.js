import express from 'express';
import passport from 'passport';
import * as aiController from '../controllers/ai.controller.js';
import { recruiterOnly } from '../middleware/auth.middleware.js';

const router = express.Router();

/**
 * @route POST /api/ai/enhance-job
 * @desc Enhance job content with AI
 * @access Private (Recruiter only)
 */
router.post(
  '/enhance-job',
  passport.authenticate('jwt', { session: false }),
  recruiterOnly,
  aiController.enhanceJobContent
);

/**
 * @route POST /api/ai/smart-suggestions
 * @desc Generate smart suggestions based on job title
 * @access Private (Recruiter only)
 */
router.post(
  '/smart-suggestions',
  passport.authenticate('jwt', { session: false }),
  recruiterOnly,
  aiController.generateSmartSuggestions
);

export default router;
