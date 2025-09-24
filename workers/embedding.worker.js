import path from 'path';
import dotenv from 'dotenv';
dotenv.config({ path: path.resolve(process.cwd(), '.env') });

import connectDB from '../src/utils/connectDB.js';
import logger from '../src/utils/logger.js';
import { Job } from '../src/models/index.js';

import {
  buildSearchText,
  splitWithOverlap,
  embedContent,
  hashSource
} from '../src/embeddings/helpers.js';


const INTEREST_FIELDS = [
  'title','description','requirements'
];
function isEmbeddingAffected(updatedFields = {}, removedFields = []) {
  const keys = Object.keys(updatedFields);
  const touched = new Set([
    ...keys.map(k => k.split('.')[0]),
    ...removedFields.map(k => k.split('.')[0]),
  ]);
  return INTEREST_FIELDS.some(f => touched.has(f.split('.')[0]));
}

async function processJobEmbedding(jobId) {
  const job = await Job.findById(jobId).lean();
  if (!job) return;

  const source = buildSearchText(job);
  const newHash = hashSource(source);

  const chunks = splitWithOverlap(source);
  if (chunks.length === 0) {
    await Job.findByIdAndUpdate(jobId, {
      $set: {
        chunks: [],
        embeddingsUpdatedAt: new Date(),
      }
    });
    logger.info(`🗑️ Job ${jobId} không có nội dung → clear chunks`);
    return;
  }

  const requests = chunks.map(t => ({
    model: process.env.EMBED_MODEL || 'models/embedding-001',
    content: {
      parts: [{ text: t }],
    },
  }));
  const vectors = await embedContent(requests);

  const newChunks = vectors.map((e, i) => ({
    jobId,
    chunkIndex: i,
    pageContent: chunks[i],
    embedding: e?.embedding?.values || []
  }));

  await Job.findByIdAndUpdate(jobId, {
    $set: {
      chunks: newChunks,
      embeddingsUpdatedAt: new Date(),
    }
  });
  logger.info(`✅ Re-embedded Job ${jobId}: ${newChunks.length} chunks`);
}

// ============ Start Change Streams ============
async function startWorker() {
  await connectDB();

  logger.info('🚀 Embedding worker (Change Streams) started. Listening for DB changes...');

  const pipeline = [
    { $match: { operationType: { $in: ['insert', 'update'] } } },
    // Có thể thêm: { $match: { 'fullDocument.status': 'PUBLISHED' } },
  ];

  let lastResumeToken = null;
  let changeStream = Job.collection.watch(pipeline, { fullDocument: 'updateLookup' });

  changeStream.on('change', async (change) => {
    try {
      lastResumeToken = change._id;

      const job = change.fullDocument;
      if (!job) {
        logger.warn('Change event thiếu fullDocument', { change });
        return;
      }

      if (change.operationType === 'update') {
        const updatedFields = change.updateDescription?.updatedFields || {};
        const removedFields = change.updateDescription?.removedFields || [];
        if (!isEmbeddingAffected(updatedFields, removedFields)) {
          logger.info(`Job ${job._id} cập nhật nhưng không ảnh hưởng embedding → bỏ qua`);
          return;
        }
      }

      await processJobEmbedding(job._id.toString());
    } catch (err) {
      logger.error(`❌ Lỗi xử lý change stream Job ${change.documentKey?._id}: ${err.message}`, { stack: err.stack });
    }
  });

  changeStream.on('error', async (error) => {
    logger.error('🚨 Change Stream lỗi:', error);
    try { await changeStream.close(); } catch {}
    const opts = { fullDocument: 'updateLookup', ...(lastResumeToken ? { resumeAfter: lastResumeToken } : {}) };
    logger.warn('🔁 Restart Change Stream...');
    changeStream = Job.collection.watch(pipeline, opts);
  });

  changeStream.on('close', () => {
    logger.warn('⚠️ Change Stream đóng. Nên có PM2/systemd tự restart tiến trình.');
  });
}

startWorker().catch(async (e) => {
  logger.error('🚨 Worker khởi động lỗi', e);
  process.exit(1);
});