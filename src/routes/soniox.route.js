import express from 'express';
import * as sonioxController from '../controllers/soniox.controller.js';
import { authenticated } from '../middleware/auth.middleware.js';
import passport from 'passport';

const router = express.Router();

/**
 * @route   GET /api/soniox/temporary-api-key
 * @desc    Get temporary Soniox API key for voice search
 * @access  Private (requires authentication)
 */
router.get('/temporary-api-key', passport.authenticate('jwt', { session: false }),
    authenticated, sonioxController.getTemporaryApiKey);

export default router;
