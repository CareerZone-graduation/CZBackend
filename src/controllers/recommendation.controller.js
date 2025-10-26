import asyncHandler from 'express-async-handler';
import * as recommendationService from '../services/recommendation.service.js';
import logger from '../utils/logger.js';

/**
 * Generate job recommendations for the authenticated candidate
 * POST /api/candidate/recommendations/generate
 */
export const generateRecommendations = asyncHandler(async (req, res) => {
  const userId = req.user._id;
  const options = req.body || {};
  
  logger.info('Generating recommendations for candidate', { 
    userId, 
    maxDistance: options.maxDistance,
    limit: options.limit
  });
  
  const result = await recommendationService.generateRecommendations(userId, options);
  
  res.status(200).json({
    success: true,
    message: result.recommendations.length > 0 
      ? `Đã tạo ${result.recommendations.length} gợi ý việc làm phù hợp.`
      : 'Không tìm thấy việc làm phù hợp. Vui lòng cập nhật thông tin hồ sơ hoặc mở rộng tiêu chí.',
    data: {
      recommendations: result.recommendations,
      total: result.total,
      profileCompleteness: result.profileCompleteness
    }
  });
});

/**
 * Get job recommendations with pagination
 * GET /api/candidate/recommendations
 */
export const getRecommendations = asyncHandler(async (req, res) => {
  const userId = req.user._id;
  const options = req.validatedQuery || req.query;
  
  logger.info('Getting recommendations for candidate', { 
    userId, 
    page: options.page,
    limit: options.limit,
    refresh: options.refresh
  });
  
  const result = await recommendationService.getRecommendations(userId, options);
  
  res.status(200).json({
    success: true,
    message: 'Lấy danh sách gợi ý việc làm thành công.',
    data: result.jobs,
    pagination: result.pagination,
    lastUpdated: result.lastUpdated
  });
});
