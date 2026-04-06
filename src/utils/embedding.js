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

/**
 * Generate multiple embeddings in a batch using Google Gemini API
 * @param {string[]} texts - Array of texts to generate embeddings for
 * @param {string} model - Model to use (default: models/gemini-embedding-001)
 * @returns {Promise<Array<number[] | null>>} Array of embedding vectors (or null for failed items)
 */
export const generateBatchEmbeddings = async (texts, model = 'models/gemini-embedding-001') => {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error('GEMINI_API_KEY is not configured');
  if (!texts || texts.length === 0) return [];

  const BATCH_LIMIT = 100; // Gemini API limit
  const MAX_RETRIES = 10;
  const allEmbeddings = new Array(texts.length).fill(null);

  // Split input texts into batches of 100
  const batches = [];
  for (let i = 0; i < texts.length; i += BATCH_LIMIT) {
    batches.push({
      startIdx: i,
      texts: texts.slice(i, i + BATCH_LIMIT)
    });
  }

  for (const batch of batches) {
    // Lọc index các text hợp lệ (không rỗng) trong batch này
    const validIndices = [];
    const requests = [];
    batch.texts.forEach((text, localIdx) => {
      const trimmed = text ? text.trim().substring(0, 9000) : '';
      if (trimmed.length > 0) {
        validIndices.push(localIdx);
        requests.push({ model, content: { parts: [{ text: trimmed }] } });
      }
    });

    if (requests.length === 0) continue; // toàn bộ chunk rỗng, bỏ qua

    // Retry loop
    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
      try {
        const response = await fetch('https://generativelanguage.googleapis.com/v1beta/models/gemini-embedding-001:batchEmbedContents', {
          method: 'POST',
          headers: {
            'x-goog-api-key': apiKey,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ requests })
        });

        if (!response.ok) {
          const status = response.status;
          const errorText = await response.text();

          if ((status === 429 || status >= 500) && attempt < MAX_RETRIES) {
            // const waitTime = Math.pow(2, attempt) * 1000 + 500;
            // logger.warn(`Gemini Batch API rate limit/error (${status}). Retrying in ${waitTime}ms... (Attempt ${attempt}/${MAX_RETRIES})`);
            // await new Promise(r => setTimeout(r, waitTime));
            const waitTime = 62000;
            logger.warn(`Gemini Batch API rate limit/error (${status}). Retrying in ${waitTime}ms... (Attempt ${attempt}/${MAX_RETRIES})`);
            await new Promise(r => setTimeout(r, waitTime));
            continue; // Retry
          }

          logger.error(`Gemini Batch API fatal error (${status}): ${errorText}`);
          break; // Fatal error, move to next batch
        }

        const data = await response.json();
        const embeddings = data.embeddings || [];

        // Map back theo validIndices (bỏ qua các text rỗng đã lọc)
        embeddings.forEach((emb, i) => {
          if (emb && emb.values) {
            const localIdx = validIndices[i];
            allEmbeddings[batch.startIdx + localIdx] = emb.values;
          }
        });

        break; // Success, exit retry loop

      } catch (error) {
        if (attempt < MAX_RETRIES) {
          const waitTime = 61000;
          logger.warn(`Network error in batch generation. Retrying in ${waitTime}ms...`, error.message);
          await new Promise(r => setTimeout(r, waitTime));
        } else {
          logger.error('Final failure in batch embedding generation:', error);
        }
      }
    }

    // Delay between batches to be nice to API
    if (batches.length > 1 && batch !== batches[batches.length - 1]) {
      await new Promise(r => setTimeout(r, 1000));
    }
  }

  return allEmbeddings;
};
