import { Router } from 'express';
import passport from 'passport';
import * as recruiterController from '../controllers/recruiter.controller.js';
import { maskPdfController } from '../controllers/cvMask.controller.js';
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

/**
 * @route GET /api/v1/recruiters/candidates/:userId
 * @desc Get candidate profile (with masking if not unlocked)
 * @access Private (Recruiter)
 */
router.get(
  '/candidates/:userId',
  passport.authenticate('jwt', { session: false }),
  authMiddleware.recruiterOnly,
  recruiterController.getCandidateProfile
);

/**
 * @route POST /api/v1/recruiters/candidates/:userId/unlock
 * @desc Unlock candidate profile (purchase access)
 * @access Private (Recruiter)
 */
router.post(
  '/candidates/:userId/unlock',
  passport.authenticate('jwt', { session: false }),
  authMiddleware.recruiterOnly,
  recruiterController.unlockCandidateProfile
);

/**
 * @route GET /api/v1/recruiters/candidates/:candidateId/cv/:cvId
 * @desc Get candidate CV (masked if not unlocked)
 * @access Private (Recruiter)
 */
router.get(
  '/candidates/:candidateId/cv/:cvId',
  passport.authenticate('jwt', { session: false }),
  authMiddleware.recruiterOnly,
  maskPdfController
);

export default router;
