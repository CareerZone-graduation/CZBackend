import express from 'express';
import passport from 'passport';
import * as validationMiddleware from '../middleware/validation.middleware.js';
import * as authMiddleware from '../middleware/auth.middleware.js';
import * as rateLimitAuthMiddleware from '../middleware/rateLimitAuth.middleware.js';
import * as authSchema from '../schemas/auth.schema.js';
import * as authController from '../controllers/auth.controller.js';

const router = express.Router();

// Đăng ký vẫn như cũ
router.post('/register', validationMiddleware.validateBody(authSchema.registerSchema), authController.register);

// Đăng nhập bằng email/password
router.post(
    '/login',
    validationMiddleware.validateBody(authSchema.loginSchema),
    authMiddleware.handleLocalAuth,
    authController.login
);

// Google Sign-In (Client-side flow)
router.post('/google-login', authController.googleLogin);


// Lấy thông tin người dùng hiện tại (bảo vệ bằng JWT)
router.get('/me', passport.authenticate('jwt', { session: false }), authController.getMe);

// Các route khác cũng được bảo vệ bằng 'jwt'
router.post('/logout', passport.authenticate('jwt', { session: false }), authController.logout);
router.patch('/change-password', passport.authenticate('jwt', { session: false }), validationMiddleware.validateBody(authSchema.changePasswordSchema), authController.changePassword);

// Quên mật khẩu
router.post('/forgot-password', validationMiddleware.validateBody(authSchema.emailSchema), authController.forgotPassword);
router.post('/reset-password', validationMiddleware.validateBody(authSchema.resetPasswordSchema), authController.resetPassword);

// Gửi lại email xác thực
router.post('/resend-verification', 
  rateLimitAuthMiddleware.resendVerificationEmailLimiter,
  validationMiddleware.validateBody(authSchema.emailSchema), 
  authController.resendVerificationEmail
);

// Các route không thay đổi
router.post('/refresh', authController.refreshToken);
router.get('/verify-email', 
  rateLimitAuthMiddleware.verifyEmailLimiter,
  validationMiddleware.validateQuery(authSchema.verifyEmailSchema), 
  authController.verifyEmail
);

export default router;
