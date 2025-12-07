// scripts/backfill-embeddings.js
import mongoose from 'mongoose';
import dotenv from 'dotenv';
import { User, Job } from '../src/models/index.js';
import {
  batchGenerateCandidateEmbeddings,
  batchGenerateJobEmbeddings
} from '../src/services/embedding.service.js';
import logger from '../src/utils/logger.js';

dotenv.config();

/* ===================== CONFIGURATION ===================== */
const MONGODB_URI = process.env.DB_URI || "mongodb://localhost:27017/careerzone";
const CANDIDATE_BATCH_SIZE = 80; // Process 3 candidates concurrently
const JOB_BATCH_SIZE = 100; // Process 5 jobs concurrently
const MODE = 'candidates'; // 'candidates', 'jobs', or 'both'

/* ===================== UTILITIES ===================== */
function maskConnStr(uri) {
  return uri?.replace(/\/\/([^:]+):([^@]+)@/, '//***:***@') || '';
}


/* ===================== FIND CANDIDATES WITHOUT EMBEDDINGS ===================== */
async function findCandidatesWithoutEmbeddings() {
  console.log('🔍 Finding candidates without embeddings...');

  const candidates = await User.find({
    role: 'candidate',
    $or: [
      { embedding: { $exists: false } },
      { embedding: { $size: 0 } },
      { embeddingUpdatedAt: { $exists: false } }
    ]
  }).select('_id email').lean();

  console.log(`📊 Found ${candidates.length} candidates without embeddings`);
  return candidates.map(c => c._id.toString());
}

/* ===================== FIND JOBS WITHOUT EMBEDDINGS ===================== */
async function findJobsWithoutEmbeddings() {
  console.log('🔍 Finding active jobs without embeddings...');

  const jobs = await Job.find({
    // status: 'ACTIVE',
    $or: [
      { chunks: { $exists: false } },
      { chunks: { $size: 0 } },
      { embeddingsUpdatedAt: { $exists: false } }
    ]
  }).select('_id title').lean();

  console.log(`📊 Found ${jobs.length} active jobs without embeddings`);
  return jobs.map(j => j._id.toString());
}

/* ===================== PROCESS CANDIDATES ===================== */
async function processCandidates() {
  console.log('\n🎯 Starting candidate embedding backfill...');

  const candidateIds = await findCandidatesWithoutEmbeddings();

  if (candidateIds.length === 0) {
    console.log('✅ No candidates need embedding generation');
    return { success: 0, failed: 0, errors: [] };
  }

  console.log(`⚡ Processing ${candidateIds.length} candidates in batches of ${CANDIDATE_BATCH_SIZE}...`);

  const results = await batchGenerateCandidateEmbeddings(candidateIds, CANDIDATE_BATCH_SIZE);

  console.log('\n📈 Candidate Embedding Results:');
  console.log(`   ✅ Success: ${results.success}`);
  console.log(`   ❌ Failed: ${results.failed}`);

  if (results.errors.length > 0) {
    console.log('\n⚠️ Errors encountered:');
    results.errors.slice(0, 10).forEach(err => {
      console.log(`   - User ${err.userId}: ${err.error}`);
    });
    if (results.errors.length > 10) {
      console.log(`   ... and ${results.errors.length - 10} more errors`);
    }
  }

  return results;
}

/* ===================== PROCESS JOBS ===================== */
async function processJobs() {
  console.log('\n🎯 Starting job embedding backfill...');

  const jobIds = await findJobsWithoutEmbeddings();

  if (jobIds.length === 0) {
    console.log('✅ No jobs need embedding generation');
    return { success: 0, failed: 0, errors: [] };
  }

  console.log(`⚡ Processing ${jobIds.length} jobs in batches of ${JOB_BATCH_SIZE}...`);

  const results = await batchGenerateJobEmbeddings(jobIds, JOB_BATCH_SIZE);

  console.log('\n📈 Job Embedding Results:');
  console.log(`   ✅ Success: ${results.success}`);
  console.log(`   ❌ Failed: ${results.failed}`);

  if (results.errors.length > 0) {
    console.log('\n⚠️ Errors encountered:');
    results.errors.slice(0, 10).forEach(err => {
      console.log(`   - Job ${err.jobId}: ${err.error}`);
    });
    if (results.errors.length > 10) {
      console.log(`   ... and ${results.errors.length - 10} more errors`);
    }
  }

  return results;
}

/* ===================== MAIN EXECUTION ===================== */
(async function run() {
  console.log('🚀 Embedding Backfill Script — Start:', new Date().toISOString());
  console.log(`📋 Mode: ${MODE.toUpperCase()}`);

  if (!MONGODB_URI || !process.env.GEMINI_API_KEY) {
    console.error('❌ Missing MONGODB_URI or GEMINI_API_KEY in .env file');
    process.exit(1);
  }

  console.log('🔗 MongoDB:', maskConnStr(MONGODB_URI));

  try {
    // Connect to MongoDB
    await mongoose.connect(MONGODB_URI);
    console.log('✅ Connected to MongoDB');

    const totalResults = {
      candidates: { success: 0, failed: 0, errors: [] },
      jobs: { success: 0, failed: 0, errors: [] }
    };

    // Process based on mode
    if (MODE === 'candidates' || MODE === 'both') {
      totalResults.candidates = await processCandidates();
    }

    if (MODE === 'jobs' || MODE === 'both') {
      totalResults.jobs = await processJobs();
    }

    // Print summary
    console.log('\n' + '='.repeat(60));
    console.log('🎉 BACKFILL COMPLETE!');
    console.log('='.repeat(60));

    if (MODE === 'candidates' || MODE === 'both') {
      console.log('\n👥 Candidates:');
      console.log(`   ✅ Success: ${totalResults.candidates.success}`);
      console.log(`   ❌ Failed: ${totalResults.candidates.failed}`);
    }

    if (MODE === 'jobs' || MODE === 'both') {
      console.log('\n💼 Jobs:');
      console.log(`   ✅ Success: ${totalResults.jobs.success}`);
      console.log(`   ❌ Failed: ${totalResults.jobs.failed}`);
    }

    console.log('\n📊 Total:');
    console.log(`   ✅ Success: ${totalResults.candidates.success + totalResults.jobs.success}`);
    console.log(`   ❌ Failed: ${totalResults.candidates.failed + totalResults.jobs.failed}`);
    console.log('='.repeat(60));

    // Log to file
    logger.info('Embedding backfill completed', {
      mode: MODE,
      candidates: {
        success: totalResults.candidates.success,
        failed: totalResults.candidates.failed,
        errorCount: totalResults.candidates.errors.length
      },
      jobs: {
        success: totalResults.jobs.success,
        failed: totalResults.jobs.failed,
        errorCount: totalResults.jobs.errors.length
      }
    });

  } catch (err) {
    console.error('💥 Fatal error:', err.message);
    console.error(err.stack);
    logger.error('Fatal error in backfill script:', err);
    process.exit(1);
  } finally {
    await mongoose.disconnect();
    console.log('🔌 Disconnected from MongoDB');
  }
})();
