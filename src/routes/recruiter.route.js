import { Router } from 'express';
import * as recruiterController from '../controllers/recruiter.controller.js';
import { authenticate, recruiterOnly } from '../middleware/auth.middleware.js';
import asyncHandler from '../utils/asyncHandler.js';

const router = Router();

/**
 * @route GET /api/v1/recruiters/profile
 * @desc Get the profile of the currently logged-in recruiter
 * @access Private (Recruiter)
 */
router.get(
  '/profile',
  authenticate,
  recruiterOnly,
  asyncHandler(recruiterController.getRecruiterProfile)
);

export default router;
