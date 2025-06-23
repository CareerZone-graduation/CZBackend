/**
 * Job Service
 * Handles job management, search, and related operations
 * @module JobService
 */

import { Job, SavedJob, JobAlertSubscription, Application } from '../models/index.js';
import logger from '../utils/logger.js';

/**
 * Send job alerts to subscribed candidates
 * @param {Object} job - Job object
 * @returns {Promise<void>}
 */
const sendJobAlerts = async (job) => {
  try {
    // Find candidates with matching job alert subscriptions
    const subscriptions = await JobAlertSubscription.find({
      isActive: true,
      $or: [
        { keywords: { $in: job.title.split(' ') } },
        { location: job.location },
        { jobType: job.jobType },
        { salaryMin: { $lte: job.salaryMax || 0 } }
      ]
    }).populate('candidateId');

    // Send job alert emails
    for (const subscription of subscriptions) {
      await queueService.sendJobAlert({
        candidateId: subscription.candidateId._id,
        job: job,
        subscription: subscription
      });
    }

    logger.info(`Job alerts sent for job: ${job._id}`);
  } catch (error) {
    logger.error('Failed to send job alerts:', error);
  }
};

/**
 * Create a new job posting
 * @param {Object} jobData - Job data
 * @param {string} recruiterId - ID of the recruiter creating the job
 * @returns {Promise<Object>} Created job
 */
export const createJob = async (jobData, recruiterId) => {
  try {
    const job = new Job({
      ...jobData,
      postedBy: recruiterId,
      status: 'ACTIVE',
      postedDate: new Date(),
      expiryDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000) // 30 days from now
    });

    await job.save();
    await job.populate('companyId postedBy');

    // Send job alerts to subscribed candidates
    await sendJobAlerts(job);

    logger.info(`Job created: ${job._id} by recruiter: ${recruiterId}`);

    return job;
  } catch (error) {
    logger.error('Job creation failed:', error);
    throw error;
  }
};

/**
 * Update job posting
 * @param {string} jobId - Job ID
 * @param {Object} updateData - Update data
 * @param {string} recruiterId - ID of the recruiter updating the job
 * @returns {Promise<Object>} Updated job
 */
export const updateJob = async (jobId, updateData, recruiterId) => {
  try {
    const job = await Job.findOne({ _id: jobId, postedBy: recruiterId });
    
    if (!job) {
      throw new Error('Job not found or unauthorized');
    }

    Object.assign(job, updateData);
    job.lastUpdated = new Date();
    
    await job.save();
    await job.populate('companyId postedBy');

    logger.info(`Job updated: ${jobId} by recruiter: ${recruiterId}`);

    return job;
  } catch (error) {
    logger.error('Job update failed:', error);
    throw error;
  }
};

/**
 * Delete job posting
 * @param {string} jobId - Job ID
 * @param {string} recruiterId - ID of the recruiter deleting the job
 * @returns {Promise<void>}
 */
export const deleteJob = async (jobId, recruiterId) => {
  try {
    const job = await Job.findOne({ _id: jobId, postedBy: recruiterId });
    
    if (!job) {
      throw new Error('Job not found or unauthorized');
    }

    // Soft delete - just change status
    job.status = 'DELETED';
    job.deletedAt = new Date();
    await job.save();

    logger.info(`Job deleted: ${jobId} by recruiter: ${recruiterId}`);
  } catch (error) {
    logger.error('Job deletion failed:', error);
    throw error;
  }
};

/**
 * Get job by ID
 * @param {string} jobId - Job ID
 * @returns {Promise<Object>} Job details
 */
export const getJobById = async (jobId) => {
  try {
    const job = await Job.findOne({ 
      _id: jobId, 
      status: { $ne: 'DELETED' } 
    }).populate('companyId postedBy');
    
    if (!job) {
      throw new Error('Job not found');
    }

    // Increment view count
    job.viewCount = (job.viewCount || 0) + 1;
    await job.save();

    return job;
  } catch (error) {
    logger.error('Get job by ID failed:', error);
    throw error;
  }
};

/**
 * Search jobs with filters
 * @param {Object} filters - Search filters
 * @param {Object} options - Pagination and sorting options
 * @returns {Promise<Object>} Search results
 */
export const searchJobs = async (filters, options) => {
  try {
    const {
      keyword,
      location,
      salaryMin,
      salaryMax,
      jobType,
      experienceLevel,
      company,
      category
    } = filters;

    const {
      page = 1,
      limit = 10,
      sortBy = 'createdAt',
      sortOrder = 'desc'
    } = options;

    // Build query
    const query = {
      status: 'ACTIVE',
      expiryDate: { $gt: new Date() }
    };

    if (keyword) {
      query.$or = [
        { title: { $regex: keyword, $options: 'i' } },
        { description: { $regex: keyword, $options: 'i' } },
        { requirements: { $regex: keyword, $options: 'i' } }
      ];
    }

    if (location) {
      query.location = { $regex: location, $options: 'i' };
    }

    if (salaryMin || salaryMax) {
      query.salaryMin = {};
      if (salaryMin) query.salaryMin.$gte = salaryMin;
      if (salaryMax) query.salaryMin.$lte = salaryMax;
    }

    if (jobType) {
      query.jobType = jobType;
    }

    if (experienceLevel) {
      query.experienceLevel = experienceLevel;
    }

    if (company) {
      query.companyId = company;
    }

    if (category) {
      query.category = category;
    }

    // Execute query with pagination
    const skip = (page - 1) * limit;
    const sort = { [sortBy]: sortOrder === 'desc' ? -1 : 1 };

    const jobs = await Job.find(query)
      .populate('companyId postedBy')
      .sort(sort)
      .skip(skip)
      .limit(limit);

    const total = await Job.countDocuments(query);

    return {
      jobs,
      pagination: {
        currentPage: page,
        totalPages: Math.ceil(total / limit),
        totalJobs: total,
        hasNextPage: page < Math.ceil(total / limit),
        hasPrevPage: page > 1
      }
    };
  } catch (error) {
    logger.error('Job search failed:', error);
    throw error;
  }
};

/**
 * Get jobs by recruiter
 * @param {string} recruiterId - Recruiter ID
 * @param {Object} options - Query options
 * @returns {Promise<Object>} Jobs and pagination
 */
export const getJobsByRecruiter = async (recruiterId, options) => {
  try {
    const { page = 1, limit = 10, status } = options;

    const query = {
      postedBy: recruiterId,
      status: status ? status : { $ne: 'DELETED' }
    };

    const skip = (page - 1) * limit;

    const jobs = await Job.find(query)
      .populate('companyId')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit);

    const total = await Job.countDocuments(query);

    return {
      jobs,
      pagination: {
        currentPage: page,
        totalPages: Math.ceil(total / limit),
        totalJobs: total
      }
    };
  } catch (error) {
    logger.error('Get jobs by recruiter failed:', error);
    throw error;
  }
};

/**
 * Get jobs by company
 * @param {string} companyId - Company ID
 * @param {Object} options - Query options
 * @returns {Promise<Object>} Jobs and pagination
 */
export const getJobsByCompany = async (companyId, options) => {
  try {
    const { page = 1, limit = 10, status = 'ACTIVE' } = options;

    const query = {
      companyId,
      status
    };

    const skip = (page - 1) * limit;

    const jobs = await Job.find(query)
      .populate('postedBy')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit);

    const total = await Job.countDocuments(query);

    return {
      jobs,
      pagination: {
        currentPage: page,
        totalPages: Math.ceil(total / limit),
        totalJobs: total
      }
    };
  } catch (error) {
    logger.error('Get jobs by company failed:', error);
    throw error;
  }
};

/**
 * Save job for candidate
 * @param {string} candidateId - Candidate ID
 * @param {string} jobId - Job ID
 * @returns {Promise<void>}
 */
export const saveJob = async (candidateId, jobId) => {
  try {
    // Check if job exists and is active
    const job = await Job.findOne({ _id: jobId, status: 'ACTIVE' });
    if (!job) {
      throw new Error('Job not found or not available');
    }

    // Check if already saved
    const existingSave = await SavedJob.findOne({ candidateId, jobId });
    if (existingSave) {
      throw new Error('Job already saved');
    }

    const savedJob = new SavedJob({
      candidateId,
      jobId,
      savedAt: new Date()
    });

    await savedJob.save();

    logger.info(`Job saved: ${jobId} by candidate: ${candidateId}`);
  } catch (error) {
    logger.error('Save job failed:', error);
    throw error;
  }
};

/**
 * Remove saved job
 * @param {string} candidateId - Candidate ID
 * @param {string} jobId - Job ID
 * @returns {Promise<void>}
 */
export const removeSavedJob = async (candidateId, jobId) => {
  try {
    const result = await SavedJob.deleteOne({ candidateId, jobId });
    
    if (result.deletedCount === 0) {
      throw new Error('Saved job not found');
    }

    logger.info(`Saved job removed: ${jobId} by candidate: ${candidateId}`);
  } catch (error) {
    logger.error('Remove saved job failed:', error);
    throw error;
  }
};

/**
 * Get saved jobs for candidate
 * @param {string} candidateId - Candidate ID
 * @param {Object} options - Query options
 * @returns {Promise<Object>} Saved jobs and pagination
 */
export const getSavedJobs = async (candidateId, options) => {
  try {
    const { page = 1, limit = 10 } = options;

    const skip = (page - 1) * limit;

    const savedJobs = await SavedJob.find({ candidateId })
      .populate({
        path: 'jobId',
        populate: {
          path: 'companyId postedBy'
        }
      })
      .sort({ savedAt: -1 })
      .skip(skip)
      .limit(limit);

    const total = await SavedJob.countDocuments({ candidateId });

    return {
      savedJobs: savedJobs.map(save => save.jobId),
      pagination: {
        currentPage: page,
        totalPages: Math.ceil(total / limit),
        totalJobs: total
      }
    };
  } catch (error) {
    logger.error('Get saved jobs failed:', error);
    throw error;
  }
};

/**
 * Subscribe to job alerts
 * @param {string} candidateId - Candidate ID
 * @param {Object} alertData - Alert preferences
 * @returns {Promise<Object>} Created subscription
 */
export const subscribeToJobAlerts = async (candidateId, alertData) => {
  try {
    const subscription = new JobAlertSubscription({
      candidateId,
      ...alertData,
      isActive: true,
      createdAt: new Date()
    });

    await subscription.save();

    logger.info(`Job alert created for candidate: ${candidateId}`);

    return subscription;
  } catch (error) {
    logger.error('Job alert subscription failed:', error);
    throw error;
  }
};

/**
 * Update job alert subscription
 * @param {string} subscriptionId - Subscription ID
 * @param {Object} updateData - Update data
 * @param {string} candidateId - Candidate ID
 * @returns {Promise<Object>} Updated subscription
 */
export const updateJobAlertSubscription = async (subscriptionId, updateData, candidateId) => {
  try {
    const subscription = await JobAlertSubscription.findOne({
      _id: subscriptionId,
      candidateId
    });

    if (!subscription) {
      throw new Error('Subscription not found');
    }

    Object.assign(subscription, updateData);
    await subscription.save();

    logger.info(`Job alert updated: ${subscriptionId}`);

    return subscription;
  } catch (error) {
    logger.error('Job alert update failed:', error);
    throw error;
  }
};

/**
 * Unsubscribe from job alerts
 * @param {string} subscriptionId - Subscription ID
 * @param {string} candidateId - Candidate ID
 * @returns {Promise<void>}
 */
export const unsubscribeFromJobAlerts = async (subscriptionId, candidateId) => {
  try {
    const result = await JobAlertSubscription.deleteOne({
      _id: subscriptionId,
      candidateId
    });

    if (result.deletedCount === 0) {
      throw new Error('Subscription not found');
    }

    logger.info(`Job alert subscription removed: ${subscriptionId}`);
  } catch (error) {
    logger.error('Unsubscribe from job alerts failed:', error);
    throw error;
  }
};

/**
 * Get job alert subscriptions for candidate
 * @param {string} candidateId - Candidate ID
 * @returns {Promise<Array>} Active subscriptions
 */
export const getJobAlertSubscriptions = async (candidateId) => {
  try {
    const subscriptions = await JobAlertSubscription.find({
      candidateId,
      isActive: true
    }).sort({ createdAt: -1 });

    return subscriptions;
  } catch (error) {
    logger.error('Get job alert subscriptions failed:', error);
    throw error;
  }
};

/**
 * Get job statistics for recruiter
 * @param {string} recruiterId - Recruiter ID
 * @param {string} period - Time period (30d, 90d, 1y)
 * @returns {Promise<Object>} Job statistics
 */
export const getJobStatistics = async (recruiterId, period) => {
  try {
    const periodMap = {
      '30d': 30,
      '90d': 90,
      '1y': 365
    };

    const days = periodMap[period] || 30;
    const startDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

    const jobs = await Job.find({
      postedBy: recruiterId,
      createdAt: { $gte: startDate }
    });

    const applications = await Application.find({
      jobId: { $in: jobs.map(job => job._id) },
      createdAt: { $gte: startDate }
    });

    const stats = {
      totalJobs: jobs.length,
      activeJobs: jobs.filter(job => job.status === 'ACTIVE').length,
      closedJobs: jobs.filter(job => job.status === 'CLOSED').length,
      totalApplications: applications.length,
      totalViews: jobs.reduce((sum, job) => sum + (job.viewCount || 0), 0),
      averageApplicationsPerJob: jobs.length > 0 ? applications.length / jobs.length : 0
    };

    return stats;
  } catch (error) {
    logger.error('Get job statistics failed:', error);
    throw error;
  }
};

/**
 * Close job posting
 * @param {string} jobId - Job ID
 * @param {string} recruiterId - Recruiter ID
 * @returns {Promise<Object>} Updated job
 */
export const closeJob = async (jobId, recruiterId) => {
  try {
    const job = await Job.findOne({ _id: jobId, postedBy: recruiterId });
    
    if (!job) {
      throw new Error('Job not found or unauthorized');
    }

    job.status = 'CLOSED';
    job.closedAt = new Date();
    await job.save();

    logger.info(`Job closed: ${jobId}`);

    return job;
  } catch (error) {
    logger.error('Close job failed:', error);
    throw error;
  }
};

/**
 * Reopen job posting
 * @param {string} jobId - Job ID
 * @param {string} recruiterId - Recruiter ID
 * @returns {Promise<Object>} Updated job
 */
export const reopenJob = async (jobId, recruiterId) => {
  try {
    const job = await Job.findOne({ _id: jobId, postedBy: recruiterId });
    
    if (!job) {
      throw new Error('Job not found or unauthorized');
    }

    job.status = 'ACTIVE';
    job.closedAt = undefined;
    await job.save();

    logger.info(`Job reopened: ${jobId}`);

    return job;
  } catch (error) {
    logger.error('Reopen job failed:', error);
    throw error;
  }
};

/**
 * Get job recommendations for candidate
 * @param {string} candidateId - Candidate ID
 * @param {Object} options - Query options
 * @returns {Promise<Object>} Recommended jobs
 */
export const getJobRecommendations = async (candidateId, options) => {
  try {
    const { page = 1, limit = 10 } = options;

    // Get candidate profile to match preferences
    const candidate = await Candidate.findById(candidateId);
    
    if (!candidate) {
      throw new Error('Candidate not found');
    }

    // Build query based on candidate preferences
    const query = {
      status: 'ACTIVE',
      expiryDate: { $gt: new Date() }
    };

    // Add preference-based filters
    if (candidate.preferredJobType) {
      query.jobType = candidate.preferredJobType;
    }

    if (candidate.preferredLocation) {
      query.location = { $regex: candidate.preferredLocation, $options: 'i' };
    }

    if (candidate.skills && candidate.skills.length > 0) {
      query.$or = [
        { requirements: { $regex: candidate.skills.join('|'), $options: 'i' } },
        { title: { $regex: candidate.skills.join('|'), $options: 'i' } }
      ];
    }

    const skip = (page - 1) * limit;

    const jobs = await Job.find(query)
      .populate('companyId postedBy')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit);

    const total = await Job.countDocuments(query);

    return {
      jobs,
      pagination: {
        currentPage: page,
        totalPages: Math.ceil(total / limit),
        totalJobs: total
      }
    };
  } catch (error) {
    logger.error('Get job recommendations failed:', error);
    throw error;
  }
};

/**
 * Get featured jobs
 * @param {Object} options - Query options
 * @returns {Promise<Object>} Featured jobs
 */
export const getFeaturedJobs = async (options) => {
  try {
    const { page = 1, limit = 10 } = options;

    const query = {
      status: 'ACTIVE',
      isFeatured: true,
      expiryDate: { $gt: new Date() }
    };

    const skip = (page - 1) * limit;

    const jobs = await Job.find(query)
      .populate('companyId postedBy')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit);

    const total = await Job.countDocuments(query);

    return {
      jobs,
      pagination: {
        currentPage: page,
        totalPages: Math.ceil(total / limit),
        totalJobs: total
      }
    };
  } catch (error) {
    logger.error('Get featured jobs failed:', error);
    throw error;
  }
};

/**
 * Get job categories
 * @returns {Promise<Array>} Job categories
 */
export const getJobCategories = async () => {
  try {
    // This could be dynamic based on actual job data
    const categories = [
      'Technology',
      'Healthcare',
      'Finance',
      'Education',
      'Marketing',
      'Sales',
      'Human Resources',
      'Operations',
      'Customer Service',
      'Design',
      'Engineering',
      'Legal'
    ];

    return categories;
  } catch (error) {
    logger.error('Get job categories failed:', error);
    throw error;
  }
};

/**
 * Get job types
 * @returns {Promise<Array>} Job types
 */
export const getJobTypes = async () => {
  try {
    const jobTypes = [
      'FULL_TIME',
      'PART_TIME',
      'CONTRACT',
      'FREELANCE',
      'INTERNSHIP',
      'TEMPORARY'
    ];

    return jobTypes;
  } catch (error) {
    logger.error('Get job types failed:', error);
    throw error;
  }
};

export const jobService = {
  createJob,
  updateJob,
  deleteJob,
  getJobById,
  searchJobs,
  getJobsByRecruiter,
  getJobsByCompany,
  saveJob,
  removeSavedJob,
  getSavedJobs,
  subscribeToJobAlerts,
  updateJobAlertSubscription,
  unsubscribeFromJobAlerts,
  getJobAlertSubscriptions,
  getJobStatistics,
  closeJob,
  reopenJob,
  getJobRecommendations,
  getFeaturedJobs,
  getJobCategories,
  getJobTypes
};
