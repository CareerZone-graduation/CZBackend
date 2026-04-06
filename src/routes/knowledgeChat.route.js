import express from 'express';
import passport from 'passport';
import * as validationMiddleware from '../middleware/validation.middleware.js';
import * as controller from '../controllers/knowledgeChat.controller.js';
import * as schema from '../schemas/knowledgeChat.schema.js';

const router = express.Router();

// Chỉ cần authenticated, không giới hạn role (giống copilot)
router.use(passport.authenticate('jwt', { session: false }));

router.post('/job/:jobId', validationMiddleware.validateBody(schema.chatSchema), controller.chatJob);
router.post('/company/:recruiterId', validationMiddleware.validateBody(schema.chatSchema), controller.chatCompany);

export default router;