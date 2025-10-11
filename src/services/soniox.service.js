import axios from 'axios';
import logger from '../utils/logger.js';
import { AppError } from '../utils/AppError.js';

const SONIOX_API_URL = 'https://api.soniox.com/v1/auth/temporary-api-key';
const SONIOX_API_KEY = process.env.SONIOX_API_KEY;

/**
 * Get temporary Soniox API key from Soniox API
 * @returns {Promise<{apiKey: string, expiresAt: string}>}
 */
export const getTemporaryApiKey = async () => {
  try {
    if (!SONIOX_API_KEY) {
      throw new AppError('Soniox API key is not configured', 500);
    }

    const response = await axios.post(
      SONIOX_API_URL,
      {
        usage_type: 'transcribe_websocket',
        expires_in_seconds: 3600 // 1 hour
      },
      {
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${SONIOX_API_KEY}`
        }
      }
    );

    const { api_key, expires_at } = response.data;

    logger.info('Temporary Soniox API key generated successfully', {
      expiresAt: expires_at
    });

    return {
      apiKey: api_key,
      expiresAt: expires_at
    };
  } catch (error) {
    logger.error('Failed to get temporary Soniox API key', {
      error: error.message,
      response: error.response?.data
    });

    if (error.response) {
      throw new AppError(
        `Soniox API error: ${error.response.data?.message || error.message}`,
        error.response.status
      );
    }

    throw new AppError('Failed to get temporary Soniox API key', 500);
  }
};
