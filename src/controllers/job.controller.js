/**
 * Job Controller
 * Handles job-related HTTP requests
 * @module JobController
 */

import { jobService } from '../services/job.service.js';
import logger from '../utils/logger.js';

/**
 * Create new job posting
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next middleware
 */
export const createJob = async (req, res, next) => {
  try {
    const recruiterId = req.user.profileId;
    const job = await jobService.createJob(req.body, recruiterId);
    
    res.status(201).json({
      success: true,
      message: 'Job created successfully',
      data: job
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Update job posting
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next middleware
 */
export const updateJob = async (req, res, next) => {
  try {
    const { jobId } = req.params;
    const recruiterId = req.user.profileId;
    
    const job = await jobService.updateJob(jobId, req.body, recruiterId);
    
    res.json({
      success: true,
      message: 'Job updated successfully',
      data: job
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Delete job posting
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next middleware
 */
export const deleteJob = async (req, res, next) => {
  try {
    const { jobId } = req.params;
    const recruiterId = req.user.profileId;
    
    await jobService.deleteJob(jobId, recruiterId);
    
    res.json({
      success: true,
      message: 'Job deleted successfully'
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Get job by ID
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next middleware
 */
export const getJobById = async (req, res, next) => {
  try {
    const { jobId } = req.params;
    const job = await jobService.getJobById(jobId);
    
    res.json({
      success: true,
      data: job
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Search jobs with filters
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next middleware
 */
export const searchJobs = async (req, res, next) => {
  try {
    const {
      keyword,
      location,
      salaryMin,
      salaryMax,
      jobType,
      experienceLevel,
      company,
      category,
      page = 1,
      limit = 10,
      sortBy = 'createdAt',
      sortOrder = 'desc'
    } = req.query;

    const filters = {
      keyword,
      location,
      salaryMin: salaryMin ? parseInt(salaryMin) : undefined,
      salaryMax: salaryMax ? parseInt(salaryMax) : undefined,
      jobType,
      experienceLevel,
      company,
      category
    };

    const options = {
      page: parseInt(page),
      limit: parseInt(limit),
      sortBy,
      sortOrder
    };

    const result = await jobService.searchJobs(filters, options);
    
    res.json({
      success: true,
      data: result
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Get recruiter's own jobs
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next middleware
 */
export const getMyJobs = async (req, res, next) => {
  try {
    const recruiterId = req.user.profileId;
    const { page = 1, limit = 10, status } = req.query;

    const options = {
      page: parseInt(page),
      limit: parseInt(limit),
      status
    };

    const result = await jobService.getJobsByRecruiter(recruiterId, options);
    
    res.json({
      success: true,
      data: result
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Get jobs by company
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next middleware
 */
export const getJobsByCompany = async (req, res, next) => {
  try {
    const { companyId } = req.params;
    const { page = 1, limit = 10, status = 'ACTIVE' } = req.query;

    const options = {
      page: parseInt(page),
      limit: parseInt(limit),
      status
    };

    const result = await jobService.getJobsByCompany(companyId, options);
    
    res.json({
      success: true,
      data: result
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Save job for candidate
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next middleware
 */
export const saveJob = async (req, res, next) => {
  try {
    const { jobId } = req.params;
    const candidateId = req.user.profileId;
    
    await jobService.saveJob(candidateId, jobId);
    
    res.json({
      success: true,
      message: 'Job saved successfully'
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Remove saved job
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next middleware
 */
export const removeSavedJob = async (req, res, next) => {
  try {
    const { jobId } = req.params;
    const candidateId = req.user.profileId;
    
    await jobService.removeSavedJob(candidateId, jobId);
    
    res.json({
      success: true,
      message: 'Job removed from saved list'
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Get candidate's saved jobs
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next middleware
 */
export const getSavedJobs = async (req, res, next) => {
  try {
    const candidateId = req.user.profileId;
    const { page = 1, limit = 10 } = req.query;

    const options = {
      page: parseInt(page),
      limit: parseInt(limit)
    };

    const result = await jobService.getSavedJobs(candidateId, options);
    
    res.json({
      success: true,
      data: result
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Subscribe to job alerts
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next middleware
 */
export const subscribeToJobAlerts = async (req, res, next) => {
  try {
    const candidateId = req.user.profileId;
    const subscription = await jobService.subscribeToJobAlerts(candidateId, req.body);
    
    res.status(201).json({
      success: true,
      message: 'Job alert subscription created successfully',
      data: subscription
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Update job alert subscription
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next middleware
 */
export const updateJobAlertSubscription = async (req, res, next) => {
  try {
    const { subscriptionId } = req.params;
    const candidateId = req.user.profileId;
    
    const subscription = await jobService.updateJobAlertSubscription(subscriptionId, req.body, candidateId);
    
    res.json({
      success: true,
      message: 'Job alert subscription updated successfully',
      data: subscription
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Unsubscribe from job alerts
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next middleware
 */
export const unsubscribeFromJobAlerts = async (req, res, next) => {
  try {
    const { subscriptionId } = req.params;
    const candidateId = req.user.profileId;
    
    await jobService.unsubscribeFromJobAlerts(subscriptionId, candidateId);
    
    res.json({
      success: true,
      message: 'Unsubscribed from job alerts successfully'
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Get job alert subscriptions
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next middleware
 */
export const getJobAlertSubscriptions = async (req, res, next) => {
  try {
    const candidateId = req.user.profileId;
    const subscriptions = await jobService.getJobAlertSubscriptions(candidateId);
    
    res.json({
      success: true,
      data: subscriptions
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Get job statistics for recruiter
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next middleware
 */
export const getJobStatistics = async (req, res, next) => {
  try {
    const recruiterId = req.user.profileId;
    const { period = '30d' } = req.query;
    
    const stats = await jobService.getJobStatistics(recruiterId, period);
    
    res.json({
      success: true,
      data: stats
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Close job posting
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next middleware
 */
export const closeJob = async (req, res, next) => {
  try {
    const { jobId } = req.params;
    const recruiterId = req.user.profileId;
    
    const job = await jobService.closeJob(jobId, recruiterId);
    
    res.json({
      success: true,
      message: 'Job closed successfully',
      data: job
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Reopen job posting
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next middleware
 */
export const reopenJob = async (req, res, next) => {
  try {
    const { jobId } = req.params;
    const recruiterId = req.user.profileId;
    
    const job = await jobService.reopenJob(jobId, recruiterId);
    
    res.json({
      success: true,
      message: 'Job reopened successfully',
      data: job
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Get job recommendations for candidate
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next middleware
 */
export const getJobRecommendations = async (req, res, next) => {
  try {
    const candidateId = req.user.profileId;
    const { page = 1, limit = 10 } = req.query;

    const options = {
      page: parseInt(page),
      limit: parseInt(limit)
    };

    const recommendations = await jobService.getJobRecommendations(candidateId, options);
    
    res.json({
      success: true,
      data: recommendations
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Get featured jobs
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next middleware
 */
export const getFeaturedJobs = async (req, res, next) => {
  try {
    const { page = 1, limit = 10 } = req.query;

    const options = {
      page: parseInt(page),
      limit: parseInt(limit)
    };

    const jobs = await jobService.getFeaturedJobs(options);
    
    res.json({
      success: true,
      data: jobs
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Get job categories
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next middleware
 */
export const getJobCategories = async (req, res, next) => {
  try {
    const categories = await jobService.getJobCategories();
    
    res.json({
      success: true,
      data: categories
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Get job types
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next middleware
 */
export const getJobTypes = async (req, res, next) => {
  try {
    const jobTypes = await jobService.getJobTypes();
    
    res.json({
      success: true,
      data: {
        jobTypes: [
          'FULL_TIME',
          'PART_TIME',
          'CONTRACT',
          'FREELANCE',
          'INTERNSHIP',
          'TEMPORARY'
        ]
      }
    });
  } catch (error) {
    next(error);
  }
};
