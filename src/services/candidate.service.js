import { CandidateProfile, User, Application } from '../models/index.js';
import { NotFoundError, BadRequestError } from '../utils/AppError.js';
import logger from '../utils/logger.js';
import * as uploadService from './upload.service.js';
import { calculateProfileCompleteness, updateProfileCompleteness } from '../controllers/candidateOnboardingController.js';
import mongoose from 'mongoose';
import { logActivity } from './application.service.js';
import * as queueService from './queue.service.js';
import * as rabbitmq from '../queues/rabbitmq.js';

/**
 * Get candidate profile by user ID
 * @param {string} userId
 * @returns {Promise<Object>}
 */
export const getProfile = async (userId) => {
    const profile = await CandidateProfile.findOne({ userId: userId }).lean();
    if (!profile) {
        throw new NotFoundError('Không tìm thấy hồ sơ ứng viên.');
    }

    // Calculate and update profile completeness
    const completeness = calculateProfileCompleteness(profile);

    // Update in database if changed
    if (JSON.stringify(completeness) !== JSON.stringify(profile.profileCompleteness)) {
        await CandidateProfile.findByIdAndUpdate(
            profile._id,
            { $set: { profileCompleteness: completeness } },
            { new: true }
        );
        profile.profileCompleteness = completeness;
    }

    return profile;
};

/**
 * Update candidate profile (for PUT - partial update)
 * @param {string} userId
 * @param {Object} updateData
 * @returns {Promise<Object>}
 */
export const updateProfile = async (userId, updateData) => {
    const {
        fullname, phone, bio, skills, educations, experiences,
        address, website, linkedin, github, certificates, projects,
        expectedSalary, preferredLocations, workPreferences
    } = updateData;

    // Prepare data for database update - only set provided fields
    const profileUpdateData = {};
    if (fullname !== undefined) profileUpdateData.fullname = fullname;
    if (phone !== undefined) profileUpdateData.phone = phone;
    if (bio !== undefined) profileUpdateData.bio = bio;
    if (address !== undefined) profileUpdateData.address = address;
    if (website !== undefined) profileUpdateData.website = website;
    if (linkedin !== undefined) profileUpdateData.linkedin = linkedin;
    if (github !== undefined) profileUpdateData.github = github;
    if (skills !== undefined) profileUpdateData.skills = skills;
    if (educations !== undefined) profileUpdateData.educations = educations;
    if (experiences !== undefined) profileUpdateData.experiences = experiences;
    if (certificates !== undefined) profileUpdateData.certificates = certificates;
    if (projects !== undefined) profileUpdateData.projects = projects;
    if (expectedSalary !== undefined) profileUpdateData.expectedSalary = expectedSalary;
    if (preferredLocations !== undefined) profileUpdateData.preferredLocations = preferredLocations;
    if (workPreferences !== undefined) profileUpdateData.workPreferences = workPreferences;

    // Update the profile in CandidateProfile model (without .lean() to get _id)
    // Note: Don't use .select() here because it doesn't include nested array fields properly
    const updatedProfile = await CandidateProfile.findOneAndUpdate(
        { userId },
        { $set: profileUpdateData },
        { new: true, upsert: true, runValidators: true }
    );

    if (!updatedProfile) {
        throw new NotFoundError('Không tìm thấy hồ sơ để cập nhật.');
    }

    // Recalculate profile completeness after update
    await updateProfileCompleteness(updatedProfile._id);

    logger.info('Profile updated and completeness recalculated', {
        userId,
        updatedFields: Object.keys(profileUpdateData)
    });

    // Convert to plain object before returning
    return updatedProfile.toObject();
};

/**
 * Updates only the avatar for a candidate profile.
 * @param {string} userId
 * @param {string} avatarUrl
 * @returns {Promise<Object>}
 */
export const updateAvatar = async (userId, avatarUrl) => {
    const profile = await CandidateProfile.findOneAndUpdate(
        { userId: userId },
        { $set: { avatar: avatarUrl, userId } },
        { new: true, upsert: true }
    );

    // Recalculate profile completeness after avatar update
    await updateProfileCompleteness(profile._id);

    logger.info('Avatar updated and completeness recalculated', { userId });

    return profile.toObject();
};

/**
 * Upload a new CV for the candidate.
 * @param {string} userId
 * @param {object} file - The uploaded file object from multer.
 * @param {object} cvData - Additional data for the CV (e.g., name).
 * @returns {Promise<Object>}
 */
export const uploadCv = async (userId, file) => {
    if (!file) {
        throw new BadRequestError('Vui lòng cung cấp file CV.');
    }

    const uploadResult = await uploadService.uploadToCloudinary(file.buffer, 'cvs');

    let profile = await CandidateProfile.findOne({ userId });
    if (!profile) {
        // If profile doesn't exist, create one first
        profile = await CandidateProfile.create({ userId, cvs: [] });
    }

    // If this is the first CV, set it as default
    if (!profile.cvs) {
        profile.cvs = [];
    }
    const isDefault = profile.cvs.length === 0;

    const newCv = {
        _id: new mongoose.Types.ObjectId(),
        name: file.originalname, // Use the original filename as the CV name
        path: uploadResult.secure_url,
        cloudinaryId: uploadResult.public_id,
        isDefault: isDefault,
    };

    profile.cvs.push(newCv);
    await profile.save();

    return profile.cvs;
};

/**
 * Get all CVs for a candidate.
 * @param {string} userId
 * @returns {Promise<Array>}
 */
export const getCvs = async (userId) => {
    const profile = await CandidateProfile.findOne({ userId }).select('cvs').lean();
    logger.info(profile);
    if (!profile) {
        // If no profile, return empty array as they have no CVs
        return [];
    }
    return profile.cvs || [];
};

/**
 * Set a CV as the default.
 * @param {string} userId
 * @param {string} cvId
 * @returns {Promise<Array>}
 */
export const setDefaultCv = async (userId, cvId) => {
    const profile = await CandidateProfile.findOne({ userId });
    if (!profile) {
        throw new NotFoundError('Không tìm thấy hồ sơ ứng viên.');
    }

    let cvFound = false;
    profile.cvs.forEach(cv => {
        if (cv._id.toString() === cvId) {
            cv.isDefault = true;
            cvFound = true;
        } else {
            cv.isDefault = false;
        }
    });

    if (!cvFound) {
        throw new NotFoundError('Không tìm thấy CV.');
    }

    await profile.save();
    return profile.cvs;
};

/**
 * Delete a CV.
 * @param {string} userId
 * @param {string} cvId
 * @returns {Promise<Array>}
 */
export const deleteCv = async (userId, cvId) => {
    const profile = await CandidateProfile.findOne({ userId });
    if (!profile) {
        throw new NotFoundError('Không tìm thấy hồ sơ ứng viên.');
    }

    const cvToDelete = profile.cvs.find(cv => cv._id.toString() === cvId);
    if (!cvToDelete) {
        throw new NotFoundError('Không tìm thấy CV.');
    }

    // TODO: Implement deleteFromCloudinary in upload.service.js
    // if (cvToDelete.cloudinaryId) {
    //     await deleteFromCloudinary(cvToDelete.cloudinaryId);
    // }

    profile.cvs.pull({ _id: cvId });

    // If the deleted CV was the default and there are remaining CVs, set the first one as new default
    if (cvToDelete.isDefault && profile.cvs.length > 0) {
        profile.cvs[0].isDefault = true;
    }

    await profile.save();
    return profile.cvs;
};

/**
 * Đổi tên CV đã upload
 * @param {string} userId - ID của user
 * @param {string} cvId - ID của CV
 * @param {string} newName - Tên mới
 * @returns {Promise<Array>}
 */
export const renameCv = async (userId, cvId, newName) => {
    const profile = await CandidateProfile.findOne({ userId });
    if (!profile) {
        throw new NotFoundError('Không tìm thấy hồ sơ ứng viên.');
    }

    const cv = profile.cvs.find(cv => cv._id.toString() === cvId);
    if (!cv) {
        throw new NotFoundError('Không tìm thấy CV.');
    }

    cv.name = newName;
    await profile.save();
    return profile.cvs;
};

/**
 * Lấy danh sách các đơn ứng tuyển của candidate
 * @param {string} userId ID của user
 * @param {Object} options Các tùy chọn lọc và phân trang
 * @returns {Object} Object chứa mảng data và object meta
 */
export const getMyApplications = async (userId, options = {}) => {
    logger.info('Getting applications for candidate', { userId, options });

    // Lấy candidate profile để có candidateProfileId
    const candidateProfile = await CandidateProfile.findOne({ userId }).lean();
    if (!candidateProfile) {
        throw new NotFoundError('Không tìm thấy hồ sơ ứng viên.');
    }

    // Xử lý các options
    const page = options.page || 1;
    const limit = Math.min(options.limit || 10, 50); // Giới hạn tối đa 50 items per page
    const skip = (page - 1) * limit;

    // Xây dựng query filter
    const filter = { candidateProfileId: candidateProfile._id };

    if (options.status) {
        filter.status = options.status;
    }

    if (options.search) {
        // Search trong jobSnapshot.title và jobSnapshot.company
        filter.$or = [
            { 'jobSnapshot.title': { $regex: options.search, $options: 'i' } },
            { 'jobSnapshot.company': { $regex: options.search, $options: 'i' } }
        ];
    }

    // Xử lý sort
    let sortOptions = { appliedAt: -1 }; // Default sort by newest first
    if (options.sort) {
        const sortField = options.sort.startsWith('-')
            ? options.sort.substring(1)
            : options.sort;
        const sortDirection = options.sort.startsWith('-') ? -1 : 1;

        if (['appliedAt', 'lastStatusUpdateAt'].includes(sortField)) {
            sortOptions = { [sortField]: sortDirection };
        }
    }

    // Thực hiện truy vấn với pagination và thống kê
    const [applications, totalCount, statusCounts] = await Promise.all([
        Application.find(filter)
            .populate({
                path: 'jobId',
                select: 'title recruiterProfileId',
                populate: {
                    path: 'recruiterProfileId',
                    select: 'userId company.name'
                }
            })
            .sort(sortOptions)
            .skip(skip)
            .limit(limit)
            .lean(),
        Application.countDocuments(filter),
        Application.aggregate([
            { $match: { candidateProfileId: candidateProfile._id } },
            { $group: { _id: '$status', count: { $sum: 1 } } }
        ])
    ]);

    const stats = {
        PENDING: 0,
        SUITABLE: 0,
        SCHEDULED_INTERVIEW: 0,
        OFFER_SENT: 0,
        ACCEPTED: 0,
        REJECTED: 0,
        OFFER_DECLINED: 0
    };

    statusCounts.forEach(item => {
        if (stats.hasOwnProperty(item._id)) {
            stats[item._id] = item.count;
        }
    });

    const meta = {
        currentPage: page,
        totalPages: Math.ceil(totalCount / limit),
        totalItems: totalCount,
        limit
    }

    logger.info('Successfully retrieved applications for candidate', {
        userId,
        candidateProfileId: candidateProfile._id,
        totalCount,
        currentPageCount: applications.length
    });

    return { data: applications, meta, stats };
};

/**
 * Lấy chi tiết 1 đơn ứng tuyển của candidate
 * @param {string} userId ID của user
 * @param {string} applicationId ID của application
 * @returns {Object} Chi tiết đơn ứng tuyển
 */
export const getApplicationById = async (userId, applicationId) => {
    logger.info('Getting application details for candidate', { userId, applicationId });

    // Lấy candidate profile để có candidateProfileId
    const candidateProfile = await CandidateProfile.findOne({ userId }).lean();
    if (!candidateProfile) {
        throw new NotFoundError('Không tìm thấy hồ sơ ứng viên.');
    }

    // Tìm application và kiểm tra quyền sở hữu
    const application = await Application.findOne({
        _id: applicationId,
        candidateProfileId: candidateProfile._id
    })
        .select('jobId status appliedAt lastStatusUpdateAt coverLetter submittedCV jobSnapshot candidateName candidateEmail candidatePhone candidateRating notes activityHistory isReapplied previousApplicationId')
        .populate({
            path: 'jobId',
            select: 'recruiterProfileId',
            populate: {
                path: 'recruiterProfileId',
                select: 'userId'
            }
        })
        .lean();

    if (!application) {
        throw new NotFoundError('Không tìm thấy đơn ứng tuyển này.');
    }

    // Thêm recruiterId vào response để frontend có thể sử dụng cho tính năng nhắn tin
    const recruiterId = application.jobId?.recruiterProfileId?.userId;

    logger.info('Successfully retrieved application details for candidate', {
        userId,
        candidateProfileId: candidateProfile._id,
        applicationId,
        recruiterId
    });

    return {
        ...application,
        recruiterId,
        jobId: application.jobId?._id || application.jobId // Giữ lại jobId là string/ObjectId thay vì object
    };
};

/**
 * Get CV data from an application (for rendering CV template in iframe)
 * Only for CV template type, not uploaded CV
 * @param {string} userId - ID của user (candidate)
 * @param {string} applicationId - ID của application
 * @returns {Object} CV data for rendering
 */
export const getApplicationCVData = async (userId, applicationId) => {
    logger.info('Getting application CV data for candidate', { userId, applicationId });

    // Lấy candidate profile để có candidateProfileId
    const candidateProfile = await CandidateProfile.findOne({ userId }).lean();
    if (!candidateProfile) {
        throw new NotFoundError('Không tìm thấy hồ sơ ứng viên.');
    }

    // Tìm application và kiểm tra quyền sở hữu
    const application = await Application.findOne({
        _id: applicationId,
        candidateProfileId: candidateProfile._id
    }).lean();

    if (!application) {
        throw new NotFoundError('Không tìm thấy đơn ứng tuyển này.');
    }

    // Kiểm tra xem CV có phải là template không
    if (application.submittedCV?.source !== 'TEMPLATE') {
        throw new BadRequestError('CV này không phải là CV template. Vui lòng tải xuống file CV.');
    }

    // Kiểm tra có templateSnapshot không
    if (!application.submittedCV?.templateSnapshot) {
        throw new NotFoundError('Không tìm thấy dữ liệu CV template.');
    }

    logger.info('Successfully retrieved CV data for candidate', {
        userId,
        applicationId,
        templateId: application.submittedCV.templateId
    });

    return {
        cvName: application.submittedCV.name,
        templateId: application.submittedCV.templateId,
        cvData: application.submittedCV.templateSnapshot
    };
};

/**
 * Get profile completeness
 * @param {string} userId
 * @param {boolean} recalculate - Whether to force recalculation
 * @returns {Promise<Object>}
 */
export const getProfileCompleteness = async (userId, recalculate = false) => {
    const profile = await CandidateProfile.findOne({ userId });

    if (!profile) {
        throw new NotFoundError('Không tìm thấy hồ sơ ứng viên.');
    }

    // If recalculate is true or completeness is stale (older than 1 hour), recalculate
    const shouldRecalculate = recalculate ||
        !profile.profileCompleteness?.lastCalculated ||
        (Date.now() - new Date(profile.profileCompleteness.lastCalculated).getTime()) > 3600000;

    if (shouldRecalculate) {
        const completeness = await updateProfileCompleteness(profile._id, profile);
        return completeness;
    }

    return profile.profileCompleteness;
};

/**
 * Get profile improvement recommendations
 * @param {string} userId
 * @returns {Promise<Object>}
 */
export const getProfileRecommendations = async (userId) => {
    const profile = await CandidateProfile.findOne({ userId });

    if (!profile) {
        throw new NotFoundError('Không tìm thấy hồ sơ ứng viên.');
    }

    // Import the function from onboarding service
    const { getProfileImprovementRecommendations } = await import('../services/onboarding.service.js');

    const recommendations = getProfileImprovementRecommendations(profile);

    logger.info('Profile recommendations generated', {
        userId,
        completeness: recommendations.completeness,
        totalRecommendations: recommendations.summary.total
    });

    return recommendations;
};

/**
 * Update profile preferences (salary, locations, work preferences)
 * @param {string} userId
 * @param {Object} preferences
 * @returns {Promise<Object>}
 */
export const updateProfilePreferences = async (userId, preferences) => {
    const profile = await CandidateProfile.findOne({ userId });

    if (!profile) {
        throw new NotFoundError('Không tìm thấy hồ sơ ứng viên.');
    }

    // Update expected salary
    if (preferences.expectedSalary) {
        profile.expectedSalary = {
            ...profile.expectedSalary,
            ...preferences.expectedSalary
        };
    }

    // Update preferred locations
    if (preferences.preferredLocations !== undefined) {
        profile.preferredLocations = preferences.preferredLocations;
    }

    // Update work preferences
    if (preferences.workPreferences) {
        if (!profile.workPreferences) {
            profile.workPreferences = {};
        }

        if (preferences.workPreferences.workTypes) {
            profile.workPreferences.workTypes = preferences.workPreferences.workTypes;
        }

        if (preferences.workPreferences.contractTypes) {
            profile.workPreferences.contractTypes = preferences.workPreferences.contractTypes;
        }

        if (preferences.workPreferences.experienceLevel) {
            profile.workPreferences.experienceLevel = preferences.workPreferences.experienceLevel;
        }
    }

    // Update preferred categories (remove duplicates)
    if (preferences.preferredCategories !== undefined) {
        profile.preferredCategories = [...new Set(preferences.preferredCategories)];
    }

    await profile.save({ validateModifiedOnly: true });

    // Recalculate profile completeness after update
    await updateProfileCompleteness(profile._id, profile);

    logger.info('Profile preferences updated', {
        userId,
        hasExpectedSalary: !!preferences.expectedSalary,
        hasPreferredLocations: !!preferences.preferredLocations,
        hasWorkPreferences: !!preferences.workPreferences,
        hasPreferredCategories: !!preferences.preferredCategories
    });

    return profile;
};

/**
 * Update privacy settings (allowSearch)
 * @param {string} userId
 * @param {boolean} allowSearch
 * @returns {Promise<Object>}
 */
export const updatePrivacySettings = async (userId, allowSearch) => {
    const user = await User.findById(userId);

    if (!user) {
        throw new NotFoundError('Không tìm thấy người dùng.');
    }

    if (user.role !== 'candidate') {
        throw new BadRequestError('Chỉ ứng viên mới có thể cập nhật cài đặt này.');
    }

    user.allowSearch = allowSearch;
    await user.save();

    logger.info('Privacy settings updated', {
        userId,
        allowSearch
    });

    return {
        allowSearch: user.allowSearch,
        updatedAt: user.updatedAt
    };
};

/**
 * Toggle allow search setting with optional CV selection
 * @param {string} userId
 * @param {boolean} allowSearch
 * @param {string} selectedCvId - Optional CV ID to use for job search
 * @returns {Promise<Object>}
 */
export const toggleAllowSearch = async (userId, allowSearch, selectedCvId = null) => {
    const user = await User.findById(userId);

    if (!user) {
        throw new NotFoundError('Không tìm thấy người dùng.');
    }

    if (user.role !== 'candidate') {
        throw new BadRequestError('Chỉ ứng viên mới có thể cập nhật cài đặt này.');
    }

    // Nếu bật tìm việc và có chọn CV
    if (allowSearch && selectedCvId) {
        // Kiểm tra CV có tồn tại không
        const profile = await CandidateProfile.findOne({ userId });
        if (!profile) {
            throw new NotFoundError('Không tìm thấy hồ sơ ứng viên.');
        }

        const cvExists = profile.cvs.some(cv => cv._id.toString() === selectedCvId);
        if (!cvExists) {
            throw new BadRequestError('CV được chọn không tồn tại.');
        }

        user.selectedCvId = selectedCvId;
    } else if (!allowSearch) {
        // Nếu tắt tìm việc, xóa CV đã chọn
        user.selectedCvId = null;
    }

    user.allowSearch = allowSearch;
    await user.save();

    logger.info('Allow search setting toggled', {
        userId,
        allowSearch,
        selectedCvId: user.selectedCvId
    });

    return user;
};

/**
 * Get current allow search settings
 * @param {string} userId
 * @returns {Promise<Object>}
 */
export const getAllowSearchSettings = async (userId) => {
    const user = await User.findById(userId).select('allowSearch selectedCvId');
    if (!user) {
        throw new NotFoundError('Không tìm thấy người dùng.');
    }

    // Nếu có selectedCvId, lấy thông tin CV
    let selectedCv = null;
    if (user.selectedCvId) {
        const profile = await CandidateProfile.findOne({ userId }).select('cvs');
        if (profile) {
            selectedCv = profile.cvs.find(cv => cv._id.toString() === user.selectedCvId.toString());
        }
    }

    return {
        allowSearch: user.allowSearch,
        selectedCvId: user.selectedCvId,
        selectedCv: selectedCv ? {
            _id: selectedCv._id,
            name: selectedCv.name,
            uploadedAt: selectedCv.uploadedAt
        } : null
    };
};

/**
 * Candidate responds to an offer
 * @param {string} userId
 * @param {string} applicationId
 * @param {string} status - ACCEPTED or OFFER_DECLINED
 * @returns {Promise<Object>}
 */
export const respondToOffer = async (userId, applicationId, status) => {
    // 1. Get candidate profile
    const candidateProfile = await CandidateProfile.findOne({ userId });
    if (!candidateProfile) {
        throw new NotFoundError('Không tìm thấy hồ sơ ứng viên.');
    }

    // 2. Get application
    const application = await Application.findOne({
        _id: applicationId,
        candidateProfileId: candidateProfile._id
    }).populate('jobId');

    if (!application) {
        throw new NotFoundError('Không tìm thấy đơn ứng tuyển.');
    }

    // 3. Verify current status
    if (application.status !== 'OFFER_SENT') {
        throw new BadRequestError('Bạn chỉ có thể phản hồi khi đơn ứng tuyển đang ở trạng thái "Đã gửi lời mời".');
    }

    // 4. Update status
    if (status === 'ACCEPTED' || status === 'OFFER_DECLINED') {
        application.status = status;
        application.lastStatusUpdateAt = new Date();
    }

    // 5. Log activity
    // Map ACCEPTED status to OFFER_ACCEPTED action for activity log
    const action = status === 'ACCEPTED' ? 'OFFER_ACCEPTED' : 'OFFER_DECLINED';
    const detail = status === 'ACCEPTED'
        ? 'Ứng viên đã chấp nhận lời mời làm việc'
        : 'Ứng viên đã từ chối lời mời làm việc';

    logActivity(application, action, detail);

    await application.save();

    // 6. Send notification to recruiter
    const job = application.jobId;
    if (job && job.recruiterProfileId) {
        queueService.publishNotification(rabbitmq.ROUTING_KEYS.STATUS_UPDATE, {
            type: action,
            recipientId: job.recruiterProfileId.toString(),
            data: {
                applicationId: application._id.toString(),
                status: status
            }
        });
    }

    return application;
};
