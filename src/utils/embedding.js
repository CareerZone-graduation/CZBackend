import logger from './logger.js';

/**
 * Generate text embedding using Google Gemini API
 * @param {string} text - Text to generate embedding for
 * @returns {Promise<number[]>} Array of embedding values
 */
export const generateEmbedding = async (text) => {
  const apiKey = process.env.GEMINI_API_KEY;

  if (!apiKey) {
    throw new Error('GEMINI_API_KEY is not configured');
  }

  if (!text || typeof text !== 'string' || text.trim().length === 0) {
    throw new Error('Text input is required and must be a non-empty string');
  }

  try {
    const response = await fetch('https://generativelanguage.googleapis.com/v1beta/models/gemini-embedding-001:embedContent', {
      method: 'POST',
      headers: {
        'x-goog-api-key': apiKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'models/gemini-embedding-001',
        content: {
          parts: [{ text: text.trim() }]
        }
      })
    });

    if (!response.ok) {
      const errorData = await response.text();
      logger.error('Gemini API error:', {
        status: response.status,
        statusText: response.statusText,
        error: errorData
      });
      throw new Error(`Gemini API error: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();

    if (!data.embedding || !data.embedding.values) {
      logger.error('Invalid response from Gemini API:', data);
      throw new Error('Invalid response format from Gemini API');
    }

    logger.info('Successfully generated embedding', {
      textLength: text.length,
      embeddingDimension: data.embedding.values.length
    });

    return data.embedding.values;

  } catch (error) {
    logger.error('Error generating embedding:', {
      error: error.message,
      textPreview: text.substring(0, 100)
    });

    // Re-throw the error to be handled by the calling function
    throw error;
  }
};

/**
 * Generate embedding with retry logic and fallback
 * @param {string} text - Text to generate embedding for
 * @param {number} maxRetries - Maximum number of retries (default: 3)
 * @returns {Promise<number[]>} Array of embedding values
 */
export const generateEmbeddingWithRetry = async (text, maxRetries = 3) => {
  let lastError;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await generateEmbedding(text);
    } catch (error) {
      lastError = error;
      logger.warn(`Embedding generation attempt ${attempt} failed:`, {
        error: error.message,
        attempt,
        maxRetries
      });

      if (attempt < maxRetries) {
        // Wait before retrying (exponential backoff)
        const delay = Math.pow(2, attempt) * 1000; // 2s, 4s, 8s...
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  }

  // If all retries failed, throw the last error
  throw lastError;
};