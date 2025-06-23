import express from 'express';
import { validateBody, validateQuery, validateParams } from '../middleware/validation.middleware.js';
import { authenticate, authorize, candidateOnly, recruiterOrAdmin } from '../middleware/auth.middleware.js';
import { 
  createJobSchema, 
  updateJobSchema, 
  jobSearchSchema 
} from '../schemas/job.schema.js';
import { idParamSchema, paginationSchema } from '../schemas/common.schema.js';

// Import controllers (to be created)
import {
  createJob,
  getJobById,
  updateJob,
  deleteJob,
  searchJobs,
  getJobsByCompany
} from '../controllers/job.controller.js';

const router = express.Router();

/**
 * @route   POST /api/jobs
 * @desc    Create a new job posting
 * @access  Private (Recruiter)
 */
router.post('/', 
  authenticate, 
  authorize(['RECRUITER']), 
  validateBody(createJobSchema), 
  createJob
);


/**
 * @route   GET /api/jobs/search
 * @desc    Search jobs with advanced filters
 * @access  Public
 */
router.get('/search', 
  validateQuery(jobSearchSchema), 
  searchJobs
);

/**
 * @route   GET /api/jobs/company/:companyId
 * @desc    Get jobs by company
 * @access  Public
 */
router.get('/company/:companyId', 
  validateParams(idParamSchema), 
  validateQuery(paginationSchema),
  getJobsByCompany
);

/**
 * @route   GET /api/jobs/:id
 * @desc    Get job by ID
 * @access  Public
 */
router.get('/:id', 
  validateParams(idParamSchema), 
  getJobById
);

/**
 * @route   PUT /api/jobs/:id
 * @desc    Update job posting
 * @access  Private (Recruiter - own jobs only)
 */
router.put('/:id', 
  authenticate, 
  authorize(['RECRUITER']), 
  validateParams(idParamSchema),
  validateBody(updateJobSchema), 
  updateJob
);

/**
 * @route   DELETE /api/jobs/:id
 * @desc    Delete job posting
 * @access  Private (Recruiter - own jobs only, Admin)
 */
router.delete('/:id', 
  authenticate, 
  recruiterOrAdmin, 
  validateParams(idParamSchema),
  deleteJob
);


export default router;
