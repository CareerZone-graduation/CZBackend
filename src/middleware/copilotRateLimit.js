import rateLimit from 'express-rate-limit';

/**
 * Rate limiting middleware for Copilot per minute
 * Limit: 30 messages/minute/user
 */
export const copilotMinuteLimiter = rateLimit({
    windowMs: 1 * 60 * 1000, // 1 phút
    max: 30, // 30 messages/minute
    keyGenerator: (req) => {
        return req.user ? req.user._id.toString() : req.ip;
    },
    message: {
        success: false,
        message: 'Bạn đã gửi quá nhiều tin nhắn. Vui lòng thử lại sau 1 phút.',
        error: 'TOO_MANY_REQUESTS'
    },
    standardHeaders: true,
    legacyHeaders: false
});

/**
 * Rate limiting middleware for Copilot per day
 * Limit: 500 messages/day/user
 */
export const copilotDailyLimiter = rateLimit({
    windowMs: 24 * 60 * 60 * 1000, // 1 ngày
    max: 500, // 500 messages/day
    keyGenerator: (req) => {
        return req.user ? req.user._id.toString() : req.ip;
    },
    message: {
        success: false,
        message: 'Bạn đã đạt giới hạn 500 tin nhắn mỗi ngày. Vui lòng quay lại vào ngày mai.',
        error: 'TOO_MANY_REQUESTS'
    },
    standardHeaders: true,
    legacyHeaders: false
});
