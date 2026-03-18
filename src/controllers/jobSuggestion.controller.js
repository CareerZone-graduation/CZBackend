import * as jobSuggestionService from '../services/jobSuggestion.service.js';
import logger from '../utils/logger.js';

/**
 * Search job titles for autocomplete
 * @route GET /api/jobs/suggestions/titles?q=keyword
 */
export const searchJobTitles = async (req, res) => {
  try {
    const { q } = req.query;
    const limit = parseInt(req.query.limit) || 10;

    const titles = await jobSuggestionService.searchJobTitles(q, limit);

    res.status(200).json({
      success: true,
      data: titles
    });
  } catch (error) {
    logger.error('Error in searchJobTitles controller:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to search job titles'
    });
  }
};

/**
 * Get popular job titles
 * @route GET /api/jobs/suggestions/popular
 */
export const getPopularJobTitles = async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 20;
    const titles = await jobSuggestionService.getPopularJobTitles(limit);

    res.status(200).json({
      success: true,
      data: titles
    });
  } catch (error) {
    logger.error('Error in getPopularJobTitles controller:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get popular job titles'
    });
  }
};
