import asyncHandler from 'express-async-handler';
import * as cvOptimizationService from '../services/cvOptimization.service.js';

/**
 * Generate optimized CV
 * @route POST /api/jobs/:id/optimize-cv
 * @access Private (Candidate only)
 */
export const optimizeCV = asyncHandler(async (req, res) => {
  const { id: jobId } = req.params;
  const userId = req.user._id;
  const { cvId, cvTemplateId, scoringData } = req.body;

  const result = await cvOptimizationService.generateOptimizedCV(userId, jobId, {
    cvId,
    cvTemplateId,
    scoringData
  });

  res.status(200).json({
    success: true,
    message: 'Đã tạo CV tối ưu thành công',
    data: result
  });
});
