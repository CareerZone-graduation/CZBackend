/**
 * User Service
 * Handles user profile management and related operations
 * @module UserService
 */

import { User, UserCV } from '../models/index.js';
import logger from '../utils/logger.js';
import bcrypt from 'bcryptjs';

/**
 * Get user profile by ID
 * @param {string} userId - User ID
 * @param {string} requesterId - ID of the user making the request
 * @returns {Promise<Object>} User profile
 */
export const getUserProfile = async (userId, requesterId = null) => {
  try {
    const user = await User.findById(userId).select('-password -refreshTokens');
    if (!user) {
      throw new Error('User not found');
    }

    let profile = null;
    switch (user.role) {
      case 'CANDIDATE':
        profile = await User.findOne({ user: userId });
        break;
      case 'RECRUITER':
        profile = await User.findOne({ user: userId }).populate('company');
        break;
      case 'ADMIN':
        profile = await User.findOne({ user: userId });
        break;
    }

    return {
      user,
      profile
    };
  } catch (error) {
    logger.error('Get user profile failed:', error);
    throw error;
  }
};

/**
 * Update user profile
 * @param {string} userId - User ID
 * @param {Object} profileData - Profile data to update
 * @returns {Promise<Object>} Updated profile
 */
export const updateUserProfile = async (userId, profileData) => {
  try {
    const user = await User.findById(userId);
    if (!user) {
      throw new Error('User not found');
    }

    // Update user basic info
    const { email, phone, bio, profilePicture, ...roleSpecificData } = profileData;
    
    if (email) user.email = email;
    if (phone) user.phone = phone;
    if (bio) user.bio = bio;
    if (profilePicture) user.profilePicture = profilePicture;

    await user.save();

    // Update role-specific profile
    let profile = null;
    switch (user.role) {
      case 'CANDIDATE':
        profile = await User.findOneAndUpdate(
          { user: userId },
          roleSpecificData,
          { new: true, upsert: true }
        );
        break;
      case 'RECRUITER':
        profile = await User.findOneAndUpdate(
          { user: userId },
          roleSpecificData,
          { new: true, upsert: true }
        );
        break;
      case 'ADMIN':
        profile = await User.findOneAndUpdate(
          { user: userId },
          roleSpecificData,
          { new: true, upsert: true }
        );
        break;
    }

    logger.info(`User profile updated: ${userId}`);

    return { user, profile };
  } catch (error) {
    logger.error('Update user profile failed:', error);
    throw error;
  }
};

/**
 * Upload profile picture
 * @param {string} userId - User ID
 * @param {Object} file - File object
 * @returns {Promise<Object>} Upload result
 */
export const uploadProfilePicture = async (userId, file) => {
  try {
    const user = await User.findById(userId);
    if (!user) {
      throw new Error('User not found');
    }

    // Delete old profile picture if exists
    if (user.profilePicture) {
      await cloudinaryService.deleteFile(user.profilePicture);
    }

    // Upload new profile picture
    const uploadResult = await cloudinaryService.uploadFile(file, {
      folder: 'profile-pictures',
      transformation: [
        { width: 200, height: 200, crop: 'fill' },
        { quality: 'auto' }
      ]
    });

    // Update user profile picture URL
    user.profilePicture = uploadResult.secure_url;
    await user.save();

    logger.info(`Profile picture uploaded for user: ${userId}`);

    return {
      profilePicture: uploadResult.secure_url
    };
  } catch (error) {
    logger.error('Upload profile picture failed:', error);
    throw error;
  }
};

/**
 * Change password
 * @param {string} userId - User ID
 * @param {string} currentPassword - Current password
 * @param {string} newPassword - New password
 * @returns {Promise<Object>} Success result
 */
export const changePassword = async (userId, currentPassword, newPassword) => {
  try {
    const user = await User.findById(userId);
    if (!user) {
      throw new Error('User not found');
    }

    // Verify current password
    const isCurrentPasswordValid = await bcrypt.compare(currentPassword, user.password);
    if (!isCurrentPasswordValid) {
      throw new Error('Current password is incorrect');
    }

    // Hash new password
    const saltRounds = 12;
    const hashedNewPassword = await bcrypt.hash(newPassword, saltRounds);

    // Update password
    user.password = hashedNewPassword;
    user.passwordChangedAt = new Date();
    await user.save();

    logger.info(`Password changed for user: ${userId}`);

    return { message: 'Password changed successfully' };
  } catch (error) {
    logger.error('Change password failed:', error);
    throw error;
  }
};

/**
 * Get user list with filters and pagination
 * @param {Object} filters - Filter options
 * @param {Object} pagination - Pagination options
 * @returns {Promise<Object>} Users list
 */
export const getUserList = async (filters = {}, pagination = {}) => {
  try {
    const { role, isActive, search } = filters;
    const { page = 1, limit = 20, sortBy = 'createdAt', sortOrder = 'desc' } = pagination;

    // Build query
    const query = {};
    
    if (role) {
      query.role = role;
    }

    if (typeof isActive === 'boolean') {
      query.isActive = isActive;
    }

    if (search) {
      query.$or = [
        { username: { $regex: search, $options: 'i' } },
        { email: { $regex: search, $options: 'i' } },
        { fullName: { $regex: search, $options: 'i' } }
      ];
    }

    const skip = (page - 1) * limit;
    const sort = { [sortBy]: sortOrder === 'desc' ? -1 : 1 };

    const [users, totalCount] = await Promise.all([
      User.find(query)
        .select('-password -refreshTokens')
        .sort(sort)
        .skip(skip)
        .limit(limit),
      User.countDocuments(query)
    ]);

    const totalPages = Math.ceil(totalCount / limit);

    return {
      users,
      pagination: {
        currentPage: page,
        totalPages,
        totalCount,
        hasNext: page < totalPages,
        hasPrev: page > 1
      }
    };
  } catch (error) {
    logger.error('Get user list failed:', error);
    throw error;
  }
};

/**
 * Deactivate user
 * @param {string} userId - User ID
 * @returns {Promise<Object>} Deactivation result
 */
export const deactivateUser = async (userId) => {
  try {
    const user = await User.findByIdAndUpdate(
      userId,
      { isActive: false, deactivatedAt: new Date() },
      { new: true }
    );

    if (!user) {
      throw new Error('User not found');
    }

    logger.info(`User deactivated: ${userId}`);

    return { message: 'User deactivated successfully' };
  } catch (error) {
    logger.error('Deactivate user failed:', error);
    throw error;
  }
};

/**
 * Activate user
 * @param {string} userId - User ID
 * @returns {Promise<Object>} Activation result
 */
export const activateUser = async (userId) => {
  try {
    const user = await User.findByIdAndUpdate(
      userId,
      { isActive: true, $unset: { deactivatedAt: 1 } },
      { new: true }
    );

    if (!user) {
      throw new Error('User not found');
    }

    logger.info(`User activated: ${userId}`);

    return { message: 'User activated successfully' };
  } catch (error) {
    logger.error('Activate user failed:', error);
    throw error;
  }
};

/**
 * Get user statistics
 * @returns {Promise<Object>} User statistics
 */
export const getUserStatistics = async () => {
  try {
    const [
      totalUsers,
      activeUsers,
      candidateCount,
      recruiterCount,
      adminCount,
      recentUsers
    ] = await Promise.all([
      User.countDocuments(),
      User.countDocuments({ isActive: true }),
      User.countDocuments({ role: 'CANDIDATE' }),
      User.countDocuments({ role: 'RECRUITER' }),
      User.countDocuments({ role: 'ADMIN' }),
      User.find({ isActive: true })
        .select('-password -refreshTokens')
        .sort({ createdAt: -1 })
        .limit(10)
    ]);

    return {
      totalUsers,
      activeUsers,
      inactiveUsers: totalUsers - activeUsers,
      roleDistribution: {
        candidates: candidateCount,
        recruiters: recruiterCount,
        admins: adminCount
      },
      recentUsers
    };
  } catch (error) {
    logger.error('Get user statistics failed:', error);
    throw error;
  }
};

/**
 * Search users
 * @param {string} query - Search query
 * @param {Object} filters - Additional filters
 * @returns {Promise<Array>} Search results
 */
export const searchUsers = async (query, filters = {}) => {
  try {
    const { role, limit = 10 } = filters;

    const searchQuery = {
      $or: [
        { username: { $regex: query, $options: 'i' } },
        { email: { $regex: query, $options: 'i' } },
        { fullName: { $regex: query, $options: 'i' } }
      ],
      isActive: true
    };

    if (role) {
      searchQuery.role = role;
    }

    const users = await User.find(searchQuery)
      .select('username email fullName profilePicture role')
      .limit(limit);

    return users;
  } catch (error) {
    logger.error('Search users failed:', error);
    throw error;
  }
};

// Export as named export for services index
export const userService = {
  getUserProfile,
  updateUserProfile,
  uploadProfilePicture,
  changePassword,
  getUserList,
  deactivateUser,
  activateUser,
  getUserStatistics,
  searchUsers
};
