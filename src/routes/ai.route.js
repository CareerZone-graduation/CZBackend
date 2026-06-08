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

export default router;
