import axios from 'axios';
import config from '../config/index.js';
import logger from '../utils/logger.js';
import { BadRequestError, UnauthorizedError } from '../utils/AppError.js';
import { User, CandidateProfile, RecruiterProfile } from '../models/index.js';
import * as onboardingService from './onboarding.service.js';
import jwt from 'jsonwebtoken';

const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token';
const GOOGLE_USERINFO_URL = 'https://www.googleapis.com/oauth2/v3/userinfo';

/**
 * Generate JWT tokens for authenticated user
 */
const generateTokens = (user) => {
  const payload = { id: user._id, role: user.role };
  const accessToken = jwt.sign(payload, config.JWT_SECRET, {
    expiresIn: config.JWT_ACCESS_EXPIRES_IN,
  });
  const refreshToken = jwt.sign(payload, config.JWT_REFRESH_SECRET, {
    expiresIn: config.JWT_REFRESH_EXPIRES_IN,
  });
  return { accessToken, refreshToken };
};

/**
 * Exchange authorization code for access token with PKCE verification (Server-Side)
 * @param {string} code - Authorization code from Google
 * @param {string} codeVerifier - PKCE code verifier
 * @param {string} redirectUri - Must match the one used in authorization request
 * @returns {Promise<string>} Access token
 */
export const exchangeCodeForToken = async (code, codeVerifier, redirectUri) => {
  try {
    const response = await axios.post(GOOGLE_TOKEN_URL, new URLSearchParams({
      code,
      client_id: config.GOOGLE_CLIENT_ID,
      client_secret: config.GOOGLE_CLIENT_SECRET, // Backend có thể dùng secret an toàn
      redirect_uri: redirectUri,
      grant_type: 'authorization_code',
      code_verifier: codeVerifier, // PKCE verification
    }), {
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
    });

    logger.info('Successfully exchanged code for token');
    return response.data.access_token;
  } catch (error) {
    logger.error('Token exchange failed:', error.response?.data || error.message);
    throw new BadRequestError('Không thể xác thực với Google. Vui lòng thử lại.');
  }
};

/**
 * Get user info from Google using access token
 * @param {string} accessToken - Google access token
 * @returns {Promise<{email: string, name: string, picture: string}>}
 */
export const getUserInfo = async (accessToken) => {
  try {
    const response = await axios.get(GOOGLE_USERINFO_URL, {
      headers: { Authorization: `Bearer ${accessToken}` }
    });

    return {
      email: response.data.email,
      name: response.data.name,
      picture: response.data.picture,
    };
  } catch (error) {
    logger.error('Failed to get user info:', error.response?.data || error.message);
    throw new BadRequestError('Không thể lấy thông tin người dùng từ Google.');
  }
};

/**
 * Find or create user from Google OAuth data
 * @param {Object} googleUser - User data from Google
 * @param {string} role - User role (candidate/recruiter)
 * @returns {Promise<Object>} User object with tokens and profile completeness
 */
export const findOrCreateUser = async (googleUser, role) => {
  const { email, name, picture } = googleUser;

  let user = await User.findOne({ email });

  if (!user) {
    // Create new user
    user = new User({
      email,
      role: role || 'candidate',
      isEmailVerified: true, // Google email is pre-verified
    });
    await user.save();

    // Create profile based on role
    if (user.role === 'candidate') {
      await CandidateProfile.create({
        userId: user._id,
        fullname: name,
        avatar: picture
      });
    } else if (user.role === 'recruiter') {
      await RecruiterProfile.create({
        userId: user._id,
        fullname: name,
      });
    }

    logger.info(`Created new user via Google OAuth: ${email}`);
  } else {
    // Link Google account to existing user
    if (!user.isEmailVerified) {
      user.isEmailVerified = true;
      await user.save();
    }
    logger.info(`Existing user logged in via Google: ${email}`);
  }

  if (!user.active) {
    throw new UnauthorizedError('Tài khoản của bạn đã bị khóa.');
  }

  const { accessToken, refreshToken } = generateTokens(user);

  // Check profile completeness for candidates
  let profileCompleteness = null;
  if (user.role === 'candidate') {
    try {
      const profile = await CandidateProfile.findOne({ userId: user._id });
      if (profile) {
        const completeness = await onboardingService.updateProfileCompleteness(profile._id, profile);
        profileCompleteness = {
          percentage: completeness.percentage,
          needsOnboarding: !profile.onboardingCompleted,
          onboardingCompleted: profile.onboardingCompleted,
          canGenerateRecommendations: completeness.canGenerateRecommendations,
          missingFieldsCount: completeness.missingFields?.length || 0
        };
      }
    } catch (error) {
      logger.error('Error checking profile completeness:', error);
    }
  }

  return {
    accessToken,
    refreshToken,
    user: {
      id: user._id,
      email: user.email,
      role: user.role,
      active: user.active,
      isEmailVerified: true,
    },
    profileCompleteness
  };
};
