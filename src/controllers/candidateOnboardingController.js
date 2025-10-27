import asyncHandler from 'express-async-handler';
import CandidateProfile from '../models/CandidateProfile.js';
import logger from '../utils/logger.js';
import { NotFoundError, BadRequestError } from '../utils/AppError.js';
import * as onboardingService from '../services/onboarding.service.js';

// Export service functions for backward compatibility
export const calculateProfileCompleteness = onboardingService.calculateProfileCompleteness;
export const updateProfileCompleteness = onboardingService.updateProfileCompleteness;

/**
 * Get onboarding status - Kiểm tra trực tiếp profile completeness
 * GET /api/candidate/onboarding/status
 */
export const getOnboardingStatus = asyncHandler(async (req, res) => {
  const userId = req.user._id;

  const profile = await CandidateProfile.findOne({ userId });

  if (!profile) {
    throw new NotFoundError('Không tìm thấy hồ sơ. Vui lòng tạo hồ sơ trước.');
  }

  // Tính toán profile completeness trực tiếp
  const completeness = await onboardingService.updateProfileCompleteness(profile._id, profile);

  // Xác định cần onboarding dựa vào field onboardingCompleted
  // Nếu user đã bấm "Hoàn thành" ở bước cuối → không cần onboarding nữa
  const needsOnboarding = !profile.onboardingCompleted;

  res.status(200).json({
    success: true,
    message: 'Lấy trạng thái onboarding thành công',
    data: {
      needsOnboarding,
      onboardingCompleted: profile.onboardingCompleted,
      completeness: completeness.percentage,
      profileCompleteness: completeness,
      canGenerateRecommendations: completeness.canGenerateRecommendations,
      isWellCompleted: completeness.isWellCompleted,
      isFullyCompleted: completeness.isFullyCompleted
    }
  });
});

/**
 * Get profile improvement recommendations
 * GET /api/candidate/onboarding/recommendations
 */
export const getRecommendations = asyncHandler(async (req, res) => {
  const userId = req.user._id;

  const profile = await CandidateProfile.findOne({ userId });

  if (!profile) {
    throw new NotFoundError('Không tìm thấy hồ sơ.');
  }

  const recommendations = onboardingService.getProfileImprovementRecommendations(profile);

  res.status(200).json({
    success: true,
    message: 'Lấy gợi ý cải thiện hồ sơ thành công',
    data: recommendations
  });
});

/**
 * Transform profile data từ frontend format sang backend format
 * @param {Object} profileData - Data từ frontend
 * @returns {Object} - Transformed data
 */
const transformProfileData = (profileData) => {
  const transformed = { ...profileData };

  // Transform fullName → fullname (frontend camelCase → backend lowercase)
  if (transformed.fullName) {
    transformed.fullname = transformed.fullName;
    delete transformed.fullName;
  }

  // Transform skills: array of strings → array of { name: string }
  if (transformed.skills && Array.isArray(transformed.skills)) {
    transformed.skills = transformed.skills.map(skill => {
      if (typeof skill === 'string') {
        return { name: skill };
      }
      return skill;
    });
  }

  // Remove avatar nếu là object (File object từ frontend)
  // Avatar sẽ được upload qua endpoint riêng
  if (transformed.avatar && typeof transformed.avatar === 'object') {
    delete transformed.avatar;
  }

  return transformed;
};

/**
 * Update profile data - Không cần step ID, chỉ cần update data
 * PUT /api/candidate/onboarding/update
 */
export const updateProfileData = asyncHandler(async (req, res) => {
  const userId = req.user._id;
  const { profileData } = req.body;

  if (!profileData || typeof profileData !== 'object') {
    throw new BadRequestError('Dữ liệu profile không hợp lệ');
  }

  const profile = await CandidateProfile.findOne({ userId });

  if (!profile) {
    throw new NotFoundError('Không tìm thấy hồ sơ');
  }

  // Transform data từ frontend format sang backend format
  const transformedData = transformProfileData(profileData);

  // Update các trường được gửi lên
  const allowedFields = [
    'fullname', 'phone', 'avatar', 'bio', 'address',
    'skills', 'experiences', 'educations', 'certificates', 'projects',
    'expectedSalary', 'preferredLocations', 'workPreferences',
    'experienceLevel', 'linkedin', 'github', 'website'
  ];

  for (const field of allowedFields) {
    if (transformedData[field] !== undefined) {
      profile[field] = transformedData[field];
    }
  }

  // Save with validateModifiedOnly to avoid validating unchanged fields
  await profile.save({ validateModifiedOnly: true });

  // Tính lại profile completeness
  const completeness = await onboardingService.updateProfileCompleteness(profile._id);

  logger.info('Profile data updated', { userId, completeness: completeness.percentage });

  res.status(200).json({
    success: true,
    message: 'Cập nhật thông tin hồ sơ thành công',
    data: {
      profile,
      profileCompleteness: completeness
    }
  });
});

/**
 * Upload avatar - Endpoint riêng cho upload avatar
 * POST /api/candidate/onboarding/upload-avatar
 */
export const uploadAvatar = asyncHandler(async (req, res) => {
  const userId = req.user._id;

  if (!req.file) {
    throw new BadRequestError('Vui lòng chọn file ảnh');
  }

  const profile = await CandidateProfile.findOne({ userId });

  if (!profile) {
    throw new NotFoundError('Không tìm thấy hồ sơ');
  }

  // Upload lên Cloudinary
  const { uploadToCloudinary } = await import('../services/upload.service.js');
  const result = await uploadToCloudinary(req.file.buffer, 'avatars');

  // Cập nhật avatar URL
  profile.avatar = result.secure_url;
  await profile.save();

  // Tính lại completeness
  const completeness = await onboardingService.updateProfileCompleteness(profile._id);

  logger.info('Avatar uploaded', { userId, avatarUrl: result.secure_url });

  res.status(200).json({
    success: true,
    message: 'Tải ảnh đại diện thành công',
    data: {
      avatarUrl: result.secure_url,
      profileCompleteness: completeness
    }
  });
});

/**
 * Complete onboarding - Đánh dấu user đã hoàn thành onboarding
 * POST /api/candidate/onboarding/complete
 */
export const completeOnboarding = asyncHandler(async (req, res) => {
  const userId = req.user._id;

  const profile = await CandidateProfile.findOne({ userId });

  if (!profile) {
    throw new NotFoundError('Không tìm thấy hồ sơ');
  }

  // Đánh dấu đã hoàn thành onboarding
  profile.onboardingCompleted = true;
  profile.onboardingCompletedAt = new Date();
  await profile.save();

  // Tính completeness hiện tại
  const completeness = await onboardingService.updateProfileCompleteness(profile._id);

  logger.info('Onboarding completed', { userId, completeness: completeness.percentage });

  res.status(200).json({
    success: true,
    message: 'Hoàn thành onboarding thành công! 🎉',
    data: {
      onboardingCompleted: true,
      profileCompleteness: completeness
    }
  });
});

/**
 * Dismiss onboarding reminder - User có thể tạm thời bỏ qua
 * POST /api/candidate/onboarding/dismiss
 */
export const dismissOnboarding = asyncHandler(async (req, res) => {
  const userId = req.user._id;

  const profile = await CandidateProfile.findOne({ userId });

  if (!profile) {
    throw new NotFoundError('Không tìm thấy hồ sơ');
  }

  // Tính completeness hiện tại
  const completeness = await onboardingService.updateProfileCompleteness(profile._id);

  res.status(200).json({
    success: true,
    message: 'Đã bỏ qua nhắc nhở onboarding. Bạn có thể hoàn thiện hồ sơ bất cứ lúc nào.',
    data: {
      profileCompleteness: completeness,
      canDismiss: true
    }
  });
});
