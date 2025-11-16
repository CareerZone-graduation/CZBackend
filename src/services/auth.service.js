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
import { CandidateProfile, RecruiterProfile } from "../models/index.js";
import * as queueService from "./queue.service.js";
import { ROUTING_KEYS } from "../queues/rabbitmq.js";
import * as kafkaService from "./kafka.service.js";

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

const sendVerificationEmail = async (user, fullname) => {
  const verificationToken = crypto.randomBytes(32).toString("hex");
  
  // Lưu token vào database thay vì Redis
  user.emailVerificationToken = verificationToken;
  user.emailVerificationExpires = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 giờ
  await user.save({ validateBeforeSave: false });

  const verificationUrl = `${config.BACKEND_URL}/api/auth/verify-email?token=${verificationToken}`;
  const emailPayload = {
    to: user.email,
    subject: "Xác thực tài khoản CareerZone",
    template: "verifyEmail",
    data: { name: fullname, verificationUrl },
  };

  // Push email task to RabbitMQ instead of sending directly
  queueService.publishNotification(ROUTING_KEYS.EMAIL_SEND, emailPayload);
  logger.info(`Queued verification email for ${user.email}`);
};

export const register = async (userData) => {
  const { email, fullname, password, role } = userData;

  if (await User.findOne({ email })) {
    throw new BadRequestError("Email đã được sử dụng.");
  }


  const user = new User({ email, password, role });
  await user.save();

  if (role === "candidate") {
    await CandidateProfile.create({ userId: user._id, fullname });
  } else {
    await RecruiterProfile.create({ userId: user._id, fullname });
    // Optional: Send a RECRUITER_REGISTERED event if needed in the future
  }

  // No longer awaits, just fires the event
  sendVerificationEmail(user, fullname);
};

export const login = async (email, password) => {
  const user = await User.findOne({ email }).select("+password");
  if (!user || !(await user.comparePassword(password))) {
    throw new UnauthorizedError("Email hoặc mật khẩu không chính xác.");
  }

  if (!user.isEmailVerified) {
    throw new UnauthorizedError("Vui lòng xác thực email trước khi đăng nhập.");
  }

  const { accessToken, refreshToken } = generateTokens(user);
  return {
    id: user._id,
    role: user.role,
    email: user.email,
    active: user.active,
    isEmailVerified: user.isEmailVerified,
    accessToken,
    refreshToken,
  };
};

export const refreshToken = async (token) => {
  if (!token) {
    throw new UnauthorizedError("Refresh token là bắt buộc.");
  }
  try {
    const decoded = jwt.verify(token, config.JWT_REFRESH_SECRET);
    const user = await User.findById(decoded.id);
    if (!user) {
      throw new UnauthorizedError("Người dùng không tồn tại.");
    }
    const { accessToken } = generateTokens(user);
    return { accessToken };
  } catch (error) {
    throw new UnauthorizedError("Refresh token không hợp lệ hoặc đã hết hạn.");
  }
};

export const verifyEmail = async (token) => {
  console.log(`Verifying email with token: ${token}`);
  
  // Tìm user với token và kiểm tra token chưa hết hạn
  const user = await User.findOne({
    emailVerificationToken: token,
    emailVerificationExpires: { $gt: new Date() } // Token chưa hết hạn
  });

  if (!user) {
    throw new BadRequestError("Token không hợp lệ hoặc đã hết hạn.");
  }

  // Chỉ xử lý nếu email chưa được xác thực
  if (!user.isEmailVerified) {
    user.isEmailVerified = true;
    user.emailVerificationToken = null; // Xóa token sau khi verify
    user.emailVerificationExpires = null; // Xóa thời gian hết hạn
    await user.save({ validateBeforeSave: false });

    // Nếu là candidate, gửi sự kiện sau khi xác thực thành công
    // if (user.role === 'candidate') {
    //   const candidateProfile = await CandidateProfile.findOne({ userId: user._id });
    //   if (candidateProfile) {
    //     kafkaService.sendUserEvent({
    //       eventType: 'CANDIDATE_REGISTERED',
    //       timestamp: new Date().toISOString(),
    //       payload: {
    //         userId: user._id.toString(),
    //         email: user.email,
    //         fullName: candidateProfile.fullname,
    //         role: user.role,
    //       }
    //     });
    //   }
    // }
    
    // Lấy thông tin profile để trả về
    const profile = user.role === 'candidate' 
      ? await CandidateProfile.findOne({ userId: user._id })
      : await RecruiterProfile.findOne({ userId: user._id });
    
    return {
      userId: user._id,
      email: user.email,
      role: user.role,
      fullname: profile?.fullname || 'N/A',
      avatar: profile?.avatar || null,
      createdAt: user.createdAt,
      isEmailVerified: true
    };
  } else {
    // Nếu email đã được xác thực rồi, xóa token và báo lỗi
    user.emailVerificationToken = null;
    user.emailVerificationExpires = null;
    await user.save({ validateBeforeSave: false });
    throw new BadRequestError("Email này đã được xác thực từ trước.");
  }
};

export const resendVerificationEmail = async (email) => {
  const user = await User.findOne({ email });
  if (!user) {
    throw new NotFoundError("Không tìm thấy người dùng với email này.");
  }
  if (user.isEmailVerified) {
    throw new BadRequestError("Email này đã được xác thực.");
  }
  const profile =
      user.role === "candidate"
        ? await CandidateProfile.findOne({ userId: user._id })
        : await RecruiterProfile.findOne({ userId: user._id });
  // Kiểm tra xem có token cũ chưa hết hạn không
  const now = new Date();
  if (user.emailVerificationToken && user.emailVerificationExpires && user.emailVerificationExpires > now) {
    await sendVerificationEmail(user, profile.fullname);
  } else {
    // Tạo và gửi token mới
    user.emailVerificationToken = crypto.randomBytes(32).toString("hex");
    user.emailVerificationExpires = new Date(Date.now() + 20 * 60 * 1000); // 20 phút
    await user.save({ validateBeforeSave: false });
    await sendVerificationEmail(user, profile.fullname);
  }

  logger.info(`Resent verification email to ${email}`);
};

export const forgotPassword = async (email) => {
  const user = await User.findOne({ email });
  if (!user) {
    throw new NotFoundError("Email không tồn tại trong hệ thống.");
  }

  // Tạo một token JWT đặc biệt cho việc reset password
  const resetToken = jwt.sign({ id: user._id }, config.JWT_SECRET, {
    expiresIn: "10m", // Token chỉ có hiệu lực 10 phút
  });

  const resetURL = `${config.CLIENT_URL}/reset-password?token=${resetToken}`;

  const emailPayload = {
    to: user.email,
    subject: "Yêu cầu đặt lại mật khẩu CareerZone",
    template: "passwordReset", // Đảm bảo template này tồn tại trong `src/views/emails`
    data: {
      name: user.email,
      resetUrl: resetURL,
    },
  };

  // Đẩy task gửi email vào RabbitMQ
  queueService.publishNotification(ROUTING_KEYS.EMAIL_SEND, emailPayload);
  logger.info(`Queued password reset email for ${user.email}`);
};

export const resetPassword = async (token, newPassword) => {
  try {
    const decoded = jwt.verify(token, config.JWT_SECRET);
    logger.info(decoded);
    const user = await User.findById(decoded.id);

    if (!user) {
      throw new NotFoundError("Người dùng không tồn tại.");
    }

    user.password = newPassword;
    await user.save();
    logger.info(`Password has been reset for user: ${user.email}`);
  } catch (error) {
    // Bắt lỗi token hết hạn hoặc không hợp lệ
    if (error instanceof jwt.TokenExpiredError) {
      throw new BadRequestError("Token đặt lại mật khẩu đã hết hạn.");
    }
    if (error instanceof jwt.JsonWebTokenError) {
      throw new BadRequestError("Token đặt lại mật khẩu không hợp lệ.");
    }
    // Ném lại các lỗi khác
    throw error;
  }
};

export const changePassword = async (userId, currentPassword, newPassword) => {
  const user = await User.findById(userId).select("+password");
  if (!user || !(await user.comparePassword(currentPassword))) {
    throw new BadRequestError("Mật khẩu hiện tại không chính xác.");
  }
  user.password = newPassword;
  await user.save();
};

export const getMe = async (userId) => {
  const user = await User.findById(userId);
  if (!user) {
    throw new NotFoundError("Không tìm thấy người dùng.");
  }

  const profile =
    user.role === "candidate"
      ? await CandidateProfile.findOne({ userId: user._id })
      : await RecruiterProfile.findOne({ userId: user._id });

  return {
    id: user._id,
    email: user.email,
    role: user.role,
    fullname: profile ? profile.fullname : "N/A",
    isEmailVerified: user.isEmailVerified,
  };
};

// Placeholder for googleLogin
export const googleLogin = async (idToken) => {
  logger.warn("Google Login is not fully implemented.");
  throw new Error("Chức năng đăng nhập bằng Google chưa được hỗ trợ.");
};

export const logout = async (refreshToken) => {
  // In a real-world scenario, you might want to blacklist the token.
  // For this implementation, we'll just clear the cookie on the client-side.
  logger.info(`User logged out. Token to be cleared: ${refreshToken}`);
};
