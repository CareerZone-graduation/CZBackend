import express from 'express';
import * as validationMiddleware from '../middleware/validation.middleware.js';
import * as authMiddleware from '../middleware/auth.middleware.js';
import * as jobSchema from '../schemas/job.schema.js';
import * as commonSchema from '../schemas/common.schema.js';
import * as jobController from '../controllers/job.controller.js';

const router = express.Router();

router.post(
  '/',
  authMiddleware.authenticate,
  authMiddleware.recruiterOnly,
  validationMiddleware.validateBody(jobSchema.createJobSchema),
  jobController.createJob
);

router.get(
  '/my-jobs',
  authMiddleware.authenticate,
  authMiddleware.recruiterOnly,
  validationMiddleware.validateQuery(jobSchema.jobQuerySchema),
  jobController.getMyJobs
);

router.get(
  '/:id',
  authMiddleware.optionalAuthenticate,
  validationMiddleware.validateParams(commonSchema.idParamSchema),
  jobController.getJobById
);

router.put(
  '/:id',
  authMiddleware.authenticate,
  authMiddleware.recruiterOnly,
  validationMiddleware.validateParams(commonSchema.idParamSchema),
  validationMiddleware.validateBody(jobSchema.updateJobSchema),
  jobController.updateJob
);

router.delete(
  '/:id',
  authMiddleware.authenticate,
  authMiddleware.recruiterOnly,
  validationMiddleware.validateParams(commonSchema.idParamSchema),
  jobController.deleteJob
);

router.post(
  '/:id/applicant-count',
  authMiddleware.authenticate,
  authMiddleware.candidateOnly,
  validationMiddleware.validateParams(commonSchema.idParamSchema),
  jobController.getApplicantCount
);

router.post(
  '/:id/apply',
  authMiddleware.authenticate,
  authMiddleware.candidateOnly,
  validationMiddleware.validateParams(commonSchema.idParamSchema),
  validationMiddleware.validateBody(jobSchema.applyToJobSchema),
  jobController.applyToJob
);

router.post(
  '/:id/save',
  authMiddleware.authenticate,
  authMiddleware.candidateOnly,
  validationMiddleware.validateParams(commonSchema.idParamSchema),
  jobController.saveJob
);

router.delete(
  '/:id/save',
  authMiddleware.authenticate,
  authMiddleware.candidateOnly,
  validationMiddleware.validateParams(commonSchema.idParamSchema),
  jobController.unsaveJob
);

router.get(
  '/saved/list',
  authMiddleware.authenticate,
  authMiddleware.candidateOnly,
  validationMiddleware.validateQuery(jobSchema.jobQuerySchema),
  jobController.getSavedJobs
);

export default router;
