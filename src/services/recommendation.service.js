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
      const candidateExpLevels = Array.isArray(workPreferences.experienceLevel)
        ? workPreferences.experienceLevel
        : [workPreferences.experienceLevel];

      if (candidateExpLevels.includes(job.experience)) {
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
 * Calculate cosine similarity between two vectors
 * @param {number[]} vecA - Vector A
 * @param {number[]} vecB - Vector B
 * @returns {number} Cosine similarity (-1 to 1)
 */
const cosineSimilarity = (vecA, vecB) => {
  if (!vecA || !vecB || vecA.length !== vecB.length) return 0;
  let dotProduct = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < vecA.length; i++) {
    dotProduct += vecA[i] * vecB[i];
    normA += vecA[i] * vecA[i];
    normB += vecB[i] * vecB[i];
  }
  return (normA === 0 || normB === 0) ? 0 : dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
};


// Giai đoạn 1: Lọc thô (Vector Search trên DB)
// Dòng code:
// const avgEmbedding = calculateAverageEmbedding(jobEmbeddings); // Nếu Job có 1 chunk thì đây chính là vector của chunk đó
// // ...
// $vectorSearch: {
//     path: 'embedding', // Search vào field embedding chính của User
//     queryVector: queryVector, // Vector của Job
//     // ...
// }
// Cơ chế: Nó lấy vector của Job so sánh với vector embedding (thường là vector đại diện/trung bình) của Candidate trong Database.

// Mục đích: Lọc ra 100 ứng viên có "hồ sơ tổng quan" giống với Job nhất.

// Giai đoạn 2: Tinh chỉnh (Re-ranking In-Memory)
// Đây là phần quan trọng xử lý việc Candidate có nhiều chunk.

// JavaScript

// matchedUsers.forEach(user => {
//     // ...
//     if (user.chunks && user.chunks.length > 0) {
//        for (const chunk of user.chunks) {
//           // So sánh Job Vector với TỪNG Chunk của Candidate
//           const score = cosineSimilarity(avgEmbedding, chunk.embedding); 
//           if (score > maxChunkScore) {
//              bestScore = maxChunkScore; // Lấy điểm của chunk cao nhất (MaxSim)
//           }
//        }
//     }
//     user.similarityScore = bestScore; // Cập nhật điểm cuối cùng
// });
// matchedUsers.sort(...) // Sắp xếp lại
// Cơ chế: Với danh sách 100 người đã tìm được, code chạy vòng lặp so sánh Job với từng chunk chi tiết (Kinh nghiệm, Kỹ năng...) của ứng viên.

// Logic: Sử dụng thuật toán Max Score (như mình đã đề cập ở câu trả lời trước). Nếu ứng viên có 1 chunk (ví dụ: "Kinh nghiệm làm ReactJS") khớp cực tốt với Job, điểm số sẽ được đẩy lên cao nhất.
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
      $project: {
        _id: 1,
        similarityScore: 1,
        chunks: 1 // Include chunks for re-ranking
      }
    },
    // Don't apply skip/limit here yet if we want to re-rank everything returned
    // But for performance on large sets, maybe we only re-rank the top K?
    // Current logic applies sort AFTER vector search which returns 'limit' items.
    // So we are re-ranking the top 'limit' items found by Average vector.
    // Ideally we should fetch more, re-rank, then slice.
    // Let's stick to simple re-ranking of the retrieved set for now.
    {
      $skip: skip
    },
    {
      $limit: limit
    }
  ];
};

/**
 * Get candidate suggestions using manual matching (thủ công)
 * Matches based on: skills, category, location, experience level
 * @param {string} jobId - Job ID
 * @param {Object} options - Query options
 * @returns {Promise<Object>} Suggestion results with candidates and pagination
 */
export const getCandidateSuggestions = async (jobId, options = {}) => {
  const { page = 1, limit = 10, minScore = 0.3 } = options;
  const skip = (page - 1) * limit;

  logger.info('Getting candidate suggestions via manual matching', {
    jobId,
    page,
    limit,
    minScore
  });

  // Fetch job
  const job = await Job.findById(jobId).lean();
  if (!job) {
    throw new NotFoundError('Không tìm thấy tin tuyển dụng');
  }

  // Build query conditions based on job criteria
  const candidateQuery = {};
  const orConditions = [];

  // Match by preferred categories
  if (job.category) {
    orConditions.push({ preferredCategories: job.category });
  }

  // Match by preferred locations (province)
  if (job.location?.province) {
    orConditions.push({ 'preferredLocations.province': job.location.province });
  }

  // Match by work preferences (experience level)
  if (job.experience) {
    orConditions.push({ 'workPreferences.experienceLevel': job.experience });
  }

  // Match by work type
  if (job.workType) {
    orConditions.push({ 'workPreferences.workTypes': job.workType });
  }

  // Match by contract type
  if (job.type) {
    orConditions.push({ 'workPreferences.contractTypes': job.type });
  }

  // Only get candidates with some matching criteria
  if (orConditions.length > 0) {
    candidateQuery.$or = orConditions;
  }
  console.log('Candidate Query:', JSON.stringify(candidateQuery));

  // Fetch candidate profiles with basic filters
  const candidateProfiles = await CandidateProfile.find(candidateQuery)
    .populate({
      path: 'userId',
      select: 'allowSearch',
      match: { allowSearch: true, role: 'candidate' }
    })
    .select('userId fullname avatar bio skills experiences preferredCategories preferredLocations workPreferences expectedSalary')
    .lean();

  // Filter out candidates whose userId didn't match (allowSearch = false)
  const validProfiles = candidateProfiles.filter(p => p.userId !== null);

  logger.info('Found potential candidates', {
    jobId,
    candidateCount: validProfiles.length
  });

  // Calculate match score for each candidate
  const scoredCandidates = validProfiles.map(profile => {
    let score = 0;
    const matchReasons = [];

    // 1. Skills matching (max 40 points)
    if (job.skills && job.skills.length > 0 && profile.skills && profile.skills.length > 0) {
      const jobSkillsLower = job.skills.map(s => s.toLowerCase().trim());
      const candidateSkillsLower = profile.skills.map(s => s.name.toLowerCase().trim());
      
      let exactMatches = 0;
      let partialMatches = 0;
      const matchedSkillNames = [];

      candidateSkillsLower.forEach(candidateSkill => {
        if (jobSkillsLower.includes(candidateSkill)) {
          exactMatches++;
          matchedSkillNames.push(candidateSkill);
        } else {
          // Check partial match
          const hasPartial = jobSkillsLower.some(jobSkill => 
            jobSkill.includes(candidateSkill) || candidateSkill.includes(jobSkill)
          );
          if (hasPartial) {
            partialMatches++;
          }
        }
      });

      const skillScore = Math.min(40, (exactMatches * 10) + (partialMatches * 3));
      score += skillScore;

      if (exactMatches > 0) {
        matchReasons.push({
          type: 'skill_match',
          value: `Khớp ${exactMatches} kỹ năng: ${matchedSkillNames.slice(0, 3).join(', ')}${matchedSkillNames.length > 3 ? '...' : ''}`,
          weight: skillScore
        });
      }
    }

    // 2. Category matching (max 25 points)
    if (job.category && profile.preferredCategories?.includes(job.category)) {
      score += 25;
      matchReasons.push({
        type: 'category_match',
        value: `Đúng ngành nghề mong muốn`,
        weight: 25
      });
    }

    // 3. Location matching (max 20 points)
    if (job.location?.province && profile.preferredLocations?.length > 0) {
      const locationMatch = profile.preferredLocations.find(loc => 
        loc.province === job.location.province
      );
      if (locationMatch) {
        let locationScore = 15;
        // Bonus for district match
        if (locationMatch.district && job.location.district && 
            locationMatch.district === job.location.district) {
          locationScore = 20;
        }
        score += locationScore;
        matchReasons.push({
          type: 'location_match',
          value: `Vị trí phù hợp: ${job.location.province}${locationMatch.district ? ', ' + locationMatch.district : ''}`,
          weight: locationScore
        });
      }
    }

    // 4. Experience level matching (max 10 points)
    if (job.experience && profile.workPreferences?.experienceLevel?.includes(job.experience)) {
      score += 10;
      matchReasons.push({
        type: 'experience_match',
        value: `Cấp độ kinh nghiệm phù hợp`,
        weight: 10
      });
    }

    // 5. Work type matching (max 5 points)
    if (job.workType && profile.workPreferences?.workTypes?.includes(job.workType)) {
      score += 5;
      matchReasons.push({
        type: 'worktype_match',
        value: `Hình thức làm việc phù hợp`,
        weight: 5
      });
    }

    // Normalize score to 0-1 range (max possible = 100)
    const normalizedScore = score / 100;

    return {
      profile,
      score: normalizedScore,
      matchReasons
    };
  });

  // Filter by minimum score and sort by score descending
  const filteredCandidates = scoredCandidates
    .filter(c => c.score >= minScore)
    .sort((a, b) => b.score - a.score);

  const totalCount = filteredCandidates.length;

  // Apply pagination
  const paginatedCandidates = filteredCandidates.slice(skip, skip + limit);

  // Format response
  const candidates = paginatedCandidates.map(({ profile, score, matchReasons }) => {
    const currentPosition = getCurrentPosition(profile.experiences || []);
    const experienceYears = calculateExperienceYears(profile.experiences || []);
    const matchedSkills = extractMatchedSkills(job.skills || [], profile.skills || []);

    return {
      userId: profile.userId._id?.toString() || profile.userId.toString(),
      candidateProfileId: profile._id.toString(),
      fullname: profile.fullname,
      avatar: profile.avatar,
      bio: profile.bio,
      currentPosition,
      skills: profile.skills?.slice(0, 5) || [],
      similarityScore: score,
      similarityPercentage: Math.round(score * 100),
      matchedSkills,
      experienceYears,
      matchReasons
    };
  });

  logger.info('Manual matching completed', {
    jobId,
    totalMatched: totalCount,
    returnedCount: candidates.length
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
        matchingMethod: 'manual' // Indicate this is manual matching
      }
    }
  };
};

/* ========================================
 * AI Vector Search Implementation (COMMENTED OUT FOR FUTURE USE)
 * ========================================
 * Uncomment this function and rename to getCandidateSuggestions to use AI-powered matching
 */
/*
export const getCandidateSuggestionsAI = async (jobId, options = {}) => {
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
  // có thể không cần vì hiện quy định job chỉ có 1 chunk, nên avgEmbedding = jobEmbeddings[0] lun, nhưng dòng này để cho trường hợp job có nhiều chunk (nếu có chỉnh sửa trong tương lai)
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

  // Giai đoạn 2: tinh chỉnh
  // Re-rank based on best chunk match
  if (matchedUsers.length > 0) {
    matchedUsers.forEach(user => {
      // Default to the vector search score (based on average)
      let bestScore = user.similarityScore;

      // If user has chunks, see if any single chunk matches better than the average
      if (user.chunks && user.chunks.length > 0) {
        let maxChunkScore = -1;

        for (const chunk of user.chunks) {
          if (chunk.embedding && chunk.embedding.length > 0) {
            // Calculate cosine similarity between Job Average and Candidate Chunk
            const score = cosineSimilarity(avgEmbedding, chunk.embedding);
            if (score > maxChunkScore) {
              maxChunkScore = score;
            }
          }
        }

        // If a specific chunk is a better match, upgrade the score
        if (maxChunkScore > bestScore) {
          bestScore = maxChunkScore;
        }
      }

      user.similarityScore = bestScore;
    });

    // Sort by new refined score
    matchedUsers.sort((a, b) => b.similarityScore - a.similarityScore);
  }

  logger.info('Vector search completed and re-ranked', {
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
*/
// ======== END OF AI VECTOR SEARCH IMPLEMENTATION ========
