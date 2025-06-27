/**
 * User Controller
 * Handles user account management HTTP requests
 * @module UserController
 */

import { userService } from '../services/user.service.js';
import logger from '../utils/logger.js';

/**
 * Delete user account
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next middleware
 */
export const deleteUser = async (req, res, next) => {
  try {
    const { id } = req.params; // Corrected from userId to id to match route
    const requesterId = req.user.id;
    
    // Only allow users to delete their own account or admin to delete any account
    if (id !== requesterId && req.user.role !== 'ADMIN') {
      return res.status(403).json({
        success: false,
        message: 'Unauthorized to delete this account'
      });
    }
    
    await userService.deleteUser(id);
    
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
    const { id } = req.params; // Corrected from userId to id
    
    // This function should probably fetch generic, public user info
    // The specific getUserProfile service call might expose too much.
    // For now, let's assume there's a generic service for this.
    const user = await userService.getUserById(id);
    
    res.json({
      success: true,
      data: user
    });
  } catch (error) {
    next(error);
  }
};
