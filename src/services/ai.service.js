import logger from '../utils/logger.js';

const PYTHON_SERVICE_URL = process.env.PYTHON_SERVICE_URL || 'http://localhost:8000';
const INTERNAL_API_KEY = process.env.INTERNAL_API_KEY;

/**
 * Enhance job posting content using FastAPI streaming
 * @param {Object} jobData - Job data to enhance
 * @returns {Promise<ReadableStream>} Stream of SSE events
 */
export const enhanceJobContent = async (jobData) => {
  try {
    if (!INTERNAL_API_KEY) {
      throw new Error('INTERNAL_API_KEY not configured');
    }

    logger.info('Calling FastAPI for job enhancement streaming');

    const response = await fetch(`${PYTHON_SERVICE_URL}/api/v1/enhance-job/stream`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Internal-Api-Key': INTERNAL_API_KEY,
      },
      body: JSON.stringify(jobData),
    });

    if (!response.ok) {
      const errorText = await response.text();
      logger.error('FastAPI error:', errorText);
      throw new Error(`FastAPI returned ${response.status}: ${errorText}`);
    }

    if (!response.body) {
      throw new Error('No response body from FastAPI');
    }

    logger.info('FastAPI streaming started successfully');
    return response.body;
  } catch (error) {
    logger.error('Error calling FastAPI for job enhancement:', error.message);
    throw new Error(error.message || 'Failed to enhance job content');
  }
};


