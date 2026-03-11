import { Job, User, CandidateProfile } from '../models/index.js';
import { generateEmbeddingWithRetry, generateBatchEmbeddings } from '../utils/embedding.js';
import logger from '../utils/logger.js';
import * as pdfjsLib from 'pdfjs-dist/legacy/build/pdf.mjs';

/**
 * Split text into chunks for embedding generation
 * @param {string} text - Text to split
 * @param {number} maxChunkSize - Maximum size of each chunk (default: 1000)
 * @param {number} overlap - Overlap between chunks (default: 50)
 * @returns {string[]} Array of text chunks
 */
const splitTextIntoChunks = (text, maxChunkSize = 1000, overlap = 50) => {
  if (!text || text.length <= maxChunkSize) {
    return [text];
  }

  const chunks = [];
  let start = 0;

  while (start < text.length) {
    let end = start + maxChunkSize;

    // If this isn't the last chunk, try to break at a word boundary
    if (end < text.length) {
      const lastSpace = text.lastIndexOf(' ', end);
      if (lastSpace > start + maxChunkSize * 0.5) {
        end = lastSpace;
      }
    }

    chunks.push(text.slice(start, end).trim());
    start = end - overlap;
  }

  return chunks.filter(chunk => chunk.length > 0);
};

/**
 * Prepare text content for job embedding
 * @param {Object} job - Job document
 * @returns {string} Combined text
 */
const prepareTextForJob = (job) => {
  const textFields = [
    job.title,
    job.description,
    job.requirements,
    job.skills?.join(' '),
  ].filter(Boolean);
  return textFields.join(' ');
};

/**
 * Generate embeddings for a job and update the job document
 * @param {string} jobId - ID of the job
 * @returns {Promise<void>}
 */
export const generateJobEmbeddings = async (jobId) => {
  try {
    const job = await Job.findById(jobId);
    if (!job) {
      throw new Error(`Job not found: ${jobId}`);
    }

    // Combine job text fields for embedding
    const combinedText = prepareTextForJob(job);

    if (!combinedText.trim()) {
      logger.warn('No text content found for job embedding generation', { jobId });
      return;
    }

    // Split text into chunks
    const textChunks = splitTextIntoChunks(combinedText, 3000, 150);

    logger.info('Generating embeddings for job', {
      jobId,
      textLength: combinedText.length,
      chunkCount: textChunks.length
    });

    // Generate embeddings for each chunk
    const chunks = [];
    for (let i = 0; i < textChunks.length; i++) {
      const chunkText = textChunks[i];

      try {
        const embedding = await generateEmbeddingWithRetry(chunkText);

        chunks.push({
          jobId: jobId.toString(),
          chunkIndex: i,
          text: chunkText,
          embedding: embedding
        });

        logger.debug('Generated embedding for chunk', {
          jobId,
          chunkIndex: i,
          textLength: chunkText.length,
          embeddingDimension: embedding.length
        });

      } catch (error) {
        logger.error('Failed to generate embedding for chunk', {
          jobId,
          chunkIndex: i,
          error: error.message
        });
        // Continue with other chunks even if one fails
      }
    }

    if (chunks.length === 0) {
      logger.error('No embeddings generated for job', { jobId });
      return;
    }

    // Update job with embeddings
    await Job.findByIdAndUpdate(jobId, {
      chunks: chunks,
      embeddingsUpdatedAt: new Date()
    });

    logger.info('Successfully updated job with embeddings', {
      jobId,
      chunksGenerated: chunks.length,
      totalChunks: textChunks.length
    });

  } catch (error) {
    logger.error('Error generating job embeddings', {
      jobId,
      error: error.message
    });
    throw error;
  }
};

/**
 * Batch generate embeddings for multiple jobs
 * @param {string[]} jobIds - Array of job IDs
 * @param {number} batchSize - Number of jobs to process concurrently (default: 5)
 * @returns {Promise<{success: number, failed: number, errors: Array}>}
 */
export const batchGenerateJobEmbeddings = async (jobIds, batchSize = 50) => {
  const results = {
    success: 0,
    failed: 0,
    errors: []
  };

  logger.info('Starting batch embedding generation (v2)', {
    totalJobs: jobIds.length,
    batchSize
  });

  // Process jobs in chunks of batchSize (e.g., 50 or 100)
  for (let i = 0; i < jobIds.length; i += batchSize) {
    const batchIds = jobIds.slice(i, i + batchSize);

    try {
      // 1. Fetch Jobs
      const jobs = await Job.find({ _id: { $in: batchIds } });
      if (!jobs.length) continue;

      // 2. Prepare text chunks for all jobs in this batch
      const batchChunks = []; // { jobId, text, chunkIndex }

      for (const job of jobs) {
        try {
          const text = prepareTextForJob(job);
          if (!text.trim()) {
            // Handle no text case
            continue;
          }

          const chunks = splitTextIntoChunks(text, 3000, 150);
          chunks.forEach((chunkText, idx) => {
            batchChunks.push({
              jobId: job._id.toString(),
              text: chunkText,
              chunkIndex: idx
            });
          });
        } catch (err) {
          results.failed++;
          results.errors.push({ jobId: job._id, error: err.message });
        }
      }

      if (batchChunks.length === 0) continue;

      // 3. Generate embeddings via Batch API
      const texts = batchChunks.map(c => c.text);
      const embeddings = await generateBatchEmbeddings(texts);

      // 4. Map results back to jobs
      const jobUpdates = new Map(); // jobId -> chunks[]

      batchChunks.forEach((item, idx) => {
        const embedding = embeddings[idx];
        if (embedding) {
          if (!jobUpdates.has(item.jobId)) {
            jobUpdates.set(item.jobId, []);
          }
          jobUpdates.get(item.jobId).push({
            jobId: item.jobId,
            chunkIndex: item.chunkIndex,
            text: item.text,
            pageContent: item.text, // Backward compatibility for scripts
            embedding: embedding
          });
        }
      });

      // 5. Update Database concurrently
      const updatePromises = Array.from(jobUpdates.entries()).map(async ([jobId, chunks]) => {
        try {
          await Job.findByIdAndUpdate(jobId, {
            chunks: chunks,
            embeddingsUpdatedAt: new Date()
          });
          results.success++;
        } catch (error) {
          results.failed++;
          results.errors.push({ jobId, error: error.message });
        }
      });

      await Promise.all(updatePromises);

      logger.info('Completed batch', {
        batchStart: i + 1,
        count: updatePromises.length
      });

      // Small delay to be safe
      if (i + batchSize < jobIds.length) {
        await new Promise(resolve => setTimeout(resolve, 500));
      }

    } catch (batchError) {
      logger.error('Critical error in batch processing', batchError);
      results.errors.push({ error: batchError.message });
    }
  }

  logger.info('Batch embedding generation completed', results);
  return results;
};

/**
 * Regenerate embeddings for jobs that don't have them or are outdated
 * @param {number} daysOld - Regenerate embeddings older than this many days (default: 7)
 * @returns {Promise<{success: number, failed: number, errors: Array}>}
 */
export const regenerateOutdatedEmbeddings = async (daysOld = 7) => {
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - daysOld);

  // Find jobs that need embedding updates
  const jobsNeedingUpdate = await Job.find({
    status: 'ACTIVE',
    $or: [
      { embeddingsUpdatedAt: { $exists: false } },
      { embeddingsUpdatedAt: { $lt: cutoffDate } },
      { chunks: { $size: 0 } }
    ]
  }).select('_id').lean();

  const jobIds = jobsNeedingUpdate.map(job => job._id.toString());

  logger.info('Found jobs needing embedding updates', {
    count: jobIds.length,
    cutoffDate
  });

  if (jobIds.length === 0) {
    return { success: 0, failed: 0, errors: [] };
  }

  return await batchGenerateJobEmbeddings(jobIds);
};

/**
 * Extract text content from candidate profile
 * @param {Object} profile - CandidateProfile document
 * @returns {string} Combined text content
 */
const extractProfileText = (profile) => {
  const textParts = [];

  // Basic info
  if (profile.fullname) textParts.push(profile.fullname);
  if (profile.bio) textParts.push(profile.bio);

  // Skills
  if (profile.skills && profile.skills.length > 0) {
    const skillsText = profile.skills
      .map(s => `${s.name} ${s.level || ''} ${s.category || ''}`.trim())
      .join(' ');
    textParts.push(skillsText);
  }

  // Experiences
  if (profile.experiences && profile.experiences.length > 0) {
    const experiencesText = profile.experiences
      .map(e => {
        const parts = [
          e.position,
          e.company,
          e.description,
          e.responsibilities?.join(' '),
          e.achievements?.join(' ')
        ].filter(Boolean);
        return parts.join(' ');
      })
      .join(' ');
    textParts.push(experiencesText);
  }

  // Educations
  if (profile.educations && profile.educations.length > 0) {
    const educationsText = profile.educations
      .map(e => {
        const parts = [
          e.degree,
          e.major,
          e.school,
          e.description,
          e.honors
        ].filter(Boolean);
        return parts.join(' ');
      })
      .join(' ');
    textParts.push(educationsText);
  }

  // Certificates
  if (profile.certificates && profile.certificates.length > 0) {
    const certificatesText = profile.certificates
      .map(c => `${c.name} ${c.issuer}`)
      .join(' ');
    textParts.push(certificatesText);
  }

  // Projects
  if (profile.projects && profile.projects.length > 0) {
    const projectsText = profile.projects
      .map(p => {
        const parts = [
          p.name,
          p.description,
          p.technologies?.join(' ')
        ].filter(Boolean);
        return parts.join(' ');
      })
      .join(' ');
    textParts.push(projectsText);
  }

  // Preferred categories
  if (profile.preferredCategories && profile.preferredCategories.length > 0) {
    textParts.push(profile.preferredCategories.join(' '));
  }

  // Work preferences
  if (profile.workPreferences) {
    if (profile.workPreferences.workTypes && profile.workPreferences.workTypes.length > 0) {
      textParts.push(profile.workPreferences.workTypes.join(' '));
    }
    if (profile.workPreferences.contractTypes && profile.workPreferences.contractTypes.length > 0) {
      textParts.push(profile.workPreferences.contractTypes.join(' '));
    }
    if (profile.workPreferences.experienceLevel) {
      textParts.push(profile.workPreferences.experienceLevel);
    }
  }

  return textParts.filter(Boolean).join(' ').trim();
};

/**
 * Extract text from CV files using pdf-parse
 * @param {Array} cvs - Array of CV file objects
 * @returns {Promise<string>} Extracted text from CV files
 */
const extractCVText = async (cvs) => {
  if (!cvs || cvs.length === 0) {
    return '';
  }

  let fullText = '';

  for (const cv of cvs) {
    if (cv.fileUrl && cv.fileUrl.endsWith('.pdf')) {
      try {
        // Fetch the PDF from URL
        const response = await fetch(cv.fileUrl);
        if (!response.ok) {
          logger.warn(`Failed to fetch CV for text extraction: ${cv.fileUrl}`, { status: response.status });
          continue;
        }

        const arrayBuffer = await response.arrayBuffer();
        const uint8Array = new Uint8Array(arrayBuffer);

        // Parse PDF using pdfjs-dist
        const loadingTask = pdfjsLib.getDocument({ data: uint8Array });
        const pdf = await loadingTask.promise;
        
        for (let i = 1; i <= pdf.numPages; i++) {
          const page = await pdf.getPage(i);
          const textContent = await page.getTextContent();
          const pageText = textContent.items.map(item => item.str).join(' ');
          fullText += pageText + ' ';
        }
        
        logger.info(`Extracted text from CV: ${cv.fileName || cv.fileUrl}`);
      } catch (err) {
        logger.error(`Error extracting text from CV ${cv.fileUrl}`, { error: err.message });
      }
    }
  }

  return fullText.trim();
};

/**
 * Combine all text content for embedding
 * @param {string} profileText - Text from profile fields
 * @param {string} cvText - Text from CV files
 * @returns {string} Combined text content
 */
const combineTextContent = (profileText, cvText) => {
  const parts = [profileText, cvText].filter(text => text && text.trim().length > 0);
  return parts.join(' ').trim();
};

/**
 * Generate embedding for a candidate
 * @param {string} userId - User ID
 * @param {boolean} force - Force regeneration even if recently updated
 * @returns {Promise<void>}
 */
export const generateCandidateEmbedding = async (userId, force = false) => {
  try {
    const user = await User.findById(userId);
    if (!user || user.role !== 'candidate') {
      throw new Error(`Candidate user not found: ${userId}`);
    }


    const profile = await CandidateProfile.findOne({ userId }).lean();
    if (!profile) {
      logger.warn('No profile found for candidate', { userId });
      return;
    }

    // Extract text from profile
    const profileText = extractProfileText(profile);

    // Extract text from CV files
    const cvText = await extractCVText(profile.cvs);

    // Combine all text content
    const combinedText = combineTextContent(profileText, cvText);

    if (!combinedText.trim()) {
      logger.warn('No text content found for candidate embedding', { userId });
      return;
    }

    // Split text into chunks to avoid exceeding token limits
    const textChunks = splitTextIntoChunks(combinedText);

    logger.info('Generating embedding for candidate', {
      userId,
      textLength: combinedText.length,
      chunkCount: textChunks.length
    });

    // Generate embeddings for each chunk
    const chunks = [];
    const validEmbeddings = [];

    for (let i = 0; i < textChunks.length; i++) {
      const chunkText = textChunks[i];
      try {
        const embedding = await generateEmbeddingWithRetry(chunkText);

        chunks.push({
          chunkIndex: i,
          text: chunkText,
          embedding: embedding
        });

        validEmbeddings.push(embedding);

      } catch (error) {
        logger.error('Failed to generate embedding for candidate chunk', {
          userId,
          chunkIndex: i,
          error: error.message
        });
        // Continue with other chunks
      }
    }

    if (validEmbeddings.length === 0) {
      logger.error('No embeddings generated for candidate', { userId });
      return;
    }

    // Calculate average embedding for the main 'embedding' field
    // This maintains backward compatibility with vector search which expects a single vector
    const dim = validEmbeddings[0].length;
    const avgEmbedding = new Array(dim).fill(0);

    for (const emb of validEmbeddings) {
      for (let i = 0; i < dim; i++) {
        avgEmbedding[i] += emb[i];
      }
    }

    for (let i = 0; i < dim; i++) {
      avgEmbedding[i] /= validEmbeddings.length;
    }

    // Update user with average embedding and detailed chunks
    await User.findByIdAndUpdate(userId, {
      embedding: avgEmbedding,
      chunks: chunks,
      embeddingUpdatedAt: new Date()
    });

    logger.info('Successfully updated candidate with embedding', {
      userId,
      chunksGenerated: chunks.length,
      embeddingDimension: avgEmbedding.length
    });

  } catch (error) {
    logger.error('Error generating candidate embedding', {
      userId,
      error: error.message
    });
    throw error;
  }
};

/**
 * Batch generate embeddings for candidates
 * @param {string[]} userIds - Array of user IDs
 * @param {number} batchSize - Number to process concurrently (default: 3)
 * @returns {Promise<{success: number, failed: number, errors: Array}>}
 */
export const batchGenerateCandidateEmbeddings = async (userIds, batchSize = 50) => {
  const results = {
    success: 0,
    failed: 0,
    errors: []
  };

  logger.info('Starting batch candidate embedding generation (v2)', {
    totalCandidates: userIds.length,
    batchSize
  });

  for (let i = 0; i < userIds.length; i += batchSize) {
    const batchIds = userIds.slice(i, i + batchSize);

    try {
      // 1. Fetch Profiles
      const profiles = await CandidateProfile.find({ userId: { $in: batchIds } }).lean();

      // 2. Prepare chunks
      const batchChunks = [];

      for (const profile of profiles) {
        try {
          const profileText = extractProfileText(profile);
          const cvText = await extractCVText(profile.cvs);
          const combinedText = combineTextContent(profileText, cvText);

          if (!combinedText || !combinedText.trim()) continue;

          const chunks = splitTextIntoChunks(combinedText, 1000, 150);
          chunks.forEach((text, idx) => {
            batchChunks.push({
              userId: profile.userId.toString(),
              text,
              chunkIndex: idx
            });
          });
        } catch (err) {
          results.failed++;
          results.errors.push({ userId: profile.userId, error: err.message });
        }
      }

      if (batchChunks.length === 0) continue;

      // 3. Generate Embeddings (Batch API)
      const texts = batchChunks.map(c => c.text);
      const embeddings = await generateBatchEmbeddings(texts);

      // 4. Map & Average
      const userUpdates = new Map(); // userId -> { chunks: [], validEmbeddings: [] }

      batchChunks.forEach((item, idx) => {
        const embedding = embeddings[idx];
        if (embedding) {
          if (!userUpdates.has(item.userId)) {
            userUpdates.set(item.userId, { chunks: [], validEmbeddings: [] });
          }
          const update = userUpdates.get(item.userId);
          update.chunks.push({
            chunkIndex: item.chunkIndex,
            text: item.text,
            embedding: embedding
          });
          update.validEmbeddings.push(embedding);
        }
      });

      // 5. Update Database
      const updatePromises = Array.from(userUpdates.entries()).map(async ([userId, data]) => {
        if (data.validEmbeddings.length === 0) return;

        // Calculate average vector for backward compatibility / single search
        const dim = data.validEmbeddings[0].length;
        const avgEmbedding = new Array(dim).fill(0);

        for (const emb of data.validEmbeddings) {
          for (let k = 0; k < dim; k++) {
            avgEmbedding[k] += emb[k];
          }
        }

        for (let k = 0; k < dim; k++) {
          avgEmbedding[k] /= data.validEmbeddings.length;
        }

        try {
          await User.findByIdAndUpdate(userId, {
            embedding: avgEmbedding,
            chunks: data.chunks,
            embeddingUpdatedAt: new Date()
          });
          results.success++;
        } catch (err) {
          results.failed++;
          results.errors.push({ userId, error: err.message });
        }
      });

      await Promise.all(updatePromises);

      logger.info('Completed batch', {
        batchStart: i + 1,
        count: updatePromises.length
      });

      // Delay to respect rate limits
      // Delay to respect rate limits
      if (i + batchSize < userIds.length) {
        await new Promise(r => setTimeout(r, 500));
      }

    } catch (err) {
      logger.error('Batch error', err);
      results.errors.push({ error: err.message });
    }
  }

  logger.info('Batch candidate embedding generation completed', results);
  return results;
};
