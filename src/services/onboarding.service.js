import CandidateProfile from '../models/CandidateProfile.js';
import OnboardingSession from '../models/OnboardingSession.js';
import { NotFoundError, BadRequestError } from '../utils/AppError.js';
import logger from '../utils/logger.js';

/**
 * Calculate profile completeness percentage and identify missing fields
 * @param {Object} profile - Candidate profile object
 * @returns {Object} - Completeness data with percentage, flags, missing fields, and recommendations
 */
export const calculateProfileCompleteness = (profile) => {
  if (!profile) {
    return {
      percentage: 0,
      missingFields: ['all'],
      recommendations: ['Vui lòng tạo hồ sơ để bắt đầu'],
      hasBasicInfo: false,
      hasExperience: false,
      hasEducation: false,
      hasSkills: false,
      hasCV: false,
      hasPreferences: false,
      lastCalculated: new Date()
    };
  }

  // Define weights for each section (total = 100%)
  const weights = {
    basicInfo: 30,      // Essential: fullname, phone, preferredLocations (từ bước 1)
    skills: 30,         // Critical for job matching (từ bước 2)
    preferences: 20,    // Important: salary, work preferences (từ bước 3)
    bio: 5,             // Nice to have
    avatar: 5,          // Nice to have
    experience: 5,      // Optional for freshers
    education: 5,       // Optional
    cv: 0               // Không bắt buộc trong onboarding
  };

  // Check completeness for each section with detailed breakdown
  // Basic Info (30%): fullname + phone + preferredLocations (bước 1)
  const basicInfoComplete = !!(profile.fullname && profile.phone && profile.preferredLocations?.length > 0);
  
  // Skills (30%): >= 3 skills (bước 2)
  const skillsComplete = profile.skills?.length >= 3;
  
  // Preferences (20%): salary + workTypes (bước 3)
  const preferencesComplete = !!(
    profile.expectedSalary?.min > 0 &&
    profile.workPreferences?.workTypes?.length > 0
  );
  
  // Optional fields
  const hasBio = !!profile.bio;
  const hasAvatar = !!profile.avatar;
  const experienceComplete = profile.experiences?.length > 0;
  const educationComplete = profile.educations?.length > 0;
  const cvComplete = profile.cvs?.length > 0;

  const checks = {
    hasBasicInfo: basicInfoComplete,
    hasSkills: skillsComplete,
    hasPreferences: preferencesComplete,
    hasBio,
    hasAvatar,
    hasExperience: experienceComplete,
    hasEducation: educationComplete,
    hasCV: cvComplete
  };

  // Calculate percentage and track missing fields with detailed breakdown
  let percentage = 0;
  const missingFields = [];
  const recommendations = [];

  // Basic Info (30%) - Bước 1: fullname, phone, preferredLocations
  if (checks.hasBasicInfo) {
    percentage += weights.basicInfo;
  } else {
    if (!profile.fullname) {
      missingFields.push('fullname');
      recommendations.push('Thêm họ tên đầy đủ');
    }
    if (!profile.phone) {
      missingFields.push('phone');
      recommendations.push('Thêm số điện thoại liên hệ');
    }
    if (!profile.preferredLocations?.length) {
      missingFields.push('preferredLocations');
      recommendations.push('Chọn địa điểm làm việc mong muốn');
    }
  }
  
  // Bio (5%) - Optional
  if (checks.hasBio) {
    percentage += weights.bio;
  } else {
    missingFields.push('bio');
    recommendations.push('Viết giới thiệu ngắn về bản thân');
  }
  
  // Avatar (5%) - Optional
  if (checks.hasAvatar) {
    percentage += weights.avatar;
  } else {
    missingFields.push('avatar');
    recommendations.push('Tải lên ảnh đại diện');
  }

  // Skills (30%) - Bước 2: >= 3 skills
  if (checks.hasSkills) {
    percentage += weights.skills;
  } else {
    missingFields.push('skills');
    const currentSkillCount = profile.skills?.length || 0;
    if (currentSkillCount === 0) {
      recommendations.push('Thêm ít nhất 3 kỹ năng của bạn');
    } else {
      recommendations.push(`Thêm ${3 - currentSkillCount} kỹ năng nữa (hiện có ${currentSkillCount})`);
    }
  }

  // Preferences (20%) - Bước 3: salary + workTypes
  if (checks.hasPreferences) {
    percentage += weights.preferences;
  } else {
    if (!profile.expectedSalary?.min || profile.expectedSalary.min === 0) {
      missingFields.push('expectedSalary');
      recommendations.push('Thiết lập mức lương mong muốn');
    }
    if (!profile.workPreferences?.workTypes?.length) {
      missingFields.push('workTypes');
      recommendations.push('Chọn hình thức làm việc (Full-time, Part-time, Remote, Hybrid)');
    }
  }

  // Experience (5%) - Optional
  if (checks.hasExperience) {
    percentage += weights.experience;
  } else {
    missingFields.push('experiences');
    recommendations.push('Thêm kinh nghiệm làm việc (không bắt buộc)');
  }

  // Education (5%) - Optional
  if (checks.hasEducation) {
    percentage += weights.education;
  } else {
    missingFields.push('educations');
    recommendations.push('Thêm thông tin học vấn (không bắt buộc)');
  }

  // Add threshold-based recommendations
  const finalPercentage = Math.round(percentage);
  
  // Hoàn thành 3 bước onboarding = 80% (30% + 30% + 20%)
  // Còn 20% là optional fields (bio, avatar, experience, education)
  if (finalPercentage < 80) {
    recommendations.unshift('⚠️ Vui lòng hoàn thành 3 bước onboarding để sử dụng đầy đủ tính năng');
  } else if (finalPercentage < 90) {
    recommendations.unshift('💡 Hoàn thiện thêm để tăng cơ hội tìm việc');
  } else if (finalPercentage < 100) {
    recommendations.unshift('🎯 Hồ sơ gần hoàn thiện! Hoàn thành các mục còn lại');
  } else {
    recommendations.unshift('✅ Hồ sơ đã hoàn thiện 100%!');
  }

  return {
    percentage: finalPercentage,
    missingFields,
    recommendations,
    ...checks,
    lastCalculated: new Date(),
    // Threshold flags for easy checking
    // Hoàn thành 3 bước onboarding = 80% → không cần onboarding nữa
    canGenerateRecommendations: finalPercentage >= 80,
    isWellCompleted: finalPercentage >= 90,
    isFullyCompleted: finalPercentage === 100
  };
};

/**
 * Update profile completeness in database
 * @param {String} profileId - Profile ID
 * @param {Object} profile - Profile object (optional)
 * @returns {Promise<Object>} - Updated completeness data
 */
export const updateProfileCompleteness = async (profileId, profile = null) => {
  try {
    const profileData = profile || await CandidateProfile.findById(profileId);
    
    if (!profileData) {
      throw new NotFoundError('Không tìm thấy hồ sơ');
    }

    const completeness = calculateProfileCompleteness(profileData);
    
    profileData.profileCompleteness = completeness;
    await profileData.save();

    logger.info('Profile completeness updated', { 
      profileId, 
      percentage: completeness.percentage,
      missingFieldsCount: completeness.missingFields.length
    });

    return completeness;
  } catch (error) {
    logger.error('Error updating profile completeness:', error);
    throw error;
  }
};

/**
 * Get detailed recommendations for improving profile completeness
 * @param {Object} profile - Candidate profile object
 * @returns {Object} - Detailed recommendations with priority
 */
export const getProfileImprovementRecommendations = (profile) => {
  const completeness = calculateProfileCompleteness(profile);
  
  const recommendations = {
    critical: [],  // Must have for job recommendations (60% threshold)
    important: [], // Significantly improves matching
    optional: []   // Nice to have
  };

  // Critical items (needed to reach 60% threshold)
  if (!profile.fullname) {
    recommendations.critical.push({
      field: 'fullname',
      message: 'Thêm họ tên đầy đủ',
      action: 'Cập nhật thông tin cơ bản',
      impact: 'Bắt buộc để hoàn thiện hồ sơ'
    });
  }

  if (!profile.phone) {
    recommendations.critical.push({
      field: 'phone',
      message: 'Thêm số điện thoại liên hệ',
      action: 'Cập nhật thông tin cơ bản',
      impact: 'Nhà tuyển dụng cần thông tin này để liên hệ'
    });
  }

  if (!profile.skills || profile.skills.length < 3) {
    recommendations.critical.push({
      field: 'skills',
      message: 'Thêm ít nhất 3 kỹ năng',
      action: 'Cập nhật kỹ năng',
      impact: 'Cần thiết để hệ thống gợi ý việc làm phù hợp'
    });
  }

  // Important items (improve matching quality)
  if (!profile.bio) {
    recommendations.important.push({
      field: 'bio',
      message: 'Viết giới thiệu ngắn về bản thân',
      action: 'Thêm mô tả bản thân',
      impact: 'Giúp nhà tuyển dụng hiểu rõ hơn về bạn'
    });
  }

  if (!profile.expectedSalary?.min || profile.expectedSalary.min === 0) {
    recommendations.important.push({
      field: 'expectedSalary',
      message: 'Thiết lập mức lương mong muốn',
      action: 'Cập nhật thông tin lương',
      impact: 'Giúp lọc việc làm phù hợp với kỳ vọng của bạn'
    });
  }

  if (!profile.preferredLocations?.length) {
    recommendations.important.push({
      field: 'preferredLocations',
      message: 'Chọn địa điểm làm việc ưa thích',
      action: 'Cập nhật địa điểm',
      impact: 'Nhận gợi ý việc làm gần bạn'
    });
  }

  if (!profile.workPreferences?.workTypes?.length) {
    recommendations.important.push({
      field: 'workTypes',
      message: 'Chọn hình thức làm việc',
      action: 'Cập nhật điều kiện làm việc',
      impact: 'Lọc việc làm theo hình thức mong muốn (Remote/Onsite/Hybrid)'
    });
  }

  // Optional items (nice to have)
  if (!profile.avatar) {
    recommendations.optional.push({
      field: 'avatar',
      message: 'Tải lên ảnh đại diện',
      action: 'Thêm ảnh đại diện',
      impact: 'Tạo ấn tượng tốt với nhà tuyển dụng'
    });
  }

  if (!profile.experiences?.length) {
    recommendations.optional.push({
      field: 'experiences',
      message: 'Thêm kinh nghiệm làm việc',
      action: 'Cập nhật kinh nghiệm',
      impact: 'Tăng cơ hội được tuyển dụng'
    });
  }

  if (!profile.educations?.length) {
    recommendations.optional.push({
      field: 'educations',
      message: 'Thêm thông tin học vấn',
      action: 'Cập nhật học vấn',
      impact: 'Bổ sung thông tin về trình độ'
    });
  }

  if (!profile.cvs?.length) {
    recommendations.optional.push({
      field: 'cv',
      message: 'Tải lên CV',
      action: 'Upload CV',
      impact: 'Dễ dàng ứng tuyển nhanh chóng'
    });
  }

  return {
    completeness: completeness.percentage,
    canGenerateRecommendations: completeness.canGenerateRecommendations,
    recommendations,
    summary: {
      critical: recommendations.critical.length,
      important: recommendations.important.length,
      optional: recommendations.optional.length,
      total: recommendations.critical.length + recommendations.important.length + recommendations.optional.length
    }
  };
};

/**
 * Validate step data based on step ID
 * @param {Number} stepId - Step ID (1-3)
 * @param {Object} stepData - Data to validate
 * @returns {Object} - Validated data
 */
export const validateStepData = (stepId, stepData) => {
  if (!stepData || typeof stepData !== 'object') {
    throw new BadRequestError('Dữ liệu bước không hợp lệ');
  }

  switch (stepId) {
    case 1: // Basic Info Step
      return validateBasicInfoStep(stepData);
    case 2: // Skills & Experience Step
      return validateSkillsExperienceStep(stepData);
    case 3: // Salary & Preferences Step
      return validateSalaryPreferencesStep(stepData);
    default:
      throw new BadRequestError('Step ID không hợp lệ');
  }
};

/**
 * Validate basic info step data
 * @param {Object} data
 * @returns {Object}
 */
const validateBasicInfoStep = (data) => {
  const validated = {};

  if (data.fullname) {
    if (typeof data.fullname !== 'string' || data.fullname.trim().length === 0) {
      throw new BadRequestError('Họ tên không hợp lệ');
    }
    validated.fullname = data.fullname.trim();
  }

  if (data.phone) {
    const phoneRegex = /^[\+]?[\d]{1,15}$/;
    if (!phoneRegex.test(data.phone)) {
      throw new BadRequestError('Số điện thoại không hợp lệ');
    }
    validated.phone = data.phone;
  }

  if (data.avatar) {
    validated.avatar = data.avatar;
  }

  if (data.preferredLocations) {
    if (!Array.isArray(data.preferredLocations)) {
      throw new BadRequestError('Địa điểm ưa thích phải là mảng');
    }
    validated.preferredLocations = data.preferredLocations;
  }

  return validated;
};

/**
 * Validate skills and experience step data
 * @param {Object} data
 * @returns {Object}
 */
const validateSkillsExperienceStep = (data) => {
  const validated = {};

  if (data.skills) {
    if (!Array.isArray(data.skills)) {
      throw new BadRequestError('Kỹ năng phải là mảng');
    }
    if (data.skills.length < 3) {
      throw new BadRequestError('Cần ít nhất 3 kỹ năng');
    }
    validated.skills = data.skills;
  }

  if (data.experienceLevel) {
    const validLevels = ['ENTRY_LEVEL', 'MID_LEVEL', 'SENIOR_LEVEL', 'EXECUTIVE', 'NO_EXPERIENCE', 'INTERN', 'FRESHER'];
    if (!validLevels.includes(data.experienceLevel)) {
      throw new BadRequestError('Mức độ kinh nghiệm không hợp lệ');
    }
    validated.experienceLevel = data.experienceLevel;
  }

  if (data.experiences) {
    if (!Array.isArray(data.experiences)) {
      throw new BadRequestError('Kinh nghiệm phải là mảng');
    }
    validated.experiences = data.experiences;
  }

  if (data.educations) {
    if (!Array.isArray(data.educations)) {
      throw new BadRequestError('Học vấn phải là mảng');
    }
    validated.educations = data.educations;
  }

  return validated;
};

/**
 * Validate salary and preferences step data
 * @param {Object} data
 * @returns {Object}
 */
const validateSalaryPreferencesStep = (data) => {
  const validated = {};

  if (data.expectedSalary) {
    const { min, max, currency } = data.expectedSalary;
    
    if (min !== undefined && (typeof min !== 'number' || min < 0)) {
      throw new BadRequestError('Mức lương tối thiểu không hợp lệ');
    }
    
    if (max !== undefined && (typeof max !== 'number' || max < 0)) {
      throw new BadRequestError('Mức lương tối đa không hợp lệ');
    }
    
    if (min !== undefined && max !== undefined && max < min) {
      throw new BadRequestError('Mức lương tối đa phải lớn hơn hoặc bằng mức lương tối thiểu');
    }
    
    if (currency && !['VND', 'USD'].includes(currency)) {
      throw new BadRequestError('Đơn vị tiền tệ không hợp lệ');
    }

    validated.expectedSalary = data.expectedSalary;
  }

  if (data.workPreferences) {
    const { workTypes, contractTypes } = data.workPreferences;
    
    if (workTypes) {
      const validWorkTypes = ['ON_SITE', 'REMOTE', 'HYBRID'];
      if (!Array.isArray(workTypes) || !workTypes.every(t => validWorkTypes.includes(t))) {
        throw new BadRequestError('Loại hình làm việc không hợp lệ');
      }
    }
    
    if (contractTypes) {
      const validContractTypes = ['FULL_TIME', 'PART_TIME', 'CONTRACT', 'INTERNSHIP', 'TEMPORARY', 'FREELANCE'];
      if (!Array.isArray(contractTypes) || !contractTypes.every(t => validContractTypes.includes(t))) {
        throw new BadRequestError('Loại hợp đồng không hợp lệ');
      }
    }

    validated.workPreferences = data.workPreferences;
  }

  return validated;
};

/**
 * Save step data to profile
 * @param {String} userId - User ID
 * @param {Number} stepId - Step ID
 * @param {Object} stepData - Validated step data
 * @returns {Promise<Object>} - Updated profile
 */
export const saveStepDataToProfile = async (userId, stepId, stepData) => {
  try {
    const profile = await CandidateProfile.findOne({ userId });
    
    if (!profile) {
      throw new NotFoundError('Không tìm thấy hồ sơ');
    }

    // Validate step data
    const validatedData = validateStepData(stepId, stepData);

    // Update profile based on step
    switch (stepId) {
      case 1: // Basic Info
        if (validatedData.fullname) profile.fullname = validatedData.fullname;
        if (validatedData.phone) profile.phone = validatedData.phone;
        if (validatedData.avatar) profile.avatar = validatedData.avatar;
        if (validatedData.preferredLocations) profile.preferredLocations = validatedData.preferredLocations;
        break;

      case 2: // Skills & Experience
        if (validatedData.skills) profile.skills = validatedData.skills;
        if (validatedData.experienceLevel) {
          if (!profile.workPreferences) profile.workPreferences = {};
          profile.workPreferences.experienceLevel = validatedData.experienceLevel;
        }
        if (validatedData.experiences) profile.experiences = validatedData.experiences;
        if (validatedData.educations) profile.educations = validatedData.educations;
        break;

      case 3: // Salary & Preferences
        if (validatedData.expectedSalary) profile.expectedSalary = validatedData.expectedSalary;
        if (validatedData.workPreferences) {
          if (!profile.workPreferences) profile.workPreferences = {};
          if (validatedData.workPreferences.workTypes) {
            profile.workPreferences.workTypes = validatedData.workPreferences.workTypes;
          }
          if (validatedData.workPreferences.contractTypes) {
            profile.workPreferences.contractTypes = validatedData.workPreferences.contractTypes;
          }
        }
        break;
    }

    await profile.save();

    logger.info('Step data saved to profile', { userId, stepId });

    return profile;
  } catch (error) {
    logger.error('Error saving step data to profile:', error);
    throw error;
  }
};

/**
 * Handle skip step with impact tracking
 * @param {String} userId - User ID
 * @param {Number} stepId - Step ID to skip
 * @param {String} reason - Skip reason (optional)
 * @returns {Promise<Object>} - Impact information
 */
export const handleSkipStep = async (userId, stepId, reason = null) => {
  try {
    const profile = await CandidateProfile.findOne({ userId });
    
    if (!profile) {
      throw new NotFoundError('Không tìm thấy hồ sơ');
    }

    // Get impact message
    const impactMessage = getSkipImpactMessage(stepId);
    
    // Calculate impact on profile completeness
    const currentCompleteness = calculateProfileCompleteness(profile);
    
    logger.info('Step skipped', { 
      userId, 
      stepId, 
      reason,
      currentCompleteness: currentCompleteness.percentage 
    });

    return {
      impactMessage,
      currentCompleteness: currentCompleteness.percentage,
      missingFields: currentCompleteness.missingFields,
      canGenerateRecommendations: currentCompleteness.percentage >= 60
    };
  } catch (error) {
    logger.error('Error handling skip step:', error);
    throw error;
  }
};

/**
 * Get impact message for skipping a step
 * @param {Number} stepId
 * @returns {String}
 */
const getSkipImpactMessage = (stepId) => {
  const messages = {
    1: 'Bỏ qua thông tin cơ bản có thể làm giảm chất lượng gợi ý việc làm. Bạn có thể hoàn thiện sau.',
    2: 'Không có thông tin kỹ năng sẽ khiến hệ thống khó gợi ý việc làm phù hợp với bạn.',
    3: 'Thiếu thông tin mức lương và điều kiện làm việc có thể dẫn đến gợi ý không đúng kỳ vọng của bạn.'
  };
  return messages[stepId] || 'Bỏ qua bước này có thể ảnh hưởng đến trải nghiệm của bạn.';
};

/**
 * Manage onboarding session - create or resume
 * @param {String} candidateId - Candidate profile ID
 * @param {Object} metadata - Session metadata (userAgent, ipAddress, etc.)
 * @returns {Promise<Object>} - Session object
 */
export const manageOnboardingSession = async (candidateId, metadata = {}) => {
  try {
    // Check for existing in-progress session
    let session = await OnboardingSession.findOne({
      candidateId,
      status: 'in_progress'
    }).sort({ startedAt: -1 });

    if (session) {
      logger.info('Resuming existing onboarding session', { 
        candidateId, 
        sessionId: session.sessionId 
      });
      return session;
    }

    // Create new session
    const { v4: uuidv4 } = await import('uuid');
    
    const steps = [
      { stepId: 1, name: 'Thông tin cơ bản', completed: false, skipped: false, data: {} },
      { stepId: 2, name: 'Kỹ năng và kinh nghiệm', completed: false, skipped: false, data: {} },
      { stepId: 3, name: 'Mức lương và điều kiện làm việc', completed: false, skipped: false, data: {} }
    ];

    session = await OnboardingSession.create({
      candidateId,
      sessionId: uuidv4(),
      steps,
      status: 'in_progress',
      metadata
    });

    logger.info('Created new onboarding session', { 
      candidateId, 
      sessionId: session.sessionId 
    });

    return session;
  } catch (error) {
    logger.error('Error managing onboarding session:', error);
    throw error;
  }
};

/**
 * Get onboarding session by ID
 * @param {String} sessionId - Session ID
 * @returns {Promise<Object>} - Session object
 */
export const getOnboardingSession = async (sessionId) => {
  const session = await OnboardingSession.findOne({ sessionId });
  
  if (!session) {
    throw new NotFoundError('Không tìm thấy phiên onboarding');
  }

  return session;
};

/**
 * Complete onboarding session
 * @param {String} sessionId - Session ID
 * @returns {Promise<Object>} - Completed session
 */
export const completeOnboardingSession = async (sessionId) => {
  const session = await OnboardingSession.findOne({ sessionId });
  
  if (!session) {
    throw new NotFoundError('Không tìm thấy phiên onboarding');
  }

  session.status = 'completed';
  session.completedAt = new Date();
  await session.save();

  logger.info('Onboarding session completed', { sessionId });

  return session;
};

/**
 * Abandon onboarding session (for cleanup)
 * @param {String} sessionId - Session ID
 * @returns {Promise<Object>} - Abandoned session
 */
export const abandonOnboardingSession = async (sessionId) => {
  const session = await OnboardingSession.findOne({ sessionId });
  
  if (!session) {
    throw new NotFoundError('Không tìm thấy phiên onboarding');
  }

  session.status = 'abandoned';
  session.abandonedAt = new Date();
  await session.save();

  logger.info('Onboarding session abandoned', { sessionId });

  return session;
};
