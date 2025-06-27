import CandidateProfile from '../models/CandidateProfile.js';
import User from '../models/User.js';
import { NotFoundError, BadRequestError } from '../utils/AppError.js';
import logger from '../utils/logger.js';
import { uploadToCloudinary } from './upload.service.js';
import mongoose from 'mongoose';

/**
 * Get candidate profile by user ID
 * @param {string} userId
 * @returns {Promise<Object>}
 */
export const getProfile = async (userId) => {
    // Use .lean() to get a plain JavaScript object
    let profile = await CandidateProfile.findOne({ userId: userId }).populate('userId', 'fullname email').lean();

    if (!profile) {
        const user = await User.findById(userId).lean();
        if (!user || user.role !== 'candidate') {
            throw new NotFoundError('Không tìm thấy ứng viên.');
        }
        // Return a default structure if profile is empty but user exists
        return {
            userId: user._id,
            email: user.email,
            fullname: user.fullname,
            // other fields are empty
        };
    }

    // Flatten the response
    if (profile.userId) {
        profile.email = profile.userId.email;
        profile.fullname = profile.userId.fullname;
        profile.userId = profile.userId._id;
    }

    return profile;
};

/**
 * Update candidate profile
 * @param {string} userId
 * @param {Object} updateData
 * @returns {Promise<Object>}
 */
export const updateProfile = async (userId, updateData) => {
    const { fullname, ...profileData } = updateData;

    // Start a transaction if we need to update both User and CandidateProfile
    const session = await User.startSession();
    session.startTransaction();
    try {
        // Update fullname in User model if provided
        if (fullname) {
            await User.findByIdAndUpdate(userId, { fullname }, { session, new: true });
        }

        // Update the rest of the data in CandidateProfile model
        let profile = await CandidateProfile.findOneAndUpdate(
            { userId: userId },
            { $set: { ...profileData, userId } }, // Ensure userId is set on upsert
            { new: true, upsert: true, session }
        ).populate('userId', 'fullname email').lean();
        
        // Flatten the response after update
        if (profile && profile.userId) {
            profile.email = profile.userId.email;
            profile.fullname = profile.userId.fullname;
            profile.userId = profile.userId._id;
        }

        await session.commitTransaction();
        session.endSession();

        return profile;
    } catch (error) {
        await session.abortTransaction();
        session.endSession();
        throw error;
    }
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
    ).populate('userId', 'fullname email').lean();

    // Flatten the response
    if (profile && profile.userId) {
        profile.email = profile.userId.email;
        profile.fullname = profile.userId.fullname;
        profile.userId = profile.userId._id;
    }

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

    const uploadResult = await uploadToCloudinary(file.buffer, 'cvs');

    let profile = await CandidateProfile.findOne({ userId });
    if (!profile) {
        // If profile doesn't exist, create one first
        profile = await CandidateProfile.create({ userId, cvs: [] });
    }

    // If this is the first CV, set it as default
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
