import asyncHandler from 'express-async-handler';
import {
  getCandidateSuggestionsAI,
  retryJobEmbeddings,
  generateRecommendations as generateRecommendationsService,
  getRecommendations as getRecommendationsService,
  getAIRecommendations as getAIRecommendationsService,
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

  // Get suggestions from service (using AI matching)
  const results = await getCandidateSuggestionsAI(jobId, {
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

export const retrySuggestionEmbeddings = asyncHandler(async (req, res) => {
  const { id: jobId } = req.params;
  const userId = req.user._id;

  const job = await Job.findById(jobId).populate('recruiterProfileId');

  if (!job) {
    throw new NotFoundError('Không tìm thấy tin tuyển dụng');
  }

  if (job.recruiterProfileId.userId.toString() !== userId.toString()) {
    logger.warn('Unauthorized access attempt to retry suggestion embeddings', {
      jobId,
      userId,
      jobOwnerId: job.recruiterProfileId.userId.toString()
    });
    throw new ForbiddenError('Bạn không có quyền thao tác với tin tuyển dụng này');
  }

  const result = await retryJobEmbeddings(jobId);

  res.status(202).json({
    success: true,
    message: result.message,
    data: {
      status: result.status
    }
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


  const result = await generateRecommendationsService(userId, options);


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


  const result = await getRecommendationsService(userId, options);

  res.status(200).json({
    success: true,
    message: 'Lấy danh sách gợi ý việc làm thành công.',
    data: result.jobs,
    pagination: result.pagination,
    lastUpdated: result.lastUpdated
  });
});

/**
 * Get AI-powered job recommendations from FastAPI service
 * @route GET /api/v1/candidate/recommendations/ai
 * @access Private (Candidate only)
 */
export const getAIRecommendations = asyncHandler(async (req, res) => {
  const userId = req.user._id.toString();
  const { page = 1, limit = 20 } = req.query;

  const result = await getAIRecommendationsService(userId, {
    page: parseInt(page),
    limit: Math.min(parseInt(limit), 50),
  });

  res.json({
    success: true,
    message: 'Lấy danh sách gợi ý việc làm AI thành công.',
    data: result.jobs,
    source: result.source,
    pagination: result.pagination,
  });
});
