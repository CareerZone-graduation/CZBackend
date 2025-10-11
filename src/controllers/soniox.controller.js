import asyncHandler from 'express-async-handler';
import * as sonioxService from '../services/soniox.service.js';

/**
 * @desc    Get temporary Soniox API key
 * @route   GET /api/soniox/temporary-api-key
 * @access  Private
 */
export const getTemporaryApiKey = asyncHandler(async (req, res) => {
  const result = await sonioxService.getTemporaryApiKey();

  res.json({
    success: true,
    message: 'Temporary API key retrieved successfully',
    data: result
  });
});
