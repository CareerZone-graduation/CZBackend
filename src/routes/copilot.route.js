import express from 'express';
import passport from 'passport';
import * as copilotController from '../controllers/copilot.controller.js';
import { copilotMinuteLimiter, copilotDailyLimiter } from '../middleware/copilotRateLimit.js';

const router = express.Router();

// Route: POST /api/copilot/chat
router.post(
    '/chat',
    passport.authenticate('jwt', { session: false }),
    copilotMinuteLimiter,
    copilotDailyLimiter,
    copilotController.chat
);

// Optional endpoints described in spec, but the core request was /chat:
// router.get('/sessions', passport.authenticate('jwt', { session: false }), copilotController.getSessions);
// router.get('/sessions/:sessionId/messages', passport.authenticate('jwt', { session: false }), copilotController.getSessionMessages);

export default router;
