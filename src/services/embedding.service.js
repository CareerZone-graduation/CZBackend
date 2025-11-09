import { Job, User, CandidateProfile } from '../models/index.js';
import { generateEmbeddingWithRetry } from '../utils/embedding.js';
import logger from '../utils/logger.js';

/**
 * Split text into chunks for embedding generation
 * @param {string} text - Text to split
 * @param {number} maxChunkSize - Maximum size of each chunk (default: 500)
 * @param {number} overlap - Overlap between chunks (default: 50)
 * @returns {string[]} Array of text chunks
 */
const splitTextIntoChunks = (text, maxChunkSize = 500, overlap = 50) => {
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
    const textFields = [
      job.title,
      job.description,
      job.requirements,
      job.benefits,
      job.skills?.join(' '),
      job.category,
      job.area
    ].filter(Boolean);

    const combinedText = textFields.join(' ');
    
    if (!combinedText.trim()) {
      logger.warn('No text content found for job embedding generation', { jobId });
      return;
    }

    // Split text into chunks
    const textChunks = splitTextIntoChunks(combinedText);
    
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
export const batchGenerateJobEmbeddings = async (jobIds, batchSize = 5) => {
  const results = {
    success: 0,
    failed: 0,
    errors: []
  };

  logger.info('Starting batch embedding generation', { 
    totalJobs: jobIds.length, 
    batchSize 
  });

  // Process jobs in batches to avoid overwhelming the API
  for (let i = 0; i < jobIds.length; i += batchSize) {
    const batch = jobIds.slice(i, i + batchSize);
    
    const batchPromises = batch.map(async (jobId) => {
      try {
        await generateJobEmbeddings(jobId);
        results.success++;
        return { jobId, success: true };
      } catch (error) {
        results.failed++;
        results.errors.push({ jobId, error: error.message });
        return { jobId, success: false, error: error.message };
      }
    });

    await Promise.all(batchPromises);
    
    logger.info('Completed batch', { 
      batchStart: i + 1, 
      batchEnd: Math.min(i + batchSize, jobIds.length),
      totalJobs: jobIds.length 
    });

    // Add a small delay between batches to be respectful to the API
    if (i + batchSize < jobIds.length) {
      await new Promise(resolve => setTimeout(resolve, 1000));
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
 * Extract text from CV files using Erax AI
 * @param {Array} cvs - Array of CV file objects
 * @returns {Promise<string>} Extracted text from CV files
 */
const extractCVText = async (cvs) => {
  // TODO: Implement CV text extraction using Erax AI
  // For now, return empty string as placeholder
  // This will be implemented when Erax AI integration is available
  
  if (!cvs || cvs.length === 0) {
    return '';
  }

  logger.info('CV text extraction not yet implemented', { 
    cvCount: cvs.length 
  });
  
  return '';
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

    logger.info('Generating embedding for candidate', { 
      userId, 
      textLength: combinedText.length 
    });

    // Generate embedding with retry logic
    const embedding = await generateEmbeddingWithRetry(combinedText);

    // Update user with embedding
    await User.findByIdAndUpdate(userId, {
      embedding: embedding,
      embeddingUpdatedAt: new Date()
    });

    logger.info('Successfully updated candidate with embedding', { 
      userId,
      embeddingDimension: embedding.length 
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
export const batchGenerateCandidateEmbeddings = async (userIds, batchSize = 3) => {
  const results = {
    success: 0,
    failed: 0,
    errors: []
  };

  logger.info('Starting batch candidate embedding generation', { 
    totalCandidates: userIds.length, 
    batchSize 
  });

  for (let i = 0; i < userIds.length; i += batchSize) {
    const batch = userIds.slice(i, i + batchSize);
    
    const batchPromises = batch.map(async (userId) => {
      try {
        await generateCandidateEmbedding(userId);
        results.success++;
        return { userId, success: true };
      } catch (error) {
        results.failed++;
        results.errors.push({ userId, error: error.message });
        return { userId, success: false, error: error.message };
      }
    });

    await Promise.all(batchPromises);
    
    logger.info('Completed batch', { 
      batchStart: i + 1, 
      batchEnd: Math.min(i + batchSize, userIds.length),
      totalCandidates: userIds.length 
    });

    // Add delay between batches to respect API limits
    if (i + batchSize < userIds.length) {
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
  }

  logger.info('Batch candidate embedding generation completed', results);
  return results;
};
