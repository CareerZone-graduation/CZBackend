import { Router } from 'express';
import * as aiController from '../controllers/ai.controller.js';
import asyncHandler from 'express-async-handler';
import * as authMiddleware from '../middleware/auth.middleware.js';


const router = Router();

router.post('/chat', authMiddleware.authenticated, asyncHandler(aiController.chatWithBot));

export default router;
