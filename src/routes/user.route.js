import express from 'express';
import { validateBody, validateParams } from '../middleware/validation.middleware.js';
import { authenticate, authorize, candidateOnly } from '../middleware/auth.middleware.js';
import { userProfileSchema, updateUserProfileSchema } from '../schemas/user.schema.js'; // Changed schema imports
import { idParamSchema } from '../schemas/common.schema.js';

// Import controllers
import {
  getUserProfile,
  updateUserProfile,
  uploadAvatar,
  deleteUser,
  getUserById
} from '../controllers/user.controller.js'; // Removed specific profile controllers

const router = express.Router();

/**
 * @route   GET /api/users/profile
 * @desc    Get current user profile
 * @access  Private
 */
router.get('/profile', authenticate, getUserProfile);

/**
 * @route   PUT /api/users/profile
 * @desc    Update current user profile
 * @access  Private
 */
router.put('/profile', authenticate, validateBody(updateUserProfileSchema), updateUserProfile); // Use updateUserProfileSchema

/**
 * @route   POST /api/users/avatar
 * @desc    Upload user avatar
 * @access  Private
 */
router.post('/avatar', authenticate, uploadAvatar);

/**
 * @route   GET /api/users/:id
 * @desc    Get user by ID (public profile)
 * @access  Public
 */
router.get('/:id', 
  validateParams(idParamSchema), 
  getUserById
);

/**
 * @route   DELETE /api/users/:id
 * @desc    Delete user account
 * @access  Private (Admin only or own account)
 */
router.delete('/:id', 
  authenticate, 
  validateParams(idParamSchema),
  deleteUser
);

export default router;
