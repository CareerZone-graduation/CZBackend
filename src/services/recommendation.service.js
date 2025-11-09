import { CandidateProfile, Job, JobRecommendation, User } from '../models/index.js';
import { NotFoundError, BadRequestError } from '../utils/AppError.js';
import logger from '../utils/logger.js';
import ngeohash from 'ngeohash';
import { RECOMMENDATION_SCORING, CATEGORY_LABELS } from '../constants/jobCategories.js';

/**
 * Calculate distance between two coordinates using Haversine formula
 * @param {number} lat1 - Latitude of point 1
 * @param {number} lon1 - Longitude of point 1
 * @param {number} lat2 - Latitude of point 2
 * @param {number} lon2 - Longitude of point 2
 * @returns {number} Distance in kilometers
 */
const calculateDistance = (lat1, lon1, lat2, lon2) => {
  const R = 6371; // Earth's radius in kilometers
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = 
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
};

/**
 * Filter jobs based on skills (exact and partial match)
 * @param {Array} candidateSkills - Array of candidate skill objects with name property
 * @param {Array} jobs - Array of job documents
 * @returns {Object} Object with matched jobs and reasons
 */
const filterBySkills = (candidateSkills, jobs) => {
  if (!candidateSkills || candidateSkills.length === 0) {
    return { matchedJobs: [], reasons: {} };
  }

  const candidateSkillNames = candidateSkills.map(s => s.name.toLowerCase().trim());
  const matchedJobs = [];
  const reasons = {};

  jobs.forEach(job => {
    if (!job.skills || job.skills.length === 0) {
      return;
    }

    const jobSkillNames = job.skills.map(s => s.toLowerCase().trim());
    const exactMatches = [];
    const partialMatches = [];

    // Check for exact matches
    candidateSkillNames.forEach(candidateSkill => {
      if (jobSkillNames.includes(candidateSkill)) {
        exactMatches.push(candidateSkill);
      } else {
        // Check for partial matches
        jobSkillNames.forEach(jobSkill => {
          if (jobSkill.includes(candidateSkill) || candidateSkill.includes(jobSkill)) {
            if (!partialMatches.includes(candidateSkill)) {
              partialMatches.push(candidateSkill);
            }
          }
        });
      }
    });

    const totalMatches = exactMatches.length + (partialMatches.length * 0.5);
    
    if (totalMatches > 0) {
      matchedJobs.push({
        job,
        skillScore: Math.min(100, (totalMatches / candidateSkillNames.length) * 100),
        exactMatches,
        partialMatches
      });

      reasons[job._id.toString()] = reasons[job._id.toString()] || [];
      
      if (exactMatches.length > 0) {
        reasons[job._id.toString()].push({
          type: 'skill_match',
          value: `Khớp ${exactMatches.length} kỹ năng: ${exactMatches.slice(0, 3).join(', ')}${exactMatches.length > 3 ? '...' : ''}`,
          weight: Math.min(40, exactMatches.length * 10)
        });
      }
      
      if (partialMatches.length > 0) {
        reasons[job._id.toString()].push({
          type: 'skill_match',
          value: `Liên quan ${partialMatches.length} kỹ năng: ${partialMatches.slice(0, 2).join(', ')}${partialMatches.length > 2 ? '...' : ''}`,
          weight: Math.min(20, partialMatches.length * 5)
        });
      }
    }
  });

  return { matchedJobs, reasons };
};

/**
 * Filter jobs based on preferred categories (ngành nghề)
 * @param {Array} preferredCategories - Array of preferred category strings
 * @param {Array} jobs - Array of job documents
 * @returns {Object} Object with matched jobs and reasons
 */
const filterByCategory = (preferredCategories, jobs) => {
  if (!preferredCategories || preferredCategories.length === 0) {
    return { matchedJobs: [], reasons: {} };
  }

  const matchedJobs = [];
  const reasons = {};

  jobs.forEach(job => {
    if (!job.category) {
      return;
    }

    // Check if job category matches any of user's preferred categories
    if (preferredCategories.includes(job.category)) {
      const categoryScore = RECOMMENDATION_SCORING.CATEGORY_MATCH;

      matchedJobs.push({
        job,
        categoryScore
      });

      reasons[job._id.toString()] = reasons[job._id.toString()] || [];
      reasons[job._id.toString()].push({
        type: 'category_match',
        value: `Đúng ngành nghề: ${getCategoryLabel(job.category)}`,
        weight: categoryScore
      });
    }
  });

  return { matchedJobs, reasons };
};

/**
 * Get Vietnamese label for category
 * @param {String} category - Category code
 * @returns {String} Vietnamese label
 */
const getCategoryLabel = (category) => {
  return CATEGORY_LABELS[category] || category;
};

/**
 * Filter jobs based on location with distance calculation
 * @param {Array} preferredLocations - Array of preferred location objects
 * @param {Array} jobs - Array of job documents
 * @param {number} maxDistance - Maximum distance in kilometers (default: 50km)
 * @returns {Object} Object with matched jobs and reasons
 */
const filterByLocation = (preferredLocations, jobs, maxDistance = 50) => {
  if (!preferredLocations || preferredLocations.length === 0) {
    return { matchedJobs: [], reasons: {} };
  }

  const matchedJobs = [];
  const reasons = {};

  jobs.forEach(job => {
    if (!job.location) {
      return;
    }

    let bestMatch = null;
    let minDistance = Infinity;

    preferredLocations.forEach(prefLocation => {
      // Check province match
      if (job.location.province === prefLocation.province) {
        let locationScore = 30; // Base score for province match
        let matchDetails = `Cùng tỉnh/thành: ${prefLocation.province}`;

        // Check district match
        if (prefLocation.district && job.location.district === prefLocation.district) {
          locationScore += 20;
          matchDetails = `Cùng quận/huyện: ${prefLocation.district}`;
        }

        // Calculate distance if coordinates are available
        if (
          prefLocation.coordinates?.coordinates &&
          job.location.coordinates?.coordinates &&
          prefLocation.coordinates.coordinates.length === 2 &&
          job.location.coordinates.coordinates.length === 2
        ) {
          const distance = calculateDistance(
            prefLocation.coordinates.coordinates[1], // latitude
            prefLocation.coordinates.coordinates[0], // longitude
            job.location.coordinates.coordinates[1],
            job.location.coordinates.coordinates[0]
          );

          if (distance <= maxDistance) {
            // Add distance-based score (closer = higher score)
            const distanceScore = Math.max(0, 30 * (1 - distance / maxDistance));
            locationScore += distanceScore;
            matchDetails = `Cách ${distance.toFixed(1)}km từ ${prefLocation.province}`;

            if (distance < minDistance) {
              minDistance = distance;
            }
          }
        }

        if (!bestMatch || locationScore > bestMatch.score) {
          bestMatch = {
            score: locationScore,
            details: matchDetails,
            distance: minDistance !== Infinity ? minDistance : null
          };
        }
      }
    });

    if (bestMatch) {
      matchedJobs.push({
        job,
        locationScore: bestMatch.score,
        distance: bestMatch.distance
      });

      reasons[job._id.toString()] = reasons[job._id.toString()] || [];
      reasons[job._id.toString()].push({
        type: 'location_match',
        value: bestMatch.details,
        weight: Math.round(bestMatch.score)
      });
    }
  });

  return { matchedJobs, reasons };
};

/**
 * Filter jobs based on salary range
 * @param {Object} expectedSalary - Expected salary object with min, max, currency
 * @param {Array} jobs - Array of job documents
 * @returns {Object} Object with matched jobs and reasons
 */
const filterBySalary = (expectedSalary, jobs) => {
  if (!expectedSalary || (!expectedSalary.min && !expectedSalary.max)) {
    return { matchedJobs: [], reasons: {} };
  }

  const matchedJobs = [];
  const reasons = {};

  jobs.forEach(job => {
    if (!job.minSalary && !job.maxSalary) {
      return;
    }

    const jobMinSalary = job.minSalary ? parseFloat(job.minSalary) : 0;
    const jobMaxSalary = job.maxSalary ? parseFloat(job.maxSalary) : Infinity;
    const candidateMin = expectedSalary.min || 0;
    const candidateMax = expectedSalary.max || Infinity;

    // Check if there's any overlap between candidate's expected range and job's salary range
    const hasOverlap = !(jobMaxSalary < candidateMin || jobMinSalary > candidateMax);

    if (hasOverlap) {
      let salaryScore = 20; // Base score for salary overlap
      let matchDetails = 'Mức lương phù hợp';

      // Calculate how well the ranges match
      if (jobMinSalary >= candidateMin && jobMaxSalary <= candidateMax) {
        // Job salary is within candidate's expected range
        salaryScore = 30;
        matchDetails = 'Mức lương trong khoảng mong muốn';
      } else if (jobMaxSalary >= candidateMax) {
        // Job offers higher salary than expected
        salaryScore = 25;
        matchDetails = 'Mức lương cao hơn mong đợi';
      }

      matchedJobs.push({
        job,
        salaryScore
      });

      reasons[job._id.toString()] = reasons[job._id.toString()] || [];
      reasons[job._id.toString()].push({
        type: 'salary_match',
        value: matchDetails,
        weight: salaryScore
      });
    }
  });

  return { matchedJobs, reasons };
};

/**
 * Filter jobs based on work type and contract type
 * @param {Object} workPreferences - Work preferences object
 * @param {Array} jobs - Array of job documents
 * @returns {Object} Object with matched jobs and reasons
 */
const filterByWorkPreferences = (workPreferences, jobs) => {
  if (!workPreferences) {
    return { matchedJobs: [], reasons: {} };
  }

  const matchedJobs = [];
  const reasons = {};

  jobs.forEach(job => {
    let workTypeMatch = false;
    let contractTypeMatch = false;
    let experienceMatch = false;
    let totalScore = 0;

    // Check work type match (ON_SITE, REMOTE, HYBRID)
    if (workPreferences.workTypes && workPreferences.workTypes.length > 0) {
      if (workPreferences.workTypes.includes(job.workType)) {
        workTypeMatch = true;
        totalScore += 15;
        
        reasons[job._id.toString()] = reasons[job._id.toString()] || [];
        reasons[job._id.toString()].push({
          type: 'work_type_match',
          value: `Hình thức làm việc: ${job.workType === 'ON_SITE' ? 'Tại văn phòng' : job.workType === 'REMOTE' ? 'Từ xa' : 'Hybrid'}`,
          weight: 15
        });
      }
    }

    // Check contract type match (FULL_TIME, PART_TIME, etc.)
    if (workPreferences.contractTypes && workPreferences.contractTypes.length > 0) {
      if (workPreferences.contractTypes.includes(job.type)) {
        contractTypeMatch = true;
        totalScore += 15;
        
        reasons[job._id.toString()] = reasons[job._id.toString()] || [];
        reasons[job._id.toString()].push({
          type: 'contract_type_match',
          value: `Loại hợp đồng: ${job.type}`,
          weight: 15
        });
      }
    }

    // Check experience level match
    if (workPreferences.experienceLevel && job.experience) {
      if (workPreferences.experienceLevel === job.experience) {
        experienceMatch = true;
        totalScore += 10;
        
        reasons[job._id.toString()] = reasons[job._id.toString()] || [];
        reasons[job._id.toString()].push({
          type: 'experience_match',
          value: `Mức kinh nghiệm phù hợp: ${job.experience}`,
          weight: 10
        });
      }
    }

    if (workTypeMatch || contractTypeMatch || experienceMatch) {
      matchedJobs.push({
        job,
        workPreferenceScore: totalScore
      });
    }
  });

  return { matchedJobs, reasons };
};

/**
 * Generate job recommendations for a candidate
 * @param {string} userId - User ID
 * @param {Object} options - Filtering options
 * @returns {Promise<Object>} Recommendations with metadata
 */
export const generateRecommendations = async (userId, options = {}) => {
  logger.info('Generating job recommendations', { userId, options });

  // Get candidate profile
  const profile = await CandidateProfile.findOne({ userId }).lean();
  if (!profile) {
    throw new NotFoundError('Không tìm thấy hồ sơ ứng viên.');
  }

  // Check profile completeness
  const completeness = profile.profileCompleteness?.percentage || 0;
  if (completeness < 60) {
    throw new BadRequestError('Hồ sơ chưa đủ 60% để tạo gợi ý việc làm. Vui lòng hoàn thiện hồ sơ.');
  }

  // Build optimized query with $or conditions for matching criteria
  const matchQuery = {
    status: 'ACTIVE',
    deadline: { $gte: new Date() },
    $or: []
  };

  // Add category filter to query
  if (profile.preferredCategories && profile.preferredCategories.length > 0) {
    matchQuery.$or.push({ category: { $in: profile.preferredCategories } });
  }

  // Add skills filter to query
  if (profile.skills && profile.skills.length > 0) {
    const skillNames = profile.skills.map(s => s.name);
    matchQuery.$or.push({ 
      skills: { 
        $elemMatch: { 
          name: { $in: skillNames } 
        } 
      } 
    });
  }

  // Add location filter to query
  if (profile.preferredLocations && profile.preferredLocations.length > 0) {
    const locationConditions = profile.preferredLocations.map(loc => {
      const condition = { 'location.province': loc.province };
      if (loc.district) {
        condition['location.district'] = loc.district;
      }
      return condition;
    });
    matchQuery.$or.push({ $or: locationConditions });
  }

  // Add work type filter to query
  if (profile.workPreferences?.workTypes && profile.workPreferences.workTypes.length > 0) {
    matchQuery.$or.push({ workType: { $in: profile.workPreferences.workTypes } });
  }

  // Add contract type filter to query
  if (profile.workPreferences?.contractTypes && profile.workPreferences.contractTypes.length > 0) {
    matchQuery.$or.push({ type: { $in: profile.workPreferences.contractTypes } });
  }

  // If no criteria specified, fall back to all active jobs
  if (matchQuery.$or.length === 0) {
    delete matchQuery.$or;
  }

  logger.info('Built optimized query', { 
    userId,
    queryConditions: matchQuery.$or?.length || 0,
    hasCategories: !!profile.preferredCategories?.length,
    hasSkills: !!profile.skills?.length,
    hasLocations: !!profile.preferredLocations?.length
  });

  // Get matching jobs with optimized query
  const allJobs = await Job.find(matchQuery)
    .select('title description requirements location address type workType minSalary maxSalary experience category skills deadline recruiterProfileId')
    .populate('recruiterProfileId', 'fullname company')
    .lean();

  if (allJobs.length === 0) {
    logger.info('No matching jobs found for recommendations');
    return {
      recommendations: [],
      total: 0,
      message: 'Hiện tại chưa có việc làm phù hợp. Vui lòng thử lại sau.'
    };
  }

  logger.info(`Found ${allJobs.length} matching jobs after database filtering`);

  // Apply detailed scoring filters (still need these for scoring calculation)
  const categoryFilter = filterByCategory(profile.preferredCategories, allJobs);
  const skillFilter = filterBySkills(profile.skills, allJobs);
  const locationFilter = filterByLocation(profile.preferredLocations, allJobs, options.maxDistance);
  const salaryFilter = filterBySalary(profile.expectedSalary, allJobs);
  const workPrefFilter = filterByWorkPreferences(profile.workPreferences, allJobs);

  // Combine all filters and calculate final scores
  const jobScores = new Map();
  const allReasons = {};

  // Merge all matched jobs
  const processMatches = (matches, scoreKey) => {
    matches.forEach(match => {
      const jobId = match.job._id.toString();
      if (!jobScores.has(jobId)) {
        jobScores.set(jobId, {
          job: match.job,
          totalScore: 0,
          components: {}
        });
      }
      const current = jobScores.get(jobId);
      current.totalScore += match[scoreKey] || 0;
      current.components[scoreKey] = match[scoreKey] || 0;
    });
  };

  processMatches(categoryFilter.matchedJobs, 'categoryScore');
  processMatches(skillFilter.matchedJobs, 'skillScore');
  processMatches(locationFilter.matchedJobs, 'locationScore');
  processMatches(salaryFilter.matchedJobs, 'salaryScore');
  processMatches(workPrefFilter.matchedJobs, 'workPreferenceScore');

  // Merge all reasons
  Object.assign(allReasons, categoryFilter.reasons, skillFilter.reasons, locationFilter.reasons, salaryFilter.reasons, workPrefFilter.reasons);

  // Convert to array and sort by score
  const recommendations = Array.from(jobScores.values())
    .map(item => ({
      job: item.job,
      score: Math.min(100, Math.round(item.totalScore)),
      reasons: allReasons[item.job._id.toString()] || [],
      components: item.components
    }))
    .sort((a, b) => b.score - a.score);

  logger.info(`Generated ${recommendations.length} recommendations`, {
    userId,
    totalJobs: allJobs.length,
    matchedJobs: recommendations.length,
    avgScore: recommendations.length > 0 
      ? Math.round(recommendations.reduce((sum, r) => sum + r.score, 0) / recommendations.length)
      : 0
  });

  // Save only top recommendations to database (limit to reduce storage)
  const MAX_RECOMMENDATIONS_TO_SAVE = 100; // Chỉ lưu top 100 recommendations
  const topRecommendations = recommendations.slice(0, MAX_RECOMMENDATIONS_TO_SAVE);

  if (topRecommendations.length > 0) {
    // Delete old recommendations for this candidate first
    await JobRecommendation.deleteMany({ candidateId: profile._id });
    
    // Insert new recommendations
    const bulkOps = topRecommendations.map(rec => ({
      insertOne: {
        document: {
          candidateId: profile._id,
          jobId: rec.job._id,
          score: rec.score,
          reasons: rec.reasons,
          generatedAt: new Date()
        }
      }
    }));

    await JobRecommendation.bulkWrite(bulkOps);
    logger.info(`Saved top ${topRecommendations.length} recommendations to database (out of ${recommendations.length} total)`);
  }

  return {
    recommendations: recommendations.slice(0, options.limit || 20),
    total: recommendations.length,
    profileCompleteness: completeness
  };
};

/**
 * Get saved recommendations for a candidate with pagination
 * @param {string} userId - User ID
 * @param {Object} options - Query options (page, limit, refresh)
 * @returns {Promise<Object>} Paginated recommendations
 */
export const getRecommendations = async (userId, options = {}) => {
  logger.info('Getting job recommendations', { userId, options });

  // Get candidate profile
  const profile = await CandidateProfile.findOne({ userId }).lean();
  if (!profile) {
    throw new NotFoundError('Không tìm thấy hồ sơ ứng viên.');
  }

  // If refresh is requested, regenerate recommendations
  if (options.refresh === true || options.refresh === 'true') {
    logger.info('Refreshing recommendations', { userId });
    await generateRecommendations(userId, options);
  }

  // Pagination
  const page = parseInt(options.page) || 1;
  const limit = Math.min(parseInt(options.limit) || 20, 50);
  const skip = (page - 1) * limit;

  // First, get all recommendations with populated jobs to filter correctly
  const allRecommendations = await JobRecommendation.find({ candidateId: profile._id })
    .sort({ score: -1, generatedAt: -1 })
    .populate({
      path: 'jobId',
      select: 'title description location address type workType minSalary maxSalary experience category skills deadline recruiterProfileId status',
      populate: {
        path: 'recruiterProfileId',
        select: 'fullname company'
      }
    })
    .lean();

  // Filter out recommendations where job no longer exists or is inactive
  const validRecommendations = allRecommendations.filter(rec => 
    rec.jobId && 
    rec.jobId.status === 'ACTIVE' &&
    new Date(rec.jobId.deadline) >= new Date()
  );

  // Apply pagination to valid recommendations
  const totalValidCount = validRecommendations.length;
  const paginatedRecommendations = validRecommendations.slice(skip, skip + limit);

  logger.info('Retrieved recommendations', {
    userId,
    totalInDb: allRecommendations.length,
    totalValid: totalValidCount,
    page,
    returned: paginatedRecommendations.length
  });

  return {
    jobs: paginatedRecommendations.map(rec => ({
      jobId: rec.jobId,
      score: rec.score,
      reasons: rec.reasons,
      generatedAt: rec.generatedAt
    })),
    pagination: {
      currentPage: page,
      totalPages: Math.ceil(totalValidCount / limit),
      totalItems: totalValidCount,
      limit,
      hasMore: page * limit < totalValidCount
    },
    lastUpdated: paginatedRecommendations.length > 0 
      ? paginatedRecommendations[0].generatedAt 
      : null
  };
};

// ============================================================================
// AI-POWERED VECTOR SEARCH RECOMMENDATION FUNCTIONS
// ============================================================================

/**
 * Calculate average embedding from multiple vectors
 * @param {Array<Array<number>>} embeddings - Array of embedding vectors
 * @returns {Array<number>} Average embedding vector
 */
const calculateAverageEmbedding = (embeddings) => {
  if (!embeddings || embeddings.length === 0) {
    throw new Error('No embeddings provided for averaging');
  }

  const dim = embeddings[0].length;
  const avg = new Array(dim).fill(0);
  
  for (const emb of embeddings) {
    for (let i = 0; i < dim; i++) {
      avg[i] += emb[i];
    }
  }
  
  for (let i = 0; i < dim; i++) {
    avg[i] /= embeddings.length;
  }
  
  return avg;
};

/**
 * Extract matched skills between job and candidate (case-insensitive)
 * @param {Array<string>} jobSkills - Array of job skill names
 * @param {Array<Object>} candidateSkills - Array of candidate skill objects with name property
 * @returns {Array<string>} Array of matched skill names
 */
const extractMatchedSkills = (jobSkills, candidateSkills) => {
  if (!jobSkills || !candidateSkills || jobSkills.length === 0 || candidateSkills.length === 0) {
    return [];
  }

  const jobSkillsLower = jobSkills.map(s => s.toLowerCase().trim());
  const matched = candidateSkills
    .filter(cs => jobSkillsLower.includes(cs.name.toLowerCase().trim()))
    .map(cs => cs.name);
  
  return matched.slice(0, 5); // Return max 5 matched skills
};

/**
 * Calculate total years of experience from experience array
 * @param {Array<Object>} experiences - Array of experience objects
 * @returns {number} Total years of experience
 */
const calculateExperienceYears = (experiences) => {
  if (!experiences || experiences.length === 0) {
    return 0;
  }

  let totalMonths = 0;
  
  for (const exp of experiences) {
    try {
      const start = new Date(exp.startDate);
      const end = exp.endDate ? new Date(exp.endDate) : new Date();
      
      if (isNaN(start.getTime())) {
        continue; // Skip invalid dates
      }
      
      const months = (end.getFullYear() - start.getFullYear()) * 12 + 
                     (end.getMonth() - start.getMonth());
      totalMonths += Math.max(0, months);
    } catch (error) {
      logger.warn('Error calculating experience duration', { 
        experience: exp, 
        error: error.message 
      });
    }
  }
  
  return Math.round(totalMonths / 12);
};

/**
 * Get current position from latest experience
 * @param {Array<Object>} experiences - Array of experience objects
 * @returns {string} Current position or 'N/A'
 */
const getCurrentPosition = (experiences) => {
  if (!experiences || experiences.length === 0) {
    return 'N/A';
  }

  // Find current job (isCurrentJob = true) or most recent experience
  const currentJob = experiences.find(exp => exp.isCurrentJob);
  if (currentJob) {
    return currentJob.position;
  }

  // If no current job marked, return the first experience (assuming sorted by date)
  return experiences[0]?.position || 'N/A';
};

/**
 * Build MongoDB Atlas Vector Search aggregation pipeline
 * @param {Array<number>} queryVector - Query embedding vector
 * @param {Object} options - Search options
 * @returns {Array} MongoDB aggregation pipeline
 */
const buildVectorSearchPipeline = (queryVector, options = {}) => {
  const {
    numCandidates = 200,
    limit = 100,
    minScore = 0.5,
    skip = 0
  } = options;

  return [
    {
      $vectorSearch: {
        index: 'default',
        path: 'embedding',
        queryVector: queryVector,
        numCandidates: numCandidates,
        limit: limit,
        filter: {
          role: { $eq: 'candidate' },
          allowSearch: { $eq: true }
        }
      }
    },
    {
      $addFields: {
        similarityScore: { $meta: 'vectorSearchScore' }
      }
    },
    {
      $match: {
        similarityScore: { $gte: minScore }
      }
    },
    {
      $skip: skip
    },
    {
      $limit: limit
    },
    {
      $project: {
        _id: 1,
        similarityScore: 1
      }
    }
  ];
};

/**
 * Get candidate suggestions using MongoDB Atlas Vector Search
 * @param {string} jobId - Job ID
 * @param {Object} options - Query options
 * @returns {Promise<Object>} Suggestion results with candidates and pagination
 */
export const getCandidateSuggestions = async (jobId, options = {}) => {
  const { page = 1, limit = 10, minScore = 0.5 } = options;
  const skip = (page - 1) * limit;

  logger.info('Getting candidate suggestions via vector search', { 
    jobId, 
    page, 
    limit, 
    minScore 
  });

  // Fetch job and validate it has embeddings
  const job = await Job.findById(jobId).lean();
  if (!job) {
    throw new NotFoundError('Không tìm thấy tin tuyển dụng');
  }

  if (!job.chunks || job.chunks.length === 0) {
    throw new BadRequestError('Tin tuyển dụng chưa được xử lý. Vui lòng thử lại sau vài phút.');
  }

  // Calculate average embedding vector from job chunks
  const jobEmbeddings = job.chunks
    .filter(chunk => chunk.embedding && chunk.embedding.length > 0)
    .map(chunk => chunk.embedding);

  if (jobEmbeddings.length === 0) {
    throw new BadRequestError('Tin tuyển dụng không có embedding hợp lệ');
  }

  const avgEmbedding = calculateAverageEmbedding(jobEmbeddings);

  logger.info('Calculated average embedding for job', { 
    jobId, 
    chunkCount: jobEmbeddings.length,
    embeddingDimension: avgEmbedding.length 
  });

  // Build and execute MongoDB Atlas Vector Search pipeline
  const pipeline = buildVectorSearchPipeline(avgEmbedding, {
    numCandidates: 200,
    limit: 100,
    minScore: minScore,
    skip: skip
  });

  const matchedUsers = await User.aggregate(pipeline);

  logger.info('Vector search completed', { 
    jobId, 
    matchedCount: matchedUsers.length 
  });

  if (matchedUsers.length === 0) {
    return {
      data: {
        candidates: [],
        pagination: {
          currentPage: page,
          totalPages: 0,
          totalItems: 0,
          limit,
          hasNextPage: false,
          hasPrevPage: false
        },
        jobInfo: {
          jobId,
          title: job.title,
          hasEmbeddings: true
        }
      }
    };
  }

  // Fetch candidate profiles for matched users
  const userIds = matchedUsers.map(u => u._id);
  const profiles = await CandidateProfile.find({ userId: { $in: userIds } })
    .select('userId fullname avatar bio skills experiences preferredCategories')
    .lean();

  logger.info('Fetched candidate profiles', { 
    jobId, 
    profileCount: profiles.length 
  });

  // Create lookup maps for efficient data access
  const profileMap = new Map(profiles.map(p => [p.userId.toString(), p]));
  const scoreMap = new Map(matchedUsers.map(u => [u._id.toString(), u.similarityScore]));

  // Enrich results with profile data and calculated fields
  const candidates = matchedUsers
    .map(user => {
      const profile = profileMap.get(user._id.toString());
      if (!profile) {
        logger.warn('Profile not found for matched user', { userId: user._id.toString() });
        return null;
      }

      const currentPosition = getCurrentPosition(profile.experiences || []);
      const experienceYears = calculateExperienceYears(profile.experiences || []);
      const matchedSkills = extractMatchedSkills(job.skills || [], profile.skills || []);
      const similarityScore = scoreMap.get(user._id.toString());

      return {
        userId: user._id.toString(),
        candidateProfileId: profile._id.toString(),
        fullname: profile.fullname,
        avatar: profile.avatar,
        bio: profile.bio,
        currentPosition,
        skills: profile.skills?.slice(0, 5) || [],
        similarityScore: similarityScore,
        similarityPercentage: Math.round(similarityScore * 100),
        matchedSkills,
        experienceYears
      };
    })
    .filter(Boolean); // Remove null entries

  // Calculate total count for pagination
  const totalCount = candidates.length;

  logger.info('Enriched candidate suggestions', { 
    jobId, 
    candidateCount: candidates.length 
  });

  return {
    data: {
      candidates,
      pagination: {
        currentPage: page,
        totalPages: Math.ceil(totalCount / limit),
        totalItems: totalCount,
        limit,
        hasNextPage: page * limit < totalCount,
        hasPrevPage: page > 1
      },
      jobInfo: {
        jobId,
        title: job.title,
        hasEmbeddings: true
      }
    }
  };
};
