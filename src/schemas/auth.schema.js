import { z } from 'zod';
import { userProfileSchema } from './user.schema.js'; // Import the unified user profile schema

/**
 * Authentication related validation schemas
 */

/**
 * Login request validation schema
 * @typedef {Object} LoginRequest
 * @property {string} username - Username (required, not blank)
 * @property {string} password - Password (required, not blank)
 */
export const loginSchema = z.object({
  username: z.string()
    .min(1, 'Username không được để trống')
    .trim(),
  password: z.string()
    .min(1, 'Password không được để trống')
});

/**
 * Register request validation schema
 * @typedef {Object} RegisterRequest
 * @property {string} username - Username (3-50 chars, alphanumeric + underscore)
 * @property {string} password - Password (8-100 chars, must contain lowercase, uppercase, digit)
 * @property {string} email - Valid email address
 * @property {string} fullname - Full name (2-100 chars)
 * @property {string} roleName - User role name (CANDIDATE, RECRUITER, ADMIN)
 * @property {Object} [profileData] - Optional profile data (candidate/recruiter specific fields)
 */
export const registerSchema = z.object({
  username: z.string()
    .min(1, 'Tên đăng nhập phải từ 3 đến 50 ký tự')
    .max(50, 'Tên đăng nhập phải từ 3 đến 50 ký tự')
    .regex(/^[a-zA-Z0-9_]+$/, 'Tên đăng nhập chỉ được chứa chữ cái, số và dấu gạch dưới')
    .trim(),
  password: z.string()
    .min(1, 'Mật khẩu phải từ 8 đến 100 ký tự')
    .max(100, 'Mật khẩu phải từ 8 đến 100 ký tự')
    // .regex(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).+$/, 'Mật khẩu phải chứa ít nhất một chữ cái thường, một chữ cái in hoa và một số')
    ,
  fullname: z.string()
    .min(1, 'Họ tên phải từ 2 đến 100 ký tự')
    .max(100, 'Họ tên phải từ 2 đến 100 ký tự')
    .trim(),
  email: z.string({
     required_error: 'Email là bắt buộc'
  })
    .email('Email phải đúng định dạng')
    .max(100, 'Email không được dài quá 100 ký tự')
    .toLowerCase()
    .trim(),
  role: z.enum(['candidate', 'recruiter'], { // Renamed userType to roleName
    errorMap: () => ({ message: 'Loại người dùng phải là candidate, recruiter' })
  })
}).and(userProfileSchema.partial()); // Extend with partial userProfileSchema for optional fields

/**
 * Google login request validation schema
 * @typedef {Object} GoogleLoginRequest
 * @property {string} idToken - Google ID token
 * @property {string} [roleName] - Optional user role for new registrations
 */
export const googleLoginSchema = z.object({
  idToken: z.string()
    .min(1, 'Google ID token is required')
    .trim(),
  roleName: z.enum(['CANDIDATE', 'RECRUITER', 'ADMIN'], { // Added optional roleName
    errorMap: () => ({ message: 'Loại người dùng phải là CANDIDATE, RECRUITER hoặc ADMIN' })
  }).optional()
});

/**
 * Schema for change password request
 */
export const changePasswordSchema = z.object({
  currentPassword: z.string()
    .min(1, 'Current password is required'),
  newPassword: z.string()
    .min(6, 'New password must be at least 6 characters')
    .max(100, 'New password must not exceed 100 characters')
});

/**
 * Schema for forgot password request
 */
export const forgotPasswordSchema = z.object({
  email: z.string()
    .email('Please provide a valid email address')
    .min(1, 'Email is required')
});

/**
 * Schema for reset password request
 */
export const resetPasswordSchema = z.object({
  token: z.string()
    .min(1, 'Reset token is required'),
  newPassword: z.string()
    .min(6, 'New password must be at least 6 characters')
    .max(100, 'New password must not exceed 100 characters')
});
