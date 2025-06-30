import asyncHandler from 'express-async-handler';
import * as authService from "../services/auth.service.js"; // Revert to importing authService object
import config from "../config/index.js";
import crypto from "crypto";
import logger from "../utils/logger.js";

export const register = asyncHandler(async (req, res) => {
  const { refreshToken, ...userData } = await authService.register(req.body);

  res.cookie('refreshToken', refreshToken, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'Lax',
    maxAge: 999999999,
  });

  res.status(201).json({
    success: true,
    message: "Đăng ký thành công. Vui lòng kiểm tra email để xác thực tài khoản.",
    data: userData,
  });
});

export const login = asyncHandler(async (req, res) => {
  const { username, password } = req.body;
  const { refreshToken, ...userData } = await authService.login(
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
  // const { refreshToken } = req.body;
  // get from cookies
  const refreshToken = req.cookies.refreshToken;
  await authService.logout(refreshToken);
  res.cookie('refreshToken', '', {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'Lax',
    maxAge: 0, // Set maxAge to 0 to delete the cookie
  });
  res.json({
    success: true,
    message: "Logout successful",
  });
});


export const verifyEmail = asyncHandler(async (req, res) => {
  const { token } = req.params;
  const result = await authService.verifyEmail(token);

  res.json({
    success: true,
    message: "Email verified successfully",
    data: result,
  });
});



export const resetPassword = asyncHandler(async (req, res) => {
  const { token } = req.params;
  const { newPassword } = req.body;
  await authService.resetPassword(token, newPassword);
  res.status(200).json({ success: true, message: 'Đặt lại mật khẩu thành công.' });
});

export const changePassword = asyncHandler(async (req, res) => {
  const { id: userId } = req.user;
  const { currentPassword, newPassword } = req.body;
  await authService.changePassword(userId, currentPassword, newPassword);
  res.status(200).json({ success: true, message: 'Đổi mật khẩu thành công.' });
});


export const googleLogin = asyncHandler(async (req, res) => {
    const { idToken } = req.body;
    const { accessToken, refreshToken, user } = await authService.googleLogin(idToken);

    res.cookie('refreshToken', refreshToken, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'Lax',
        maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
    });

    res.json({
        success: true,
        message: 'Đăng nhập bằng Google thành công.',
        data: { accessToken, user },
    });
});

export const getCurrentUser = asyncHandler(async (req, res) => {
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
});

export const verifyToken = asyncHandler(async (req, res) => {
  // If we reach here, the token is valid (middleware already validated)
  res.json({
    success: true,
    message: "Token is valid",
    data: {
      user: req.user,
    },
  });
});


export const resendEmailVerification = asyncHandler(async (req, res) => {
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
});

export const getMe = asyncHandler(async (req, res) => {
  const userId = req.user.id;
  const userProfile = await authService.getMe(userId);

  res.status(200).json({
    success: true,
    message: "User profile retrieved successfully.",
    data: userProfile,
  });
});
