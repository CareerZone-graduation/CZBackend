import { Router } from 'express';
import passport from 'passport';
import * as recruiterController from '../controllers/recruiter.controller.js';
import * as authMiddleware from '../middleware/auth.middleware.js';

const router = Router();

/**
 * @route GET /api/v1/recruiters/profile
 * @desc Get the profile of the currently logged-in recruiter
 * @access Private (Recruiter)
 */
router.get(
  '/profile',
  passport.authenticate('jwt', { session: false }),
  authMiddleware.recruiterOnly,
  recruiterController.getRecruiterProfile
);

export default router;
