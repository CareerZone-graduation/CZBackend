import { authService } from "../services/auth.service.js"; // Revert to importing authService object
import { User } from "../models/User.js";
import config from "../config/index.js";
import crypto from "crypto";
import logger from "../utils/logger.js";

export const register = async (req, res, next) => {
  try {
    const {refreshToken, ...userData } = await authService.register(req.body);

     res.cookie('refreshToken', refreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'Lax',
      maxAge: 999999999,
    });

      res.status(201).json({
      success: true,
      message: "User registered successfully",
      data: userData,
    });
  } catch (error) {
    next(error);
  }
};

export const login = async (req, res, next) => {
  try {
    const { username, password } = req.body;
    const {refreshToken, ...userData } = await authService.login(
      username,
      password
    );

    // res.cookie('accessToken', accessToken, {
    //   httpOnly: true,
    //   secure: process.env.NODE_ENV === 'production',
    //   sameSite: 'Lax',
    //   maxAge: 999999999,
    // });

    res.cookie('refreshToken', refreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'Lax',
      maxAge: 999999999,
    });

    res.json({
      success: true,
      message: 'Login successful',
      data: userData,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Refresh access token
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next middleware
 */
export const refreshToken = async (req, res, next) => {
  try {
    const refreshToken = req.cookies.refreshToken;
    const tokens = await authService.refreshToken(refreshToken);

    res.json({
      success: true,
      message: "Token refreshed successfully",
      data: tokens,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Logout user
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next middleware
 */
export const logout = async (req, res, next) => {
  try {
    // const { refreshToken } = req.body;
// get from cookies
    const refreshToken = req.cookies.refreshToken;
    await authService.logout(refreshToken);

    res.json({
      success: true,
      message: "Logout successful",
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Verify email address
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next middleware
 */
export const verifyEmail = async (req, res, next) => {
  try {
    const { token } = req.params;
    const result = await authService.verifyEmail(token);

    res.json({
      success: true,
      message: "Email verified successfully",
      data: result,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Request password reset
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next middleware
 */
export const requestPasswordReset = async (req, res, next) => {
  try {
    const { email } = req.body;
    const result = await authService.requestPasswordReset(email);

    res.json({
      success: true,
      message: result.message,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Reset password
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next middleware
 */
export const resetPassword = async (req, res, next) => {
  try {
    const { token } = req.params;
    const { newPassword } = req.body;
    const result = await authService.resetPassword(token, newPassword);

    res.json({
      success: true,
      message: result.message,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Change password for authenticated user
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next middleware
 */
export const changePassword = async (req, res, next) => {
  try {
    const userId = req.user.id;
    const { currentPassword, newPassword } = req.body;

    await authService.changePassword(userId, currentPassword, newPassword);

    res.status(200).json({
      success: true,
      message: 'Password changed successfully',
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Forgot password - send reset email
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next middleware
 */
export const forgotPassword = async (req, res, next) => {
  try {
    const { email } = req.body;

    await authService.forgotPassword(email);

    res.status(200).json({
      success: true,
      message: 'Password reset email sent successfully',
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Get current user session info
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next middleware
 */
export const getCurrentUser = async (req, res, next) => {
  try {
    const userId = req.user.id;
    const user = await authService.validateSession(userId);

    res.json({
      success: true,
      data: {
        user: {
          id: user._id,
          email: user.email,
          role: user.role,
          isActive: user.isActive,
          emailVerified: user.emailVerified,
          lastLogin: user.lastLogin,
        },
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Verify token
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next middleware
 */
export const verifyToken = async (req, res, next) => {
  try {
    // If we reach here, the token is valid (middleware already validated)
    res.json({
      success: true,
      message: "Token is valid",
      data: {
        user: req.user,
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Google OAuth login
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next middleware
 */
export const googleLogin = async (req, res, next) => {
  try {
    const { idToken, role } = req.body;
    const result = await authService.googleLogin(idToken, role);

    res.json({
      success: true,
      message: "Google login successful",
      data: result,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Resend email verification
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next middleware
 */
export const resendEmailVerification = async (req, res, next) => {
  try {
    const { email } = req.body;

    // Find user and generate new verification token
    const user = await User.findOne({ email });
    if (!user) {
      throw new NotFoundError('User not found');
    }

    if (user.emailVerified) {
      throw new BadRequestError('Email already verified');
    }

    // Generate new verification token
    const verificationToken = crypto.randomBytes(32).toString('hex');
    user.emailVerificationToken = verificationToken;
    user.emailVerificationExpires = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours
    await user.save();

    // Queue verification email
    await queueService.sendEmail({
      to: email,
      subject: 'Verify Your Email - CareerConnect',
      template: 'email-verification',
      data: {
        name: user.firstName || 'User',
        verificationUrl: `${config.CLIENT_URL}/verify-email?token=${verificationToken}`,
      },
    });

    res.json({
      success: true,
      message: 'Verification email sent successfully',
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Check if email exists
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next middleware
 */
export const checkEmailExists = async (req, res, next) => {
  try {
    const { email } = req.params;

    const user = await User.findOne({ email });

    res.json({
      success: true,
      data: {
        exists: !!user,
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Get user roles
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next middleware
 */
export const getUserRoles = async (req, res, next) => {
  try {
    const roles = ["CANDIDATE", "RECRUITER", "ADMIN"];

    res.json({
      success: true,
      data: {
        roles,
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Get current user profile
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next middleware
 */
export const getMe = async (req, res, next) => {
  try {
    const userId = req.user.id;
    const userProfile = await authService.getMe(userId);

    res.status(200).json({
      success: true,
      message: "User profile retrieved successfully.",
      data: userProfile,
    });
  } catch (error) {
    next(error);
  }
};
