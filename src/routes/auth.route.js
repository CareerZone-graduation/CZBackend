import express from 'express';
import { validateBody } from '../middleware/validation.middleware.js';
import { authenticate, optionalAuthenticate } from '../middleware/auth.middleware.js';
import { 
  loginSchema, 
  registerSchema, 
  googleLoginSchema 
} from '../schemas/auth.schema.js';

// Import controllers (to be created)
import {
  register,
  login,
  logout,
  googleLogin,
  refreshToken,
  verifyToken,
  forgotPassword,
  resetPassword,
  changePassword,
  getMe
} from '../controllers/auth.controller.js';

const router = express.Router();

/**
 * @route   POST /api/auth/register
 * @desc    Register a new user
 * @access  Public
 */
router.post('/register', validateBody(registerSchema), register);

/**
 * @route   POST /api/auth/login
 * @desc    Login user
 * @access  Public
 */
router.post('/login', validateBody(loginSchema), login);

/**
 * @route   POST /api/auth/logout
 * @desc    Logout user
 * @access  Private
 */
router.post('/logout', logout);

/**
 * @route   POST /api/auth/google
 * @desc    Google OAuth login
 * @access  Public
 */
router.post('/google', validateBody(googleLoginSchema), googleLogin);

/**
 * @route   POST /api/auth/refresh
 * @desc    Refresh access token
 * @access  Public
 */
router.post('/refresh', refreshToken);

/**
 * @route   GET /api/auth/verify
 * @desc    Verify token validity
 * @access  Private
 */
router.get('/verify', authenticate, verifyToken);

/**
 * @route   POST /api/auth/forgot-password
 * @desc    Send password reset email
 * @access  Public
 */
router.post('/forgot-password', forgotPassword);

/**
 * @route   POST /api/auth/reset-password
 * @desc    Reset password with token
 * @access  Public
 */
router.post('/reset-password', resetPassword);

/**
 * @route   PUT /api/auth/change-password
 * @desc    Change password (authenticated user)
 * @access  Private
 */
router.put('/change-password', authenticate, changePassword);

/**
 * @route   GET /api/auth/me
 * @desc    Get current user info
 * @access  Private
 */
router.get('/me', authenticate, getMe);

export default router;
