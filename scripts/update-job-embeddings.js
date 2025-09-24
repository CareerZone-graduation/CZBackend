// scripts/update-job-embeddings.js
import mongoose from 'mongoose';
import axios from 'axios';
import dotenv from 'dotenv';
import { Job } from '../src/models/index.js';
import logger from '../src/utils/logger.js';
import {
  buildSearchText,
  splitWithOverlap,
  hashSource,
} from '../src/embeddings/helpers.js';

dotenv.config();

/* ===================== CẤU HÌNH ===================== */
const MODEL = process.env.EMBED_MODEL || 'models/gemini-embedding-001';
const MONGODB_URI = process.env.DB_URI || "mongodb://localhost:27017/careerzone2";
const JOBS_PER_BATCH = 100;
const GEMINI_BATCH_LIMIT = 100;
const MAX_RETRIES = 100;
const DELAY_BETWEEN_GEMINI_BATCHES_MS = 800;
const DELAY_BETWEEN_JOB_BATCHES_MS = 1000;
const ONLY_MISSING = process.env.ONLY_MISSING === 'true';

/* ===================== TIỆN ÍCH ===================== */
function maskConnStr(uri) { return uri?.replace(/\/\/([^:]+):([^@]+)@/, '//***:***@') || ''; }
function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }
function chunkArray(arr, size) {
    const out = [];
    for (let i = 0; i < arr.length; i += size) {
        out.push(arr.slice(i, i + size));
    }
    return out;
}

/* ===================== GỌI GEMINI ===================== */
async function createEmbeddingsBatch(requests) {
    const url = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-embedding-001:batchEmbedContents';
    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
        try {
            const { data } = await axios.post(url, { requests }, {
                headers: { 'x-goog-api-key': process.env.GEMINI_API_KEY, 'Content-Type': 'application/json' },
                timeout: 45000 // Tăng timeout
            });
            return data.embeddings || [];
        } catch (err) {
            const status = err.response?.status;
            console.error(`❗ [Gemini] Lỗi khi gọi API (Attempt ${attempt}/${MAX_RETRIES}):`, status);
            if ((status === 429 || status >= 500) && attempt < MAX_RETRIES) {
                const wait = 10000;
                logger?.warn?.(`[Gemini] Gặp lỗi Rate Limit/Server. Thử lại sau ${wait}ms...`);
                await sleep(wait);
                continue;
            }
            throw err;
        }
    }
    return []; // Trả về mảng rỗng nếu tất cả retry đều thất bại
}

/* ===================== HÀM XỬ LÝ CHÍNH ĐÃ CẤU TRÚC LẠI ===================== */
(async function run() {
    console.log('🚀 Job Embeddings Updater (Batch Mode) — Start:', new Date().toISOString());

    if (!MONGODB_URI || !process.env.GEMINI_API_KEY) {
        console.error('❌ Thiếu MONGODB_URI hoặc GEMINI_API_KEY trong file .env');
        process.exit(1);
    }
    console.log('🔗 MongoDB:', maskConnStr(MONGODB_URI));

    try {
        await mongoose.connect(MONGODB_URI);
        console.log('✅ Đã kết nối MongoDB');

        const findQuery = ONLY_MISSING ? { $or: [{ chunks: { $exists: false } }, { chunks: { $size: 0 } }] } : {};
        console.log('🔍 Đang lấy danh sách jobs... (Filter:', ONLY_MISSING ? 'ALL' : 'ONLY_MISSING', ')');
        const allJobs = await Job.find(findQuery).lean();

        if (!allJobs.length) {
            console.log('⚠️ Không có job nào cần xử lý. Kết thúc.');
            return;
        }
        console.log(`📊 Tổng số jobs cần xử lý: ${allJobs.length}`);

        const jobBatches = chunkArray(allJobs, JOBS_PER_BATCH);
        console.log(`📦 Chia thành ${jobBatches.length} lô, mỗi lô ~${JOBS_PER_BATCH} jobs.`);

        let totalOk = 0, totalFail = 0;

        for (let i = 0; i < jobBatches.length; i++) {
            const jobBatch = jobBatches[i];
            console.log(`\n⚡ Processing Lô ${i + 1}/${jobBatches.length} với ${jobBatch.length} jobs...`);

            const allRequestsInBatch = [];
            const metaData = [];

            for (const job of jobBatch) {
                const combinedText = buildSearchText(job);
                const chunks = splitWithOverlap(combinedText);

                chunks.forEach((chunkText, chunkIndex) => {
                    allRequestsInBatch.push({
                        model: MODEL,
                        content: { parts: [{ text: chunkText }] }
                    });
                    metaData.push({
                        jobId: job._id.toString(),
                        chunkIndex: chunkIndex,
                        pageContent: chunkText,
                    });
                });
            }

            if (allRequestsInBatch.length === 0) {
                console.log('⚠️ Lô này không có nội dung để xử lý, bỏ qua.');
                continue;
            }

            console.log(`  -> Tổng cộng ${allRequestsInBatch.length} chunks từ ${jobBatch.length} jobs trong lô này.`);

            const geminiBatches = chunkArray(allRequestsInBatch, GEMINI_BATCH_LIMIT);
            const allEmbeddings = [];
            console.log(`  -> Gửi lên Gemini thành ${geminiBatches.length} đợt API...`);

            for (let j = 0; j < geminiBatches.length; j++) {
                const geminiBatch = geminiBatches[j];
                const embeddings = await createEmbeddingsBatch(geminiBatch);
                allEmbeddings.push(...embeddings);
                if (j < geminiBatches.length - 1) {
                    await sleep(DELAY_BETWEEN_GEMINI_BATCHES_MS);
                }
            }
            
            if (allEmbeddings.length !== allRequestsInBatch.length) {
                console.error(`❌ Lỗi nghiêm trọng: Số embedding trả về (${allEmbeddings.length}) không khớp số request (${allRequestsInBatch.length}). Bỏ qua lô này.`);
                totalFail += jobBatch.length;
                continue;
            }

            const jobsToUpdate = new Map();
            for (let k = 0; k < metaData.length; k++) {
                const meta = metaData[k];
                const embedding = allEmbeddings[k]?.values || [];

                if (!jobsToUpdate.has(meta.jobId)) {
                    jobsToUpdate.set(meta.jobId, []);
                }
                jobsToUpdate.get(meta.jobId).push({
                    jobId: meta.jobId,
                    chunkIndex: meta.chunkIndex,
                    pageContent: meta.pageContent,
                    embedding: embedding
                });
            }

            const updatePromises = [];
            for (const [jobId, chunks] of jobsToUpdate.entries()) {
                chunks.sort((a, b) => a.chunkIndex - b.chunkIndex);
                const job = allJobs.find(j => j._id.toString() === jobId);
                const sourceText = buildSearchText(job);
                const updatePromise = Job.findByIdAndUpdate(
                    jobId,
                    {
                        $set: {
                            chunks: chunks,
                            embeddingsUpdatedAt: new Date(),
                            embeddingSourceHash: hashSource(sourceText),
                            embeddingModelVersion: process.env.EMBED_MODEL_VERSION || 'v1'
                        }
                    }
                ).then(() => {
                    logger?.info?.(`Updated ${chunks.length} chunks for job ${jobId}`);
                    totalOk++;
                }).catch(err => {
                    logger?.error?.(`Failed to update job ${jobId}: ${err.message}`);
                    totalFail++;
                });
                updatePromises.push(updatePromise);
            }

            console.log(`  -> Đang cập nhật ${updatePromises.length} jobs vào DB...`);
            await Promise.all(updatePromises);
            console.log(`✅ Hoàn thành xử lý Lô ${i + 1}.`);
            
            if (i < jobBatches.length - 1) {
                await sleep(DELAY_BETWEEN_JOB_BATCHES_MS);
            }
        }

        console.log('\n🎉 Hoàn tất toàn bộ quá trình!');
        console.log(`📈 Tổng kết: ${totalOk} jobs thành công | ${totalFail} jobs lỗi`);

    } catch (err) {
        console.error('💥 Lỗi nghiêm trọng:', err.message, err.stack);
        logger?.error?.('Fatal error:', err);
        process.exit(1);
    } finally {
        await mongoose.disconnect();
        console.log('🔌 Đã ngắt kết nối MongoDB');
    }
})();