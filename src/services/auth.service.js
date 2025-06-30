import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import crypto from "crypto";
import { User } from "../models/index.js";
import config from "../config/index.js";
import logger from "../utils/logger.js";
import {
  BadRequestError,
  NotFoundError,
  UnauthorizedError,
} from "../utils/AppError.js";
import CandidateProfile from "../models/CandidateProfile.js";
import RecruiterProfile from "../models/RecruiterProfile.js";

/**
 * Generate JWT tokens
 * @param {string} userId - User ID
 * @returns {Object} Access and refresh tokens
 */
const generateTokens = (userId) => {
  const accessToken = jwt.sign({ userId }, config.JWT_SECRET, {
    expiresIn: config.JWT_EXPIRES_IN || "15m",
  });

  const refreshToken = jwt.sign({ userId }, config.JWT_REFRESH_SECRET, {
    expiresIn: config.JWT_REFRESH_EXPIRES_IN || "7d",
  });

  return { accessToken, refreshToken };
};

export const register = async (userData) => {
    const { username, email, fullname, password, role } = userData;

    // Check if user already exists
    const existingUser = await User.findOne({ email });
    if (existingUser) {
      throw new BadRequestError("User already exists with this email");
    }
    const existingUsername = await User.findOne({ username });
    if (existingUsername) {
      throw new BadRequestError("Username already exists");
    }
    // Validate role
    const validRoles = ["candidate", "recruiter"];
    if (!validRoles.includes(role)) {
      throw new BadRequestError("Invalid role specified");
    }
    // Create base user
    const user = new User({
      username,
      email,
      password,
      role,
    });

    await user.save();
    // tạo candidate profile hoặc recruiter profile tùy theo role
    if (role === "candidate") {
      await CandidateProfile.create({
        userId: user._id,
        fullname: fullname,
      });
    } else {
      await RecruiterProfile.create({
        userId: user._id,
        fullname: fullname,
      });
    }
    // Generate tokens
    const { accessToken, refreshToken } = generateTokens(user._id);
    await sendVerificationEmail(user, fullname);
    return {
      id: user._id,
      email: user.email,
      role: user.role,
      active: user.active,
      accessToken,
      refreshToken,
    };
};

/**
 * Login user
 * @param {string} email - User email
 * @param {string} password - User password
 * @returns {Promise<Object>} User data and tokens
 */
export const login = async (username, password) => {
  // Find user
  const t = await CandidateProfile.findOne({ username }).select("+password");
  const user = await User.findOne({ username }).select("+password");
  if (!user) {
    // Generic error message for security
    throw new NotFoundError("User not found");
  }

  // Verify password
  const isValidPassword = await bcrypt.compare(password, user.password);
  if (!isValidPassword) {
    throw new UnauthorizedError("Incorrect username or password");
  }

  // Generate tokens
  const { accessToken, refreshToken } = generateTokens(user._id);

  return {
    id: user._id,
    email: user.email,
    role: user.role,
    active: user.active,
    accessToken: accessToken,
    refreshToken: refreshToken,
  };
};

export const refreshToken = async (refreshToken) => {
  try {
    // Verify refresh token
    logger.info(refreshToken);
    const decoded = jwt.verify(refreshToken, config.JWT_REFRESH_SECRET);

    // Find user and check if refresh token exists
    const user = await User.findById(decoded.userId);

    // Generate new access token
    const { accessToken } = generateTokens(user._id);
    return {
      accessToken,
    };
  } catch (error) {
    logger.error("Token refresh failed:", error);
    throw new Error("Invalid refresh token");
  }
};

export const logout = async (refreshToken) => {
  try {
    // blacklist the refresh token
    // giả lập
    console.log(`Blacklisting refresh token: ${refreshToken}`);
    // check if the refresh token ís valid
    jwt.verify(refreshToken, config.JWT_REFRESH_SECRET);
  } catch (error) {
    logger.error("Logout failed:", error);
    throw error;
  }
};

/**
 * Verify email address
 * @param {string} token - Email verification token
 * @returns {Promise<Object>} Success message
 */
export const verifyEmail = async (token) => {
  try {
    const user = await User.findOne({
      emailVerificationToken: token,
      emailVerificationExpires: { $gt: new Date() },
    });

    if (!user) {
      throw new BadRequestError("Invalid or expired verification token");
    }

    user.emailVerified = true;
    user.emailVerificationToken = undefined;
    user.emailVerificationExpires = undefined;
    await user.save();

    logger.info(`Email verified for user: ${user.email}`);

    return { message: "Email verified successfully" };
  } catch (error) {
    logger.error("Email verification failed:", error);
    throw error;
  }
};

/**
 * Request password reset
 * @param {string} email - User email
 * @returns {Promise<Object>} Success message
 */
export const requestPasswordReset = async (email) => {
  try {
    const user = await User.findOne({ email });
    if (!user) {
      throw new NotFoundError("User not found");
    }

    // Generate reset token
    const resetToken = crypto.randomBytes(32).toString("hex");
    user.passwordResetToken = resetToken;
    user.passwordResetExpires = new Date(Date.now() + 60 * 60 * 1000); // 1 hour
    await user.save();

    // Queue password reset email
    await queueService.sendEmail({
      to: email,
      subject: "Password Reset - CareerConnect",
      template: "password-reset",
      data: {
        name: user.firstName || "User",
        resetUrl: `${config.CLIENT_URL}/reset-password?token=${resetToken}`,
      },
    });

    logger.info(`Password reset requested for: ${email}`);

    return { message: "Password reset email sent" };
  } catch (error) {
    logger.error("Password reset request failed:", error);
    throw error;
  }
};

/**
 * Reset password
 * @param {string} token - Password reset token
 * @param {string} newPassword - New password
 * @returns {Promise<Object>} Success message
 */
export const resetPassword = async (token, newPassword) => {
  try {
    const user = await User.findOne({
      passwordResetToken: token,
      passwordResetExpires: { $gt: new Date() },
    });

    if (!user) {
      throw new BadRequestError("Invalid or expired reset token");
    }

    // Hash new password
    const hashedPassword = await bcrypt.hash(newPassword, 12);

    // Update user
    user.password = hashedPassword;
    user.passwordResetToken = undefined;
    user.passwordResetExpires = undefined;
    user.refreshTokens = []; // Invalidate all refresh tokens
    await user.save();

    logger.info(`Password reset successful for user: ${user.email}`);

    return { message: "Password reset successful" };
  } catch (error) {
    logger.error("Password reset failed:", error);
    throw error;
  }
};

/**
 * Change password for authenticated user
 * @param {string} userId - User ID
 * @param {string} currentPassword - Current password
 * @param {string} newPassword - New password
 * @returns {Promise<void>}
 */
export const changePassword = async (userId, currentPassword, newPassword) => {
  try {
    const user = await User.findById(userId);
    if (!user) {
      throw new NotFoundError("User not found");
    }

    // Verify current password
    // const isValidPassword = await bcrypt.compare(currentPassword, user.password);
    console.log("Is valid password:");

    const isValidPassword = await user.comparePassword(currentPassword);
    if (!isValidPassword) {
      throw new BadRequestError("Current password is incorrect");
    }

    // Hash new password
    const hashedPassword = await bcrypt.hash(newPassword, 12);

    // Update password and invalidate refresh tokens
    user.password = hashedPassword;
    user.refreshTokens = [];
    await user.save();

    logger.info(`Password changed for user: ${user.email}`);
  } catch (error) {
    logger.error("Password change failed:", error);
    throw error;
  }
};

/**
 * Validate user session
 * @param {string} userId - User ID
 * @returns {Promise<Object>} User data
 */
export const validateSession = async (userId) => {
  try {
    const user = await User.findById(userId);
    if (!user || !user.isActive) {
      throw new UnauthorizedError("Invalid session");
    }

    return user;
  } catch (error) {
    logger.error("Session validation failed:", error);
    throw error;
  }
};

/**
 * Forgot password - send reset email
 * @param {string} email - User email
 * @returns {Promise<void>}
 */
export const forgotPassword = async (email) => {
  try {
    const user = await User.findOne({ email });
    if (!user) {
      throw new NotFoundError("User not found");
    }

    // Generate reset token
    const resetToken = crypto.randomBytes(32).toString("hex");
    user.passwordResetToken = resetToken;
    user.passwordResetExpires = new Date(Date.now() + 60 * 60 * 1000); // 1 hour
    await user.save();

    // Queue password reset email
    await queueService.sendEmail({
      to: email,
      subject: "Password Reset - CareerConnect",
      template: "password-reset",
      data: {
        name: user.firstName || "User",
        resetUrl: `${config.CLIENT_URL}/reset-password?token=${resetToken}`,
      },
    });

    logger.info(`Password reset email sent to: ${email}`);
  } catch (error) {
    logger.error("Forgot password failed:", error);
    throw error;
  }
};

/**
 * Google OAuth login
 * @param {string} idToken - Google ID token
 * @param {string} role - User role for new registrations
 * @returns {Promise<Object>} User data and tokens
 */
export const googleLogin = async (idToken, role = "CANDIDATE") => {
  try {
    // Verify Google token
    const googleUser = await verifyGoogleToken(idToken);

    // Check if user exists
    let user = await User.findOne({ email: googleUser.email });

    if (!user) {
      // Create new user
      user = new User({
        email: googleUser.email,
        role,
        isActive: true,
        emailVerified: googleUser.email_verified,
        googleId: googleUser.sub,
      });

      await user.save();

      // Create role-specific profile
      let profile;
      switch (role) {
        case "CANDIDATE":
          profile = new Candidate({
            user: user._id,
            firstName: googleUser.name.split(" ")[0],
            lastName: googleUser.name.split(" ").slice(1).join(" "),
            profilePicture: googleUser.picture,
          });
          break;
        case "RECRUITER":
          profile = new Recruiter({
            user: user._id,
            firstName: googleUser.name.split(" ")[0],
            lastName: googleUser.name.split(" ").slice(1).join(" "),
            profilePicture: googleUser.picture,
          });
          break;
        default:
          throw new BadRequestError("Invalid role for Google login");
      }

      await profile.save();
    }

    // Generate tokens
    const { accessToken, refreshToken } = generateTokens(user._id);

    logger.info(`Google login successful: ${user.email}`);

    return {
      user: {
        id: user._id,
        email: user.email,
        role: user.role,
        isActive: user.isActive,
        emailVerified: user.emailVerified,
        lastLogin: user.lastLogin,
      },
      tokens: {
        accessToken,
        refreshToken,
      },
    };
  } catch (error) {
    logger.error("Google login failed:", error);
    throw error;
  }
};

/**
 * Verify Google ID token
 * @param {string} idToken - Google ID token
 * @returns {Promise<Object>} Google user payload
 */
const verifyGoogleToken = async (idToken) => {
  try {
    // For production, you should use Google's official library
    // This is a simplified implementation
    const response = await fetch(
      `https://oauth2.googleapis.com/tokeninfo?id_token=${idToken}`
    );

    if (!response.ok) {
      throw new UnauthorizedError("Invalid Google token");
    }

    const payload = await response.json();

    // Verify the token is for your application
    if (payload.aud !== config.GOOGLE_CLIENT_ID) {
      throw new UnauthorizedError("Invalid audience");
    }

    return {
      sub: payload.sub,
      email: payload.email,
      name: payload.name,
      picture: payload.picture,
      email_verified: payload.email_verified,
    };
  } catch (error) {
    logger.error("Google token verification error:", error);
    throw new Error("Invalid Google token");
  }
};

/**
 * Get user profile information
 * @param {string} userId - User ID
 * @returns {Promise<Object>} User profile data
 */
export const getMe = async (userId) => {
  const user = await User.findById(userId).lean();
  if (!user) {
    throw new NotFoundError("User not found");
  }

  let profile = null;
  let name = "N/A";

  if (user.role === "candidate") {
    profile = await CandidateProfile.findOne({ userId: userId }).lean();
    if (profile) {
      name = profile.fullname;
    }
  } else if (user.role === "recruiter") {
    profile = await RecruiterProfile.findOne({ userId: userId }).lean();
     if (profile) {
      name = profile.fullname;
    }
  }

  return {
    id: user._id,
    email: user.email,
    role: user.role,
    name: name,
    active: user.active,
  };
};
const sendVerificationEmail = async (user, fullname) => {
    const verificationToken = crypto.randomBytes(32).toString('hex');
    user.emailVerificationToken = crypto
        .createHash('sha256')
        .update(verificationToken)
        .digest('hex');
    logger.info(`Verification token for ${user.email}: ${verificationToken}`);

    try {
        const verificationUrl = `${config.CLIENT_URL}/verify-email?token=${verificationToken}`;
        await emailService.sendEmail({
            to: user.email,
            subject: 'Xác thực tài khoản CareerZone',
            template: 'verify-email',
            data: { name: fullname, verificationUrl },
        });
        logger.info(`Verification email sent to ${user.email}`);
    } catch (emailError) {
        logger.error(`Failed to send verification email to ${user.email}`, emailError);
    }
};

export const authService = {
  register,
  login,
  refreshToken,
  logout,
  verifyEmail,
  requestPasswordReset,
  resetPassword,
  changePassword,
  validateSession,
  forgotPassword,
  googleLogin,
  getMe,
  sendVerificationEmail
};
