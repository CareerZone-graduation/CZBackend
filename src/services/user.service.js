import { User, CandidateProfile, RecruiterProfile, CoinRecharge } from '../models/index.js';
import { NotFoundError, BadRequestError } from '../utils/AppError.js';

/**
 * Get user profile by user ID.
 * @param {string} userId - The ID of the user.
 * @returns {Promise<Object>} The user and their profile.
 */
export const getUserProfile = async (userId) => {
  // Chỉ select những trường cần thiết từ User
  const user = await User.findById(userId)
    .select('_id email role active coinBalance isEmailVerified createdAt updatedAt')
    .lean();
  
  if (!user) {
    throw new NotFoundError('Không tìm thấy người dùng.');
  }

  let profile;
  if (user.role === 'candidate') {
    // Chỉ select những trường cần thiết cho candidate profile
    profile = await CandidateProfile.findOne({ userId })
      .select('_id fullname avatar phone bio skills educations experiences cvs createdAt updatedAt')
      .lean();
  } else if (user.role === 'recruiter') {
    // Chỉ select những trường cần thiết cho recruiter profile
    profile = await RecruiterProfile.findOne({ userId })
      .select('_id fullname company createdAt updatedAt')
      .lean();
  }

  if (!profile) {
    throw new NotFoundError('Không tìm thấy hồ sơ người dùng.');
  }

  return { user, profile };
};

/**
 * Change user password.
 * @param {string} userId - The ID of the user.
 * @param {string} currentPassword - The user's current password.
 * @param {string} newPassword - The new password.
 */
export const changePassword = async (userId, currentPassword, newPassword) => {
    const user = await User.findById(userId).select('+password');
    if (!user) {
        throw new NotFoundError('Không tìm thấy người dùng.');
    }

    const isMatch = await user.comparePassword(currentPassword);
    if (!isMatch) {
        throw new BadRequestError('Mật khẩu hiện tại không chính xác.');
    }

    user.password = newPassword;
    await user.save();
};

/**
 * Get user coin balance by user ID.
 * @param {string} userId - The ID of the user.
 * @returns {Promise<number>} The user's coin balance.
 */
export const getCoinBalance = async (userId) => {
  const user = await User.findById(userId).select('coinBalance').lean();
  if (!user) {
    throw new NotFoundError('Không tìm thấy người dùng.');
  }
  return user.coinBalance;
};

/**
 * Get coin recharge history for a user.
 * @param {string} userId - The ID of the user.
 * @param {object} query - The query parameters for pagination.
 * @returns {Promise<Object>} The user's coin recharge history.
 */
export const getRechargeHistory = async (userId, query) => {
    const { page = 1, limit = 10 } = query;
    const skip = (page - 1) * limit;

    const [data, total] = await Promise.all([
        CoinRecharge.find({ userId })
            .select('-__v -userId -metadata') // Loại bỏ các trường không cần thiết
            .sort({ createdAt: -1 })
            .skip(skip)
            .limit(Number(limit))
            .lean(),
        CoinRecharge.countDocuments({ userId }),
    ]);

    return {
        meta: {
            total,
            page: Number(page),
            limit: Number(limit),
            totalPages: Math.ceil(total / limit),
        },
        data,
    };
};

/**
 * Register a new device for FCM notifications.
 * @param {string} userId - The ID of the user.
 * @param {string} token - The FCM token.
 */
export const registerDevice = async (userId, token) => {
    if (!token) {
        throw new BadRequestError('Token is required.');
    }

    await User.updateOne(
        { _id: userId },
        { $addToSet: { fcmTokens: token } }
    );
};
