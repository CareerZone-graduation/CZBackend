import { CandidateProfile, User, Application } from '../models/index.js';
import { NotFoundError, BadRequestError } from '../utils/AppError.js';
import logger from '../utils/logger.js';
import * as uploadService from './upload.service.js';
import mongoose from 'mongoose';

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
    return profile;
};

/**
 * Update candidate profile (for PUT - partial update)
 * @param {string} userId
 * @param {Object} updateData
 * @returns {Promise<Object>}
 */
export const updateProfile = async (userId, updateData) => {
    const { fullname, phone, bio, skills, educations, experiences } = updateData;

    // Prepare data for database update - only set provided fields
    const profileUpdateData = {};
    if (fullname !== undefined) profileUpdateData.fullname = fullname;
    if (phone !== undefined) profileUpdateData.phone = phone;
    if (bio !== undefined) profileUpdateData.bio = bio;
    if (skills !== undefined) profileUpdateData.skills = skills;
    if (educations !== undefined) profileUpdateData.educations = educations;
    if (experiences !== undefined) profileUpdateData.experiences = experiences;

    // Update the profile in CandidateProfile model
    const updatedProfile = await CandidateProfile.findOneAndUpdate(
        { userId },
        { $set: profileUpdateData },
        { new: true, upsert: true, runValidators: true }
    ).select('fullname avatar phone bio skills educations experiences createdAt updatedAt')
        .lean();

    if (!updatedProfile) {
        throw new NotFoundError('Không tìm thấy hồ sơ để cập nhật.');
    }

    return updatedProfile;
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
    )
        .select('fullname avatar phone bio skills educations experiences createdAt updatedAt').lean();

    return profile;
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

    // Thực hiện truy vấn với pagination
    const [applications, totalCount] = await Promise.all([
        Application.find(filter)
            .select('jobId status appliedAt lastStatusUpdateAt coverLetter submittedCV jobSnapshot candidateName candidateEmail candidatePhone')
            .sort(sortOptions)
            .skip(skip)
            .limit(limit)
            .lean(),
        Application.countDocuments(filter)
    ]);

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

    return { data: applications, meta };
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
        .lean();

    if (!application) {
        throw new NotFoundError('Không tìm thấy đơn ứng tuyển này.');
    }

    logger.info('Successfully retrieved application details for candidate', {
        userId,
        candidateProfileId: candidateProfile._id,
        applicationId
    });

    return application;
};
