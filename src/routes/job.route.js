import express from 'express';
import passport from 'passport';
import * as validationMiddleware from '../middleware/validation.middleware.js';
import * as authMiddleware from '../middleware/auth.middleware.js';
import * as jobSchema from '../schemas/job.schema.js';
import { getMapClustersSchema } from '../schemas/map.schema.js';
import * as commonSchema from '../schemas/common.schema.js';
import * as jobController from '../controllers/job.controller.js';
import * as recommendationController from '../controllers/recommendation.controller.js';

const router = express.Router();

router.post(
  '/',
  passport.authenticate('jwt', { session: false }),
  authMiddleware.recruiterOnly,
  validationMiddleware.validateBody(jobSchema.createJobSchema),
  jobController.createJob
);

router.get(
  '/',
  validationMiddleware.validateQuery(jobSchema.jobQuerySchema),
  jobController.getAllJobs
);

router.get(
  '/search/hybrid',
  (req, res, next) => {
    if (req.headers.authorization) {
      passport.authenticate('jwt', { session: false })(req, res, next);
    } else {
      next();
    }
  },
  validationMiddleware.validateQuery(jobSchema.hybridSearchJobSchema),
  jobController.hybridSearchJobs
);

// Autocomplete routes
router.get(
  '/autocomplete/titles',
  validationMiddleware.validateQuery(jobSchema.autocompleteJobSchema),
  jobController.autocompleteJobTitles
);

// Map search routes
router.get(
  '/map-search',
  validationMiddleware.validateQuery(jobSchema.mapBoundsSchema),
  jobController.searchJobsOnMap
);

router.get(
  '/map-clusters',
  validationMiddleware.validateQuery(getMapClustersSchema),
  jobController.getJobClusters
);

router.get(
  '/my-jobs',
  passport.authenticate('jwt', { session: false }),
  authMiddleware.recruiterOnly,
  validationMiddleware.validateQuery(jobSchema.getMyJobsQuerySchema), // Updated schema validation
  jobController.getMyJobs
);
router.get(
  '/recruiter/:id',
  passport.authenticate('jwt', { session: false }),
  authMiddleware.recruiterOnly,
  validationMiddleware.validateParams(commonSchema.idParamSchema),
  jobController.getJobDetailsForRecruiter
);

// Candidate suggestions endpoint (AI-powered recommendations)
router.get(
  '/:id/suggestions',
  passport.authenticate('jwt', { session: false }),
  authMiddleware.recruiterOnly,
  validationMiddleware.validateParams(commonSchema.idParamSchema),
  validationMiddleware.validateQuery(jobSchema.candidateSuggestionsQuerySchema),
  recommendationController.getSuggestions
);

router.get(
  '/:id',
  (req, res, next) => {
    if (req.headers.authorization) {
      passport.authenticate('jwt', { session: false })(req, res, next);
    } else {
      next();
    }
  },
  validationMiddleware.validateParams(commonSchema.idParamSchema),
  jobController.getJobById
);


router.put(
  '/:id',
  passport.authenticate('jwt', { session: false }),
  authMiddleware.recruiterOnly,
  validationMiddleware.validateParams(commonSchema.idParamSchema),
  validationMiddleware.validateBody(jobSchema.updateJobSchema),
  jobController.updateJob
);

router.delete(
  '/:id',
  passport.authenticate('jwt', { session: false }),
  authMiddleware.recruiterOnly,
  validationMiddleware.validateParams(commonSchema.idParamSchema),
  jobController.deleteJob
);

router.post(
  '/:id/applicant-count',
  passport.authenticate('jwt', { session: false }),
  authMiddleware.candidateOnly,
  validationMiddleware.validateParams(commonSchema.idParamSchema),
  jobController.getApplicantCount
);

router.post(
  '/:id/apply',
  passport.authenticate('jwt', { session: false }),
  authMiddleware.candidateOnly,
  validationMiddleware.validateParams(commonSchema.idParamSchema),
  validationMiddleware.validateBody(jobSchema.applyToJobSchema),
  jobController.applyToJob
);

router.post(
  '/:id/reapply',
  passport.authenticate('jwt', { session: false }),
  authMiddleware.candidateOnly,
  validationMiddleware.validateParams(commonSchema.idParamSchema),
  validationMiddleware.validateBody(jobSchema.applyToJobSchema),
  jobController.reapplyToJob
);

router.post(
  '/:id/save',
  passport.authenticate('jwt', { session: false }),
  authMiddleware.candidateOnly,
  validationMiddleware.validateParams(commonSchema.idParamSchema),
  jobController.saveJob
);

router.delete(
  '/:id/save',
  passport.authenticate('jwt', { session: false }),
  authMiddleware.candidateOnly,
  validationMiddleware.validateParams(commonSchema.idParamSchema),
  jobController.unsaveJob
);


router.get(
  '/saved/list',
  passport.authenticate('jwt', { session: false }),
  authMiddleware.candidateOnly,
  validationMiddleware.validateQuery(jobSchema.getSavedJobsQuerySchema),
  jobController.getSavedJobs
);

// Get jobs by IDs (for job alert notifications)
router.post(
  '/by-ids',
  passport.authenticate('jwt', { session: false }),
  authMiddleware.candidateOnly,
  validationMiddleware.validateBody(jobSchema.getJobsByIdsSchema),
  jobController.getJobsByIds
);

export default router;
