import { Router } from 'express';
import passport from 'passport';
import * as recruiterController from '../controllers/recruiter.controller.js';
import { maskPdfController } from '../controllers/cvMask.controller.js';
import * as authMiddleware from '../middleware/auth.middleware.js';
import { validateBody } from '../middleware/validation.middleware.js';
import { unlockProfileSchema } from '../schemas/recruiter.schema.js';

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

/**
 * @route POST /api/v1/recruiters/unlock-profile
 * @desc Unlock candidate profile for messaging
 * @access Private (Recruiter)
 */
router.post(
  '/unlock-profile',
  passport.authenticate('jwt', { session: false }),
  authMiddleware.recruiterOnly,
  validateBody(unlockProfileSchema),
  recruiterController.unlockProfile
);



/**
 * @route GET /api/v1/recruiters/dashboard-stats
 * @desc Get dashboard statistics
 * @access Private (Recruiter)
 */
router.get(
  '/dashboard-stats',
  passport.authenticate('jwt', { session: false }),
  authMiddleware.recruiterOnly,
  recruiterController.getDashboardStats
);

/**
 * @route GET /api/v1/recruiters/dashboard/export
 * @desc Export dashboard data to CSV
 * @access Private (Recruiter)
 */
router.get(
  '/dashboard/export',
  passport.authenticate('jwt', { session: false }),
  authMiddleware.recruiterOnly,
  recruiterController.exportDashboardData
);

export default router;
