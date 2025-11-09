import asyncHandler from 'express-async-handler';
import {
  getCandidateSuggestions,
  generateRecommendations as generateRecommendationsService,
  getRecommendations as getRecommendationsService,
} from '../services/recommendation.service.js';
import { Job } from '../models/index.js';
import { NotFoundError, ForbiddenError, UnprocessableEntityError } from '../utils/AppError.js';
import logger from '../utils/logger.js';

/**
 * Get candidate suggestions for a job using AI vector search
 * @route GET /api/v1/employers/jobs/:jobId/suggestions
 * @access Private (Recruiter only)
 */
export const getSuggestions = asyncHandler(async (req, res) => {
  const { id: jobId } = req.params;
  const { page = 1, limit = 10, minScore = 0.5 } = req.validatedQuery || req.query;
  const userId = req.user._id;
  
  logger.info('Fetching candidate suggestions', { jobId, userId, page, limit, minScore });
  
  // Verify job exists and populate recruiter profile to check ownership
  const job = await Job.findById(jobId).populate('recruiterProfileId');
  
  if (!job) {
    throw new NotFoundError('Không tìm thấy tin tuyển dụng');
  }
  
  // Verify authenticated user owns the job
  if (job.recruiterProfileId.userId.toString() !== userId.toString()) {
    logger.warn('Unauthorized access attempt to job suggestions', { 
      jobId, 
      userId, 
      jobOwnerId: job.recruiterProfileId.userId.toString() 
    });
    throw new ForbiddenError('Bạn không có quyền xem gợi ý cho tin tuyển dụng này');
  }
  
  // Check if job has embeddings
  if (!job.chunks || job.chunks.length === 0) {
    logger.warn('Job has no embeddings', { jobId });
    throw new UnprocessableEntityError(
      'Tin tuyển dụng chưa được xử lý. Vui lòng thử lại sau vài phút.'
    );
  }
  
  // Get suggestions from service
  const results = await getCandidateSuggestions(jobId, {
    page: parseInt(page),
    limit: Math.min(parseInt(limit), 50),
    minScore: parseFloat(minScore)
  });
  
  logger.info('Suggestions retrieved successfully', {
    jobId,
    userId,
    candidateCount: results.data.candidates.length,
    page,
    totalItems: results.data.pagination.totalItems
  });
  
  res.json({
    success: true,
    data: results.data,
    message: 'Lấy danh sách ứng viên gợi ý thành công'
  });
});

/**
 * Generate job recommendations for a candidate
 * @route POST /api/v1/candidate/recommendations/generate
 * @access Private (Candidate only)
 */
export const generateRecommendations = asyncHandler(async (req, res) => {
  const userId = req.user._id;
  const options = req.body || {};

  logger.info('Generating job recommendations for candidate', { userId, options });

  const result = await generateRecommendationsService(userId, options);

  logger.info('Job recommendations generated successfully', {
    userId,
    totalRecommendations: result.total,
  });

  res.json({
    success: true,
    data: result,
    message: 'Tạo gợi ý việc làm thành công',
  });
});

/**
 * Get saved job recommendations for a candidate
 * @route GET /api/v1/candidate/recommendations
 * @access Private (Candidate only)
 */
export const getRecommendations = asyncHandler(async (req, res) => {
  const userId = req.user._id;
  const options = req.validatedQuery || req.query;

  logger.info('Fetching job recommendations for candidate', { userId, options });

  const result = await getRecommendationsService(userId, options);

  logger.info('Job recommendations retrieved successfully', {
    userId,
    totalItems: result.pagination.totalItems,
    page: result.pagination.currentPage,
  });

   res.status(200).json({
    success: true,
    message: 'Lấy danh sách gợi ý việc làm thành công.',
    data: result.jobs,
    pagination: result.pagination,
    lastUpdated: result.lastUpdated
  });
});
