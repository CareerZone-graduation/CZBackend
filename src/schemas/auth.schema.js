import { z } from 'zod';

/**
 * Authentication related validation schemas
 */

export const loginSchema = z.object({
  username: z.string().min(1, 'Username không được để trống').trim(),
  password: z.string().min(1, 'Password không được để trống'),
});

export const registerSchema = z.object({
  username: z.string()
    .min(3, 'Tên đăng nhập phải từ 3 đến 50 ký tự')
    .max(50, 'Tên đăng nhập phải từ 3 đến 50 ký tự')
    .regex(/^[a-zA-Z0-9_]+$/, 'Tên đăng nhập chỉ được chứa chữ cái, số và dấu gạch dưới')
    .trim(),
  password: z.string()
    .min(8, 'Mật khẩu phải từ 8 đến 100 ký tự')
    .max(100, 'Mật khẩu phải từ 8 đến 100 ký tự'),
  fullname: z.string()
    .min(2, 'Họ tên phải từ 2 đến 100 ký tự')
    .max(100, 'Họ tên phải từ 2 đến 100 ký tự')
    .trim(),
  email: z.string({
     required_error: 'Email là bắt buộc'
  })
    .email('Email phải đúng định dạng')
    .max(100, 'Email không được dài quá 100 ký tự')
    .toLowerCase()
    .trim(),
  role: z.enum(['candidate', 'recruiter'], {
    errorMap: () => ({ message: 'Loại người dùng phải là candidate hoặc recruiter' })
  })
});

export const googleLoginSchema = z.object({
  idToken: z.string().min(1, 'Google ID token is required').trim(),
});

export const emailSchema = z.object({
  email: z.string().email('Email không hợp lệ').trim(),
});

export const verifyEmailSchema = z.object({
    token: z.string().min(1, 'Token xác thực là bắt buộc'),
});

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1, 'Mật khẩu hiện tại là bắt buộc'),
  newPassword: z.string()
    .min(8, 'Mật khẩu mới phải có ít nhất 8 ký tự')
    .max(100, 'Mật khẩu mới không được dài quá 100 ký tự'),
});

export const resetPasswordSchema = z.object({
  newPassword: z.string()
    .min(8, 'Mật khẩu mới phải có ít nhất 8 ký tự')
    .max(100, 'Mật khẩu mới không được dài quá 100 ký tự'),
});
