import express from 'express';
import passport from 'passport';
import * as validationMiddleware from '../middleware/validation.middleware.js';
import * as authMiddleware from '../middleware/auth.middleware.js';
import * as jobSchema from '../schemas/job.schema.js';
import * as commonSchema from '../schemas/common.schema.js';
import * as jobController from '../controllers/job.controller.js';

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
  validationMiddleware.validateQuery(jobSchema.jobQuerySchema),
  jobController.getSavedJobs
);

export default router;
