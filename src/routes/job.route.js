import express from 'express';
import { validateBody, validateQuery, validateParams } from '../middleware/validation.middleware.js';
import { authenticate, optionalAuthenticate, recruiterOnly, candidateOnly } from '../middleware/auth.middleware.js';
import { createJobSchema, updateJobSchema, jobQuerySchema, applyToJobSchema } from '../schemas/job.schema.js';
import { idParamSchema } from '../schemas/common.schema.js';
import {
  createJob,
  getMyJobs,
  getJobById,
  updateJob,
  deleteJob,
  applyToJob,
} from '../controllers/job.controller.js';

const router = express.Router();

router.post(
  '/',
  authenticate,
  recruiterOnly,
  validateBody(createJobSchema),
  createJob
);

router.get(
  '/my-jobs',
  authenticate,
  recruiterOnly,
  validateQuery(jobQuerySchema),
  getMyJobs
);

router.get(
  '/:id',
  optionalAuthenticate,
  validateParams(idParamSchema),
  getJobById
);

router.put(
  '/:id',
  authenticate,
  recruiterOnly,
  validateParams(idParamSchema),
  validateBody(updateJobSchema),
  updateJob
);

router.delete(
  '/:id',
  authenticate,
  recruiterOnly,
  validateParams(idParamSchema),
  deleteJob
);

router.post(
  '/:id/apply',
  authenticate,
  candidateOnly,
  validateParams(idParamSchema),
  validateBody(applyToJobSchema),
  applyToJob
);

export default router;
