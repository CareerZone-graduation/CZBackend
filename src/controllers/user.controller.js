/**
 * User Controller
 * Handles user profile and account management HTTP requests
 * @module UserController
 */

import { userService } from '../services/user.service.js';
import logger from '../utils/logger.js';

/**
 * Get user profile
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next middleware
 */
export const getUserProfile = async (req, res, next) => {
  try {
    const userId = req.params.userId || req.user.id;
    const requesterId = req.user.id;
    
    const profile = await userService.getUserProfile(userId, requesterId);
    
    res.json({
      success: true,
      data: profile
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Update user profile
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next middleware
 */
export const updateUserProfile = async (req, res, next) => {
  try {
    logger.info('Updating user profile', req.body);
    const userId = req.user.id;
    logger.info(userId);
    const profile = await userService.updateUserProfile(userId, req.body);
    
    res.json({
      success: true,
      message: 'Profile updated successfully',
      data: profile
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Get candidate profile
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next middleware
 */
export const getCandidateProfile = async (req, res, next) => {
  try {
    const { userId } = req.params;
    const profile = await userService.getCandidateProfile(userId);
    
    res.json({
      success: true,
      data: profile
    });
  } catch (error) {
    next(error);
  }
};

export const updateCandidateProfile = async (req, res, next) => {
  try {
    console.log('Updating candidate profile', req.body);
    const candidateId = req.user.profileId;
    const profile = await userService.updateCandidateProfile(candidateId, req.body);
    
    res.json({
      success: true,
      message: 'Candidate profile updated successfully',
      data: profile
    });
  } catch (error) {
    next(error);
  }
};


export const getRecruiterProfile = async (req, res, next) => {
  try {
    const { userId } = req.params;
    const profile = await userService.getRecruiterProfile(userId);
    
    res.json({
      success: true,
      data: profile
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Update recruiter profile
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next middleware
 */
export const updateRecruiterProfile = async (req, res, next) => {
  try {
    const recruiterId = req.user.profileId;
    const profile = await userService.updateRecruiterProfile(recruiterId, req.body);
    
    res.json({
      success: true,
      message: 'Recruiter profile updated successfully',
      data: profile
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Upload avatar/profile picture
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next middleware
 */
export const uploadAvatar = async (req, res, next) => {
  try {
    const userId = req.user.id;
    
    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: 'No image file provided'
      });
    }
    
    const result = await userService.uploadProfilePicture(userId, req.file);
    
    res.json({
      success: true,
      message: 'Profile picture uploaded successfully',
      data: result
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Delete user account
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next middleware
 */
export const deleteUser = async (req, res, next) => {
  try {
    const { userId } = req.params;
    const requesterId = req.user.id;
    
    // Only allow users to delete their own account or admin to delete any account
    if (userId !== requesterId && req.user.role !== 'ADMIN') {
      return res.status(403).json({
        success: false,
        message: 'Unauthorized to delete this account'
      });
    }
    
    await userService.deleteUser(userId);
    
    res.json({
      success: true,
      message: 'User account deleted successfully'
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Get user by ID
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next middleware
 */
export const getUserById = async (req, res, next) => {
  try {
    const { userId } = req.params;
    const requesterId = req.user.id;
    
    const profile = await userService.getUserProfile(userId, requesterId);
    
    res.json({
      success: true,
      data: profile
    });
  } catch (error) {
    next(error);
  }
};
