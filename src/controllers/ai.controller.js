import * as aiService from '../services/ai.service.js';
import logger from '../utils/logger.js';

/**
 * Enhance job content with AI
 * @route POST /api/ai/enhance-job
 */
export const enhanceJobContent = async (req, res) => {
  try {
    const jobData = req.body;

    if (!jobData || Object.keys(jobData).length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Job data is required'
      });
    }

    const enhancedData = await aiService.enhanceJobContent(jobData);

    res.status(200).json({
      success: true,
      message: 'Job content enhanced successfully',
      data: enhancedData
    });
  } catch (error) {
    logger.error('Error in enhanceJobContent controller:', error);
    logger.error('Error stack:', error.stack);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to enhance job content',
      error: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
};


/**
 * Generate smart suggestions based on job title
 * @route POST /api/ai/smart-suggestions
 */
export const generateSmartSuggestions = async (req, res) => {
  try {
    const { jobTitle } = req.body;

    if (!jobTitle || jobTitle.trim().length < 3) {
      return res.status(400).json({
        success: false,
        message: 'Job title is required (minimum 3 characters)'
      });
    }

    const suggestions = await aiService.generateSmartSuggestions(jobTitle);

    res.status(200).json({
      success: true,
      message: 'Smart suggestions generated successfully',
      data: suggestions
    });
  } catch (error) {
    logger.error('Error in generateSmartSuggestions controller:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to generate suggestions'
    });
  }
};
