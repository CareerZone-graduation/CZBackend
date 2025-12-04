import CandidateProfile from '../models/CandidateProfile.js';
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
    basicInfo: 20,      // Essential: fullname, phone, preferredLocations (từ bước 1)
    skills: 20,         // Critical for job matching (từ bước 2)
    categories: 15,     // NEW: Job categories preference (ngành nghề mong muốn)
    preferences: 15,    // Important: salary, work preferences (từ bước 3)
    bio: 5,             // Nice to have (bước 1)
    avatar: 5,          // Nice to have (bước 1)
    experience: 5,      // Optional for freshers (bước 4)
    education: 5,       // Optional (bước 4)
    certificates: 5,    // Optional - chứng chỉ (bước 5)
    projects: 5,        // Optional - dự án (bước 5)
    socialLinks: 0,     // Optional - không tính điểm (linkedin, github, website)
    cv: 0               // Không bắt buộc trong onboarding
  };

  // Check completeness for each section with detailed breakdown
  // Basic Info (20%): fullname + phone + preferredLocations (bước 1)
  const basicInfoComplete = !!(profile.fullname && profile.phone && profile.preferredLocations?.length > 0);

  // Skills (20%): >= 3 skills (bước 2)
  const skillsComplete = profile.skills?.length >= 3;

  // Categories (15%): >= 1 preferred category (ngành nghề - bước 2 mới)
  const categoriesComplete = profile.preferredCategories?.length >= 1;

  // Preferences (15%): salary + workTypes + contractTypes (bước 3)
  const preferencesComplete = !!(
    profile.expectedSalary?.min > 0 &&
    profile.workPreferences?.workTypes?.length > 0 &&
    profile.workPreferences?.contractTypes?.length > 0
  );

  // Optional fields
  const hasBio = !!profile.bio;
  const hasAvatar = !!profile.avatar;
  const experienceComplete = profile.experiences?.length > 0;
  const educationComplete = profile.educations?.length > 0;
  const certificatesComplete = profile.certificates?.length > 0;
  const projectsComplete = profile.projects?.length > 0;
  const hasSocialLinks = !!(profile.linkedin || profile.github || profile.website);
  const cvComplete = profile.cvs?.length > 0;

  const checks = {
    hasBasicInfo: basicInfoComplete,
    hasSkills: skillsComplete,
    hasCategories: categoriesComplete,
    hasPreferences: preferencesComplete,
    hasBio,
    hasAvatar,
    hasExperience: experienceComplete,
    hasEducation: educationComplete,
    hasCertificates: certificatesComplete,
    hasProjects: projectsComplete,
    hasSocialLinks,
    hasCV: cvComplete
  };

  // Calculate percentage and track missing fields with detailed breakdown
  let percentage = 0;
  const missingFields = [];
  const recommendations = [];

  // Basic Info (25%) - Bước 1: fullname, phone, preferredLocations
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

  // Bio (5%) - Optional (bước 1)
  if (checks.hasBio) {
    percentage += weights.bio;
  } else {
    missingFields.push('bio');
    recommendations.push('Viết giới thiệu ngắn về bản thân');
  }

  // Avatar (5%) - Optional (bước 1)
  if (checks.hasAvatar) {
    percentage += weights.avatar;
  } else {
    missingFields.push('avatar');
    recommendations.push('Tải lên ảnh đại diện');
  }

  // Skills (20%) - Bước 2: >= 3 skills
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

  // Categories (15%) - Bước 2: >= 1 preferred category (ngành nghề)
  if (checks.hasCategories) {
    percentage += weights.categories;
  } else {
    missingFields.push('preferredCategories');
    recommendations.push('Chọn ít nhất 1 ngành nghề mong muốn');
  }

  // Preferences (15%) - Bước 3: salary + workTypes + contractTypes
  if (checks.hasPreferences) {
    percentage += weights.preferences;
  } else {
    if (!profile.expectedSalary?.min || profile.expectedSalary.min === 0) {
      missingFields.push('expectedSalary');
      recommendations.push('Thiết lập mức lương mong muốn');
    }
    if (!profile.workPreferences?.workTypes?.length) {
      missingFields.push('workTypes');
      recommendations.push('Chọn hình thức làm việc (Remote, Hybrid, On-site)');
    }
    if (!profile.workPreferences?.contractTypes?.length) {
      missingFields.push('contractTypes');
      recommendations.push('Chọn loại hợp đồng (Full-time, Part-time, Contract, v.v.)');
    }
  }

  // Experience (5%) - Optional (bước 4)
  if (checks.hasExperience) {
    percentage += weights.experience;
  } else {
    missingFields.push('experiences');
    recommendations.push('Thêm kinh nghiệm làm việc (không bắt buộc)');
  }

  // Education (5%) - Optional (bước 4)
  if (checks.hasEducation) {
    percentage += weights.education;
  } else {
    missingFields.push('educations');
    recommendations.push('Thêm thông tin học vấn (không bắt buộc)');
  }

  // Certificates (5%) - Optional (bước 5)
  if (checks.hasCertificates) {
    percentage += weights.certificates;
  } else {
    missingFields.push('certificates');
    recommendations.push('Thêm chứng chỉ chuyên môn (không bắt buộc)');
  }

  // Projects (5%) - Optional (bước 5)
  if (checks.hasProjects) {
    percentage += weights.projects;
  } else {
    missingFields.push('projects');
    recommendations.push('Thêm dự án đã thực hiện (không bắt buộc)');
  }

  // Add threshold-based recommendations
  const finalPercentage = Math.round(percentage);

  // Hoàn thành 3 bước bắt buộc = 70% (25% + 25% + 20%)
  // Bước 4 (Experience + Education) = 10%
  // Bước 5 (Certificates + Projects) = 10%
  // Bio + Avatar = 10%
  if (finalPercentage < 70) {
    recommendations.unshift('⚠️ Vui lòng hoàn thành 3 bước bắt buộc để sử dụng đầy đủ tính năng');
  } else if (finalPercentage < 80) {
    recommendations.unshift('💡 Thêm kinh nghiệm và học vấn để tăng cơ hội tìm việc');
  } else if (finalPercentage < 90) {
    recommendations.unshift('🎯 Thêm chứng chỉ và dự án để nổi bật hơn');
  } else if (finalPercentage < 100) {
    recommendations.unshift('🌟 Hồ sơ gần hoàn thiện! Hoàn thành các mục còn lại');
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
    // Hoàn thành 3 bước bắt buộc = 70% → có thể nhận gợi ý việc làm
    canGenerateRecommendations: finalPercentage >= 70,
    isWellCompleted: finalPercentage >= 80,
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

    // Chỉ save nếu có thay đổi về percentage hoặc missingFields
    const hasChanged = 
      profileData.profileCompleteness?.percentage !== completeness.percentage ||
      JSON.stringify(profileData.profileCompleteness?.missingFields || []) !== JSON.stringify(completeness.missingFields);

    if (hasChanged) {
      profileData.profileCompleteness = completeness;
      await profileData.save();
    }

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

  if (!profile.workPreferences?.contractTypes?.length) {
    recommendations.important.push({
      field: 'contractTypes',
      message: 'Chọn loại hợp đồng mong muốn',
      action: 'Cập nhật loại hợp đồng',
      impact: 'Lọc việc làm theo loại hợp đồng (Full-time/Part-time/Contract)'
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

  if (!profile.certificates?.length) {
    recommendations.optional.push({
      field: 'certificates',
      message: 'Thêm chứng chỉ chuyên môn',
      action: 'Cập nhật chứng chỉ',
      impact: 'Chứng minh năng lực và tăng uy tín'
    });
  }

  if (!profile.projects?.length) {
    recommendations.optional.push({
      field: 'projects',
      message: 'Thêm dự án đã thực hiện',
      action: 'Cập nhật dự án',
      impact: 'Thể hiện kinh nghiệm thực tế'
    });
  }

  if (!profile.linkedin && !profile.github && !profile.website) {
    recommendations.optional.push({
      field: 'socialLinks',
      message: 'Thêm liên kết mạng xã hội (LinkedIn, Github, Website)',
      action: 'Cập nhật liên kết',
      impact: 'Giúp nhà tuyển dụng tìm hiểu thêm về bạn'
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

