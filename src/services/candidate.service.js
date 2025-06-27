import CandidateProfile from '../models/CandidateProfile.js';
import User from '../models/User.js';
import { NotFoundError } from '../utils/AppError.js';

/**
 * Get candidate profile by user ID
 * @param {string} userId
 * @returns {Promise<Object>}
 */
const getProfile = async (userId) => {
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
    profile.email = profile.userId.email;
    profile.fullname = profile.userId.fullname;
    profile.userId = profile.userId._id;

    return profile;
};

/**
 * Update candidate profile
 * @param {string} userId
 * @param {Object} updateData
 * @returns {Promise<Object>}
 */
const updateProfile = async (userId, updateData) => {
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
const updateAvatar = async (userId, avatarUrl) => {
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

export {
    getProfile,
    updateProfile,
    updateAvatar,
};
