import asyncHandler from 'express-async-handler';
import * as authService from "../services/auth.service.js";
import axios from 'axios';
import jwt from 'jsonwebtoken';
import config from '../config/index.js';
import { OAuth2Client } from 'google-auth-library';
import { CandidateProfile, User, RecruiterProfile } from '../models/index.js';
import logger from '../utils/logger.js';
import * as onboardingService from '../services/onboarding.service.js';
import { UnauthorizedError, BadRequestError } from '../utils/AppError.js';

const client = new OAuth2Client(config.GOOGLE_CLIENT_ID);

// Hàm tạo token có thể đặt ở đây hoặc trong service
const generateTokens = (user) => {
  const payload = { id: user._id, role: user.role };
  const accessToken = jwt.sign(payload, config.JWT_SECRET, { expiresIn: '9999d' });
  const refreshToken = jwt.sign(payload, config.JWT_REFRESH_SECRET, { expiresIn: '7d' });
  return { accessToken, refreshToken };
};

export const register = asyncHandler(async (req, res) => {
  const { turnstileToken } = req.body;

  // Verify Turnstile Token
  if (turnstileToken) {
    try {
      const secretKey = process.env.CLOUDFLARE_TURNSTILE_SECRET_KEY;
      const verifyResponse = await axios.post('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
        secret: secretKey,
        response: turnstileToken
      });

      console.log('Turnstile Verify Response:', verifyResponse.data);

      if (!verifyResponse.data.success) {
        return res.status(400).json({
          success: false,
          message: "Xác thực Captcha thất bại. Vui lòng thử lại."
        });
      }
    } catch (error) {
      logger.error('Turnstile verification error:', error);
      // Optional: Fail open or closed depending on requirements. 
      // For now, let's allow if verification errors out networking-wise, or block? 
      // Safest is to block but helpful error.
      return res.status(500).json({
        success: false,
        message: "Lỗi hệ thống khi xác thực Captcha."
      });
    }
  } else {
    // If we want to enforce it:
    return res.status(400).json({ success: false, message: "Vui lòng hoàn thành xác thực Captcha" });
    // But maybe the frontend isn't fully ready yet or user wants optional?
    // User said "add authentication", implying enforcement.
    // if (process.env.NODE_ENV === 'production' || process.env.ENABLE_TURNSTILE === 'true') {
    //   return res.status(400).json({ success: false, message: "Vui lòng hoàn thành xác thực Captcha" });
    // }
  }

  await authService.register(req.body);
  // Remove sensitive data
  const { password, ...userWithoutPassword } = req.body; // crude approximation, authService usually handles user creation

  // Note: authService.register doesn't return the user usually? 
  // checking previous code: await authService.register(req.body);
  // It seems it sends email and returns nothing or promise void.

  res.status(201).json({
    success: true,
    message: "Đăng ký thành công. Vui lòng kiểm tra email để xác thực tài khoản.",
  });
});

export const login = asyncHandler(async (req, res) => {
  // Passport 'local' strategy đã xác thực user và gắn vào req.user
  const { accessToken, refreshToken } = generateTokens(req.user);

  res.cookie('refreshToken', refreshToken, {
    httpOnly: true,
    secure: config.NODE_ENV === 'production',
    sameSite: 'None',
    maxAge: 7 * 24 * 60 * 60 * 1000,
  });

  // Kiểm tra profile completeness cho candidate
  let profileCompleteness = null;
  if (req.user.role === 'candidate') {
    try {
      const profile = await CandidateProfile.findOne({ userId: req.user._id });
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
      logger.error('Error checking profile completeness on login:', error);
    }
  }

  res.json({
    success: true,
    message: 'Đăng nhập thành công',
    data: {
      accessToken,
      id: req.user._id,
      role: req.user.role,
      email: req.user.email,
      active: req.user.active,
      isEmailVerified: req.user.isEmailVerified,
    },
    profileCompleteness
  });
});

export const googleLogin = asyncHandler(async (req, res) => {
  const { token, role } = req.body;
  let name, email, avatar;

  try {
    // Try to verify as ID Token first
    const ticket = await client.verifyIdToken({
      idToken: token,
      audience: config.GOOGLE_CLIENT_ID,
    });
    logger.info(`Google login with ID token`);
    const payload = ticket.getPayload();
    name = payload.name;
    email = payload.email;
    avatar = payload.picture;
  } catch (error) {
    // If ID token verification fails, try as Access Token
    logger.info(`ID token verification failed, trying as Access Token`);
    try {
      const response = await axios.get('https://www.googleapis.com/oauth2/v3/userinfo', {
        headers: { Authorization: `Bearer ${token}` }
      });
      const payload = response.data;
      name = payload.name;
      email = payload.email;
      avatar = payload.picture;
      logger.info(`Google login with Access Token successful for ${email}`);
    } catch (accessError) {
      logger.error(`Access token verification failed: ${accessError.message}`);
      throw new Error('Invalid Google token');
    }
  }

  logger.info(name, email, avatar);
  let user = await User.findOne({ email });

  if (!user) {
    // If user doesn't exist with googleId, check if email is already in use
    const existingUser = await User.findOne({ email });
    if (existingUser) {
      // Link the Google account to the existing user
      existingUser.isEmailVerified = true; // Email from Google is considered verified
      await existingUser.save();
      user = existingUser;
    } else {
      // Create a new user with role from request body (candidate or recruiter)
      const newUser = new User({
        email,
        role: role || 'candidate', // Use role from req.body, default to 'candidate' if not provided
        isEmailVerified: true,
      });
      await newUser.save();

      // Create a corresponding profile based on role
      if (newUser.role === 'candidate') {
        await CandidateProfile.create({
          userId: newUser._id,
          fullname: name,
          avatar: avatar
        });
      } else if (newUser.role === 'recruiter') {
        await RecruiterProfile.create({
          userId: newUser._id,
          fullname: name,

        });
      }
      user = newUser;
    }
  }
  if (!user.active) {
    throw new UnauthorizedError('Tài khoản của bạn đã bị khóa.');
  }
  const { accessToken, refreshToken } = generateTokens(user);

  res.cookie('refreshToken', refreshToken, {
    httpOnly: true,
    secure: config.NODE_ENV === 'production',
    sameSite: 'None',
    maxAge: 7 * 24 * 60 * 60 * 1000,
  });

  // Kiểm tra profile completeness cho candidate
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
      logger.error('Error checking profile completeness on Google login:', error);
    }
  }

  res.json({
    success: true,
    message: 'Đăng nhập bằng Google thành công.',
    data: {
      accessToken,
      id: user._id,
      email: user.email,
      role: user.role,
      active: user.active,
      isEmailVerified: true,
    },
    profileCompleteness
  });
});

// Server-Side PKCE: Backend đổi code với Google
export const googleOAuthCallback = asyncHandler(async (req, res) => {
  const { code, code_verifier, role, redirect_uri } = req.body;

  if (!code || !code_verifier) {
    throw new BadRequestError('Thiếu mã xác thực hoặc code verifier.');
  }

  if (!redirect_uri) {
    throw new BadRequestError('Thiếu redirect URI.');
  }

  // Exchange code for access token with PKCE verification
  // Google sẽ tự validate redirect_uri phải khớp với URI đã đăng ký
  const googleOAuthService = await import('../services/googleOAuth.service.js');
  const accessToken = await googleOAuthService.exchangeCodeForToken(code, code_verifier, redirect_uri);

  // Get user info from Google
  const googleUser = await googleOAuthService.getUserInfo(accessToken);

  // Find or create user
  const result = await googleOAuthService.findOrCreateUser(googleUser, role);

  // Set refresh token cookie
  res.cookie('refreshToken', result.refreshToken, {
    httpOnly: true,
    secure: config.NODE_ENV === 'production',
    sameSite: 'None',
    maxAge: 7 * 24 * 60 * 60 * 1000,
  });

  res.json({
    success: true,
    message: 'Đăng nhập bằng Google thành công.',
    data: {
      accessToken: result.accessToken,
      ...result.user
    },
    profileCompleteness: result.profileCompleteness
  });
});


export const getMe = asyncHandler(async (req, res) => {
  // Passport 'jwt' strategy đã xác thực và gắn user vào req.user
  const userProfile = await authService.getMe(req.user._id);
  res.json({
    success: true,
    message: 'Lấy thông tin người dùng thành công',
    data: userProfile
  });
});

export const refreshToken = asyncHandler(async (req, res) => {
  const refreshToken = req.cookies.refreshToken;
  const tokens = await authService.refreshToken(refreshToken);

  res.json({
    success: true,
    message: "Token refreshed successfully",
    data: tokens,
  });
});


export const logout = asyncHandler(async (req, res) => {
  const refreshToken = req.cookies.refreshToken;
  await authService.logout(refreshToken);
  res.cookie('refreshToken', '', {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'None',
    maxAge: 0, // Set maxAge to 0 to delete the cookie
  });
  res.json({
    success: true,
    message: "Đăng xuất thành công",
  });
});


export const verifyEmail = asyncHandler(async (req, res) => {
  const { token } = req.validatedQuery || req.query; // Use query params for token

  try {
    const result = await authService.verifyEmail(token);

    // Trả về view thành công với thông tin user
    res.render('verifyEmailSuccess', {
      title: 'Xác thực email thành công',
      message: 'Email của bạn đã được xác thực thành công!',
      user: {
        fullname: result.fullname,
        email: result.email,
        role: result.role === 'candidate' ? 'Ứng viên' : 'Nhà tuyển dụng',
        avatar: result.avatar,
        memberSince: new Date(result.createdAt).toLocaleDateString('vi-VN', {
          year: 'numeric',
          month: 'long',
          day: 'numeric'
        })
      }
    });
  } catch (error) {
    // Trả về view lỗi
    res.render('verifyEmailError', {
      title: 'Xác thực email thất bại',
      message: error.message || 'Có lỗi xảy ra khi xác thực email',
    });
  }
});



export const forgotPassword = asyncHandler(async (req, res) => {
  const { email, turnstileToken } = req.body;

  // Verify Turnstile Token
  if (turnstileToken) {
    try {
      const secretKey = process.env.CLOUDFLARE_TURNSTILE_SECRET_KEY;
      const verifyResponse = await axios.post('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
        secret: secretKey,
        response: turnstileToken
      });

      if (!verifyResponse.data.success) {
        return res.status(400).json({
          success: false,
          message: "Xác thực Captcha thất bại. Vui lòng thử lại."
        });
      }
    } catch (error) {
      logger.error('Turnstile verification error:', error);
      return res.status(500).json({
        success: false,
        message: "Lỗi hệ thống khi xác thực Captcha."
      });
    }
  } else {
    // Enforce Turnstile
    // if (process.env.NODE_ENV === 'production' || process.env.ENABLE_TURNSTILE === 'true') {
    return res.status(400).json({ success: false, message: "Vui lòng hoàn thành xác thực Captcha" });
    // }
  }

  await authService.forgotPassword(email);
  res.status(200).json({
    success: true,
    message: 'Yêu cầu đặt lại mật khẩu đã được gửi đến email của bạn.',
  });
});

export const resetPassword = asyncHandler(async (req, res) => {
  const { token, newPassword } = req.body;
  await authService.resetPassword(token, newPassword);
  res.status(200).json({ success: true, message: 'Đặt lại mật khẩu thành công.' });
});

export const changePassword = asyncHandler(async (req, res) => {
  const { id: userId } = req.user;
  const { currentPassword, newPassword } = req.body;
  await authService.changePassword(userId, currentPassword, newPassword);
  res.status(200).json({ success: true, message: 'Đổi mật khẩu thành công.' });
});

export const resendVerificationEmail = asyncHandler(async (req, res) => {
  const { email } = req.body;
  await authService.resendVerificationEmail(email);
  res.status(200).json({
    success: true,
    message: 'Email xác thực đã được gửi lại. Vui lòng kiểm tra hộp thư của bạn.',
  });
});
