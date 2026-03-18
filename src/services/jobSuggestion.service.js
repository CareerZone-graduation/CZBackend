import Job from '../models/Job.js';
import logger from '../utils/logger.js';

/**
 * Search job titles for autocomplete from database
 * @param {string} query - Search query
 * @param {number} limit - Maximum results
 * @returns {Promise<string[]>} Array of unique job titles
 */
export const searchJobTitles = async (query, limit = 10) => {
  try {
    logger.info(`Searching job titles for: "${query}"`);

    // Build query - TEMPORARILY REMOVE status filter for testing
    const searchQuery = {};

    // Add title filter if query provided
    if (query && query.trim().length > 0) {
      searchQuery.title = { $regex: query.trim(), $options: 'i' };
    }

    // Query database
    const jobs = await Job.find(searchQuery)
      .select('title')
      .limit(50)
      .lean()
      .maxTimeMS(5000);

    logger.info(`Found ${jobs.length} jobs from database`);

    // Extract unique titles
    const uniqueTitles = [...new Set(jobs.map(job => job.title))];
    
    logger.info(`Returning ${uniqueTitles.length} unique titles`);
    return uniqueTitles.slice(0, limit);
  } catch (error) {
    logger.error('Error searching job titles:', error);
    return [];
  }
};

/**
 * Get popular job titles from database
 * @param {number} limit - Maximum results
 * @returns {Promise<string[]>} Array of popular job titles
 */
export const getPopularJobTitles = async (limit = 20) => {
  try {
    logger.info('Getting popular job titles from database');
    
    // Get recent jobs - TEMPORARILY REMOVE status filter for testing
    const jobs = await Job.find({})
      .select('title')
      .sort({ createdAt: -1 })
      .limit(100)
      .lean()
      .maxTimeMS(5000);

    // Get unique titles
    const uniqueTitles = [...new Set(jobs.map(job => job.title))];
    
    logger.info(`Returning ${uniqueTitles.length} popular titles`);
    return uniqueTitles.slice(0, limit);
  } catch (error) {
    logger.error('Error getting popular job titles:', error);
    return [];
  }
};
