import rateLimit from 'express-rate-limit';

/**
 * Rate limiting middleware for resend verification email
 * Giới hạn chỉ được gửi lại email 3 lần mỗi 15 phút cho mỗi IP
 */
export const resendVerificationEmailLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 phút
  max: 3, // Giới hạn 3 request mỗi windowMs
  message: {
    success: false,
    message: 'Bạn đã gửi quá nhiều yêu cầu. Vui lòng thử lại sau 15 phút.',
    error: 'TOO_MANY_REQUESTS'
  },
  standardHeaders: true, // Trả về rate limit info trong `RateLimit-*` headers
  legacyHeaders: false, // Tắt `X-RateLimit-*` headers
  // Tùy chọn: Skip rate limiting cho một số trường hợp đặc biệt
  skip: (req) => {
    // Có thể skip cho admin hoặc trong môi trường development
    return process.env.NODE_ENV === 'development' && req.ip === '::1';
  }
});

/**
 * Rate limiting cho verify email endpoint
 * Giới hạn 10 lần mỗi phút
 */
export const verifyEmailLimiter = rateLimit({
  windowMs: 1 * 60 * 1000, // 1 phút
  max: 10, // Giới hạn 10 request mỗi phút
  message: {
    success: false,
    message: 'Quá nhiều yêu cầu xác thực. Vui lòng thử lại sau.',
    error: 'TOO_MANY_REQUESTS'
  },
  standardHeaders: true,
  legacyHeaders: false
});