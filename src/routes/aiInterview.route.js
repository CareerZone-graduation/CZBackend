import express from 'express';
import passport from 'passport';
import * as validationMiddleware from '../middleware/validation.middleware.js';
import * as authMiddleware from '../middleware/auth.middleware.js';
import * as aiInterviewController from '../controllers/aiInterview.controller.js';

const router = express.Router();

// Tất cả route yêu cầu xác thực candidate
router.use(passport.authenticate('jwt', { session: false }));
router.use(authMiddleware.candidateOnly);

/**
 * @route   POST /api/ai-interview/chat
 * @desc    Gửi tin nhắn chat, nhận lại âm thanh stream và AI text
 * @access  Private/Candidate
 */
router.post('/chat', aiInterviewController.chat);

/**
 * @route   POST /api/ai-interview/tts
 * @desc    Tạo audio stream từ text
 * @access  Private/Candidate
 */
router.post('/tts', aiInterviewController.tts);

/**
 * @route   POST /api/ai-interview/transcribe
 * @desc    Chuyển đổi âm thanh (Base64) thành text (Hỗ trợ timeout dài)
 * @access  Private/Candidate
 */
router.post('/transcribe', aiInterviewController.transcribe);

/**
 * @route   POST /api/ai-interview/end
 * @desc    Kết thúc phiên phỏng vấn AI
 * @access  Private/Candidate
 */
router.post('/end', aiInterviewController.endSession);

/**
 * @route   POST /api/ai-interview/simli/get-session-token
 * @desc    Lấy token session WebRTC của Simli
 * @access  Private/Candidate
 */
router.post('/simli/get-session-token', aiInterviewController.getSimliToken);

/**
 * @route   GET /api/ai-interview/simli/get-ice-servers
 * @desc    Lấy ICE servers của Simli
 * @access  Private/Candidate
 */
router.get('/simli/get-ice-servers', aiInterviewController.getSimliIceServers);

/**
 * @route   GET /api/ai-interview/assemblyai/token
 * @desc    Lấy token của AssemblyAI để sử dụng Real-time transcription
 * @access  Private/Candidate
 */
router.get('/assemblyai/token', aiInterviewController.getAssemblyAIToken);

export default router;
