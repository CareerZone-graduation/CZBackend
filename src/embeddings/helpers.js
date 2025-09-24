import axios from 'axios';
import crypto from 'crypto';

export const CHUNK_SIZE = 3000;
export const OVERLAP = 150;

export function hashSource(text) {
  return crypto.createHash('sha256').update(text || '').digest('hex');
}

export function buildSearchText(job) {
  return [job.title, job.description, job.requirements].filter(Boolean).join('\n\n');
}

export function splitWithOverlap(text, size = CHUNK_SIZE, overlap = OVERLAP) {
  if (!text) return [];
  const parts = [];
  for (let i = 0; i < text.length; i += (size - overlap)) {
    parts.push(text.slice(i, i + size));
  }
  return parts;
}

export async function embedContent(requests, { apiKey, model, maxRetries = 3 } = {}) {
  const embeddings = [];
  const key = apiKey || process.env.GEMINI_API_KEY;

  for (const request of requests) {
    const effectiveModel = request.model || model || 'models/embedding-001';
    const url = `https://generativelanguage.googleapis.com/v1beta/${effectiveModel}:embedContent`;
    
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        const { data } = await axios.post(url, {
          model: effectiveModel,
          content: request.content,
        }, {
          headers: { 'x-goog-api-key': key, 'Content-Type': 'application/json' },
          timeout: 45000
        });
        embeddings.push(data);
        break;
      } catch (err) {
        const status = err.response?.status;
        const errorData = err.response?.data?.error;
        const logPayload = {
          requestUrl: url,
          requestBody: { model: effectiveModel, content: request.content },
          responseStatus: status,
          error: errorData || err.message,
        };

        console.error(`[Gemini] Lỗi API`, logPayload);

        if ((status === 429 || status >= 500) && attempt < maxRetries) {
          const wait = 1000 * Math.pow(2, attempt);
          console.warn(`[Gemini] Gặp lỗi Rate Limit/Server. Thử lại sau ${wait}ms...`);
          await new Promise(r => setTimeout(r, wait));
          continue;
        }
        
        embeddings.push(null);
        break;
      }
    }
  }
  return embeddings;
}
