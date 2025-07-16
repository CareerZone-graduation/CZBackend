import express from 'express';
import * as validationMiddleware from '../middleware/validation.middleware.js';
import * as authMiddleware from '../middleware/auth.middleware.js';
import * as authSchema from '../schemas/auth.schema.js';

// Import controllers
import * as authController from '../controllers/auth.controller.js';

const router = express.Router();

/**
 * @route   POST /api/auth/register
 * @desc    Register a new user
 * @access  Public
 */
router.post('/register', validationMiddleware.validateBody(authSchema.registerSchema), authController.register);

/**
 * @route   POST /api/auth/login
 * @desc    Login user
 * @access  Public
 */
router.post('/login', validationMiddleware.validateBody(authSchema.loginSchema), authController.login);

/**
 * @route   POST /api/auth/logout
 * @desc    Logout user
 * @access  Private
 */
router.post('/logout', authMiddleware.authenticate, authController.logout);

/**
 * @route   POST /api/auth/refresh-token
 * @desc    Refresh access token
 * @access  Public
 */
router.post('/refresh', authController.refreshToken);

/**
 * @route   POST /api/auth/verify-email
 * @desc    Verify user's email address
 * @access  Public
 */
router.post('/verify-email', validationMiddleware.validateQuery(authSchema.verifyEmailSchema), authController.verifyEmail);

/**
 * @route   PATCH /api/auth/reset-password/:token
 * @desc    Reset password with token
 * @access  Public
 */
router.patch('/reset-password/:token', validationMiddleware.validateBody(authSchema.resetPasswordSchema), authController.resetPassword);

/**
 * @route   PATCH /api/auth/change-password
 * @desc    Change password (authenticated user)
 * @access  Private
 */
router.patch('/change-password', authMiddleware.authenticate, validationMiddleware.validateBody(authSchema.changePasswordSchema), authController.changePassword);

/**
 * @route   GET /api/auth/me
 * @desc    Get current user info
 * @access  Private
 */
router.get('/me', authMiddleware.authenticate, authController.getMe);

/**
 * @route   POST /api/auth/google
 * @desc    Google OAuth login
 * @access  Public
 */
router.post('/google', validationMiddleware.validateBody(authSchema.googleLoginSchema), authController.googleLogin);


export default router;
