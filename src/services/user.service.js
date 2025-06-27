/**
 * User Service
 * Handles user account management and related operations
 * @module UserService
 */

import { User } from '../models/index.js';
import logger from '../utils/logger.js';
import bcrypt from 'bcryptjs';
import { NotFoundError } from '../utils/AppError.js';


/**
 * Get user by ID
 * @param {string} userId - User ID
 * @returns {Promise<Object>} User's public data
 */
export const getUserById = async (userId) => {
    const user = await User.findById(userId).select('-password -refreshTokens');
    if (!user) {
        throw new NotFoundError('User not found');
    }
    return user;
};


/**
 * Delete user account
 * @param {string} userId - User ID
 * @returns {Promise<void>}
 */
export const deleteUser = async (userId) => {
    const user = await User.findByIdAndDelete(userId);
    if (!user) {
        throw new NotFoundError('User not found');
    }
    // In a real app, you might want to also delete related data
    // e.g., CandidateProfile, RecruiterProfile, etc.
    logger.info(`User account deleted: ${userId}`);
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
      throw new NotFoundError('User not found');
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
      throw new NotFoundError('User not found');
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
      throw new NotFoundError('User not found');
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
  getUserById,
  deleteUser,
  changePassword,
  getUserList,
  deactivateUser,
  activateUser,
  getUserStatistics,
  searchUsers
};
