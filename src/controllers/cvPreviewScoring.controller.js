import asyncHandler from 'express-async-handler';
import * as cvPreviewScoringService from '../services/cvPreviewScoring.service.js';

/**
 * Preview CV score without creating application
 * @route POST /api/jobs/:jobId/preview-cv-score
 * @access Private (Candidate only)
 */
export const previewCVScore = asyncHandler(async (req, res) => {
  const { id: jobId } = req.params; // Route uses :id not :jobId
  const userId = req.user._id;
  const { cvId, cvTemplateId } = req.body;

  const scoringResult = await cvPreviewScoringService.previewCVScore(userId, jobId, {
    cvId,
    cvTemplateId
  });

  res.status(200).json({
    success: true,
    message: 'Chấm điểm CV thành công',
    data: scoringResult
  });
});
