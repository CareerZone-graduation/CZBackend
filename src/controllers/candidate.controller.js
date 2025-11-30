import asyncHandler from 'express-async-handler';
import * as candidateService from '../services/candidate.service.js';
import * as uploadService from '../services/upload.service.js';
import { BadRequestError } from '../utils/AppError.js';
import logger from '../utils/logger.js';

export const getProfile = asyncHandler(async (req, res) => {
    const userId = req.user._id;
    const profile = await candidateService.getProfile(userId);
    res.status(200).json({
        success: true,
        message: 'Lấy thông tin hồ sơ thành công.',
        data: profile,
    });
});

export const uploadCv = asyncHandler(async (req, res) => {
    const userId = req.user._id;
    const cvs = await candidateService.uploadCv(userId, req.file);
    res.status(201).json({
        success: true,
        message: 'Tải lên CV thành công.',
        data: cvs,
    });
});

export const getCvs = asyncHandler(async (req, res) => {
    const userId = req.user._id;
    const cvs = await candidateService.getCvs(userId);
    res.status(200).json({
        success: true,
        message: 'Lấy danh sách CV thành công.',
        data: cvs,
    });
});

export const setDefaultCv = asyncHandler(async (req, res) => {
    const userId = req.user._id;
    const { cvId } = req.params;
    const cvs = await candidateService.setDefaultCv(userId, cvId);
    res.status(200).json({
        success: true,
        message: 'Đặt CV làm mặc định thành công.',
        data: cvs,
    });
});

export const deleteCv = asyncHandler(async (req, res) => {
    const userId = req.user._id;
    const { cvId } = req.params;
    const cvs = await candidateService.deleteCv(userId, cvId);
    res.status(200).json({
        success: true,
        message: 'Xóa CV thành công.',
        data: cvs,
    });
});

export const renameCvUpload = asyncHandler(async (req, res) => {
    const userId = req.user._id;
    const { cvId } = req.params;
    const { name } = req.body;

    if (!name || !name.trim()) {
        return res.status(400).json({
            success: false,
            message: 'Tên CV không được để trống.',
        });
    }

    const cvs = await candidateService.renameCv(userId, cvId, name.trim());
    res.status(200).json({
        success: true,
        message: 'Đổi tên CV thành công.',
        data: cvs,
    });
});

export const updateProfile = asyncHandler(async (req, res) => {
    const userId = req.user._id;
    logger.info('Updating candidate profile', {
        userId,
        fields: Object.keys(req.body)
    });

    const updatedProfile = await candidateService.updateProfile(userId, req.body);

    // Get updated completeness to return to frontend
    const profileWithCompleteness = await candidateService.getProfile(userId);

    res.status(200).json({
        success: true,
        message: 'Cập nhật hồ sơ thành công.',
        data: profileWithCompleteness,
    });
});

export const updateAvatar = asyncHandler(async (req, res) => {
    const userId = req.user._id;
    if (!req.file) {
        throw new BadRequestError('Vui lòng tải lên một file ảnh.');
    }

    logger.info(`Uploading avatar for user: ${userId}`);
    const result = await uploadService.uploadToCloudinary(req.file.buffer, 'avatars');

    await candidateService.updateAvatar(userId, result.secure_url);

    // Get updated profile with completeness to return to frontend
    const profileWithCompleteness = await candidateService.getProfile(userId);

    res.status(200).json({
        success: true,
        message: 'Cập nhật ảnh đại diện thành công.',
        data: profileWithCompleteness,
    });
});

export const getMyApplications = asyncHandler(async (req, res) => {
    const userId = req.user._id;
    const options = req.validatedQuery || req.query;

    const result = await candidateService.getMyApplications(userId, options);

    res.status(200).json({
        success: true,
        message: 'Lấy danh sách đơn ứng tuyển thành công.',
        meta: result.meta,
        data: result.data,
        stats: result.stats
    });
});

export const getApplicationById = asyncHandler(async (req, res) => {
    const userId = req.user._id;
    const { applicationId } = req.params;

    const application = await candidateService.getApplicationById(userId, applicationId);

    res.status(200).json({
        success: true,
        message: 'Lấy chi tiết đơn ứng tuyển thành công.',
        data: application
    });
});

/**
 * Get CV data for rendering in iframe (for CV template type)
 * GET /api/candidate/my-applications/:applicationId/render-cv
 */
export const getApplicationCVData = asyncHandler(async (req, res) => {
    const userId = req.user._id;
    const { applicationId } = req.params;

    const cvData = await candidateService.getApplicationCVData(userId, applicationId);

    res.status(200).json({
        success: true,
        message: 'Lấy dữ liệu CV thành công.',
        data: cvData
    });
});

/**
 * Get profile completeness
 * GET /api/candidate/profile/completeness
 */
export const getProfileCompleteness = asyncHandler(async (req, res) => {
    const userId = req.user._id;
    const { recalculate } = req.validatedQuery || req.query;

    logger.info('Getting profile completeness', { userId, recalculate });

    const completeness = await candidateService.getProfileCompleteness(userId, recalculate);

    res.status(200).json({
        success: true,
        message: 'Lấy thông tin độ hoàn thiện hồ sơ thành công.',
        data: completeness
    });
});

/**
 * Update profile preferences (salary, locations, work preferences)
 * PUT /api/candidate/profile/preferences
 */
export const updateProfilePreferences = asyncHandler(async (req, res) => {
    const userId = req.user._id;
    const preferences = req.body;

    logger.info('Updating profile preferences', {
        userId,
        hasExpectedSalary: !!preferences.expectedSalary,
        hasPreferredLocations: !!preferences.preferredLocations,
        hasWorkPreferences: !!preferences.workPreferences,
        hasPreferredCategories: !!preferences.preferredCategories
    });

    const updatedProfile = await candidateService.updateProfilePreferences(userId, preferences);

    res.status(200).json({
        success: true,
        message: 'Cập nhật thông tin ưu tiên thành công.',
        data: updatedProfile
    });
});

/**
 * Get profile improvement recommendations
 * GET /api/candidate/profile/recommendations
 */
export const getProfileRecommendations = asyncHandler(async (req, res) => {
    const userId = req.user._id;

    logger.info('Getting profile recommendations', { userId });

    const recommendations = await candidateService.getProfileRecommendations(userId);

    res.status(200).json({
        success: true,
        message: 'Lấy gợi ý cải thiện hồ sơ thành công.',
        data: recommendations
    });
});

/**
 * Update privacy settings
 * PATCH /api/v1/candidates/settings/privacy
 */
export const updatePrivacySettings = asyncHandler(async (req, res) => {
    const userId = req.user._id;
    const { allowSearch } = req.body;

    logger.info('Updating privacy settings', { userId, allowSearch });

    const settings = await candidateService.updatePrivacySettings(userId, allowSearch);

    res.status(200).json({
        success: true,
        message: 'Cập nhật cài đặt riêng tư thành công.',
        data: settings
    });
});

/**
 * Toggle allow search setting with optional CV selection
 * PATCH /api/v1/candidates/settings/allow-search
 */
export const toggleAllowSearch = asyncHandler(async (req, res) => {
    const userId = req.user._id;
    const { allowSearch, selectedCvId } = req.body;

    logger.info('Toggling allow search setting', { userId, allowSearch, selectedCvId });

    const user = await candidateService.toggleAllowSearch(userId, allowSearch, selectedCvId);

    res.status(200).json({
        success: true,
        message: 'Cập nhật cài đặt cho phép tìm kiếm thành công.',
        data: {
            allowSearch: user.allowSearch,
            selectedCvId: user.selectedCvId
        }
    });
});

/**
 * Get current allow search settings
 * GET /api/v1/candidates/settings/allow-search
 */
export const getAllowSearchSettings = asyncHandler(async (req, res) => {
    const userId = req.user._id;

    const settings = await candidateService.getAllowSearchSettings(userId);

    res.status(200).json({
        success: true,
        message: 'Lấy cài đặt tìm kiếm thành công.',
        data: settings
    });
});

/**
 * Respond to offer (Accept/Decline)
 * PATCH /api/v1/candidates/my-applications/:applicationId/respond
 */
export const respondToOffer = asyncHandler(async (req, res) => {
    const userId = req.user._id;
    const { applicationId } = req.params;
    const { status } = req.body;

    logger.info('Candidate responding to offer', { userId, applicationId, status });

    const application = await candidateService.respondToOffer(userId, applicationId, status);

    res.status(200).json({
        success: true,
        message: status === 'ACCEPTED' ? 'Đã chấp nhận lời mời làm việc.' : 'Đã từ chối lời mời làm việc.',
        data: application
    });
});
