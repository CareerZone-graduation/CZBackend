import crypto from 'crypto';
import CVScoreCache from '../models/CVScoreCache.js';

const CACHE_FIELDS = new Set(['isCached', 'canReanalyze', 'cacheMessage', 'cacheId']);

const stableStringify = (value) => {
  if (Array.isArray(value)) {
    return `[${value.map(stableStringify).join(',')}]`;
  }

  if (value && typeof value === 'object') {
    if (value instanceof Date) return JSON.stringify(value.toISOString());
    const plainValue = typeof value.toObject === 'function' ? value.toObject() : value;
    return `{${Object.keys(plainValue).sort().map((key) => `${JSON.stringify(key)}:${stableStringify(plainValue[key])}`).join(',')}}`;
  }

  return JSON.stringify(value);
};

const hashPayload = (payload) => crypto
  .createHash('sha256')
  .update(stableStringify(payload))
  .digest('hex');

const toIdString = (value) => value?._id?.toString?.() || value?.toString?.() || '';

export const buildJobFingerprint = (job) => hashPayload({
  title: job?.title || '',
  description: job?.description || '',
  requirements: job?.requirements || '',
  benefits: job?.benefits || '',
  skills: job?.skills || [],
  experience: job?.experience || '',
  education: job?.education || '',
  category: job?.category || ''
});

export const buildCVFingerprint = ({ cvSource, cvPayload }) => {
  if (cvSource === 'TEMPLATE') {
    return hashPayload(cvPayload || {});
  }

  return hashPayload({
    name: cvPayload?.name || '',
    path: cvPayload?.path || '',
    uploadedAt: cvPayload?.uploadedAt || ''
  });
};

export const buildCVScoreCacheKey = ({ userId, job, cvSource, cvId, cvPayload }) => ({
  userId,
  jobId: job?._id || job,
  cvSource,
  cvId: toIdString(cvId),
  cvFingerprint: buildCVFingerprint({ cvSource, cvPayload }),
  jobFingerprint: buildJobFingerprint(job)
});

export const stripCacheMetadata = (score) => {
  const plainScore = typeof score?.toObject === 'function' ? score.toObject() : { ...(score || {}) };
  CACHE_FIELDS.forEach((field) => delete plainScore[field]);
  return plainScore;
};

export const withCacheMetadata = (score, { isCached, cache } = {}) => {
  const plainScore = stripCacheMetadata(score);
  return {
    ...plainScore,
    scoredAt: plainScore.scoredAt || cache?.scoredAt || cache?.updatedAt,
    isCached: Boolean(isCached),
    canReanalyze: true,
    cacheId: cache?._id?.toString?.() || cache?._id,
    cacheMessage: isCached
      ? 'Đang hiển thị kết quả đã lưu. Bạn có thể phân tích lại để cập nhật kết quả mới nhất.'
      : undefined
  };
};

export const getCachedCVScore = async (cacheKey) => CVScoreCache.findOne(cacheKey).lean();

export const saveCVScoreCache = async (cacheKey, scoringResult, metadata = {}) => {
  const scoredAt = new Date();
  return CVScoreCache.findOneAndUpdate(
    cacheKey,
    {
      $set: {
        ...cacheKey,
        scoringResult: stripCacheMetadata(scoringResult),
        metadata,
        scoredAt
      }
    },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  ).lean();
};
