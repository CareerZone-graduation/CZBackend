import express from 'express';
import { validateBody, validateParams } from '../middleware/validation.middleware.js';
import { authenticate, authorize, candidateOnly } from '../middleware/auth.middleware.js';
import { userProfileSchema, updateUserProfileSchema } from '../schemas/user.schema.js'; // Changed schema imports
import { idParamSchema } from '../schemas/common.schema.js';

// Import controllers
import {
  deleteUser,
  getUserById
} from '../controllers/user.controller.js';

const router = express.Router();

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
