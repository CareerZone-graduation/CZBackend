import { CandidateProfile, Job, JobRecommendation } from '../models/index.js';
import { NotFoundError, BadRequestError } from '../utils/AppError.js';
import logger from '../utils/logger.js';
import ngeohash from 'ngeohash';

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

  // Build base query for active jobs
  const baseQuery = {
    status: 'ACTIVE',
    moderationStatus: 'APPROVED',
    deadline: { $gte: new Date() }
  };

  // Get all active jobs
  const allJobs = await Job.find(baseQuery)
    .select('title description requirements location address type workType minSalary maxSalary experience category skills deadline recruiterProfileId')
    .populate('recruiterProfileId', 'fullname company')
    .lean();

  if (allJobs.length === 0) {
    logger.info('No active jobs found for recommendations');
    return {
      recommendations: [],
      total: 0,
      message: 'Hiện tại chưa có việc làm phù hợp. Vui lòng thử lại sau.'
    };
  }

  logger.info(`Found ${allJobs.length} active jobs to filter`);

  // Apply filters
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

  processMatches(skillFilter.matchedJobs, 'skillScore');
  processMatches(locationFilter.matchedJobs, 'locationScore');
  processMatches(salaryFilter.matchedJobs, 'salaryScore');
  processMatches(workPrefFilter.matchedJobs, 'workPreferenceScore');

  // Merge all reasons
  Object.assign(allReasons, skillFilter.reasons, locationFilter.reasons, salaryFilter.reasons, workPrefFilter.reasons);

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

  // Save recommendations to database
  if (recommendations.length > 0) {
    const bulkOps = recommendations.map(rec => ({
      updateOne: {
        filter: {
          candidateId: profile._id,
          jobId: rec.job._id
        },
        update: {
          $set: {
            score: rec.score,
            reasons: rec.reasons,
            generatedAt: new Date()
          }
        },
        upsert: true
      }
    }));

    await JobRecommendation.bulkWrite(bulkOps);
    logger.info(`Saved ${recommendations.length} recommendations to database`);
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

  // Get recommendations from database
  const [recommendations, totalCount] = await Promise.all([
    JobRecommendation.find({ candidateId: profile._id })
      .sort({ score: -1, generatedAt: -1 })
      .skip(skip)
      .limit(limit)
      .populate({
        path: 'jobId',
        select: 'title description location address type workType minSalary maxSalary experience category skills deadline recruiterProfileId status',
        populate: {
          path: 'recruiterProfileId',
          select: 'fullname company'
        }
      })
      .lean(),
    JobRecommendation.countDocuments({ candidateId: profile._id })
  ]);

  // Filter out recommendations where job no longer exists or is inactive
  const validRecommendations = recommendations.filter(rec => 
    rec.jobId && 
    rec.jobId.status === 'ACTIVE' &&
    new Date(rec.jobId.deadline) >= new Date()
  );

  logger.info('Retrieved recommendations', {
    userId,
    total: totalCount,
    page,
    returned: validRecommendations.length
  });

  return {
    jobs: validRecommendations.map(rec => ({
      ...rec.jobId,
      recommendationScore: rec.score,
      recommendationReasons: rec.reasons,
      recommendedAt: rec.generatedAt
    })),
    pagination: {
      currentPage: page,
      totalPages: Math.ceil(totalCount / limit),
      totalItems: totalCount,
      limit,
      hasMore: page * limit < totalCount
    },
    lastUpdated: validRecommendations.length > 0 
      ? validRecommendations[0].generatedAt 
      : null
  };
};
