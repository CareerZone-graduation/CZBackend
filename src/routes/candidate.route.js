import express from 'express';
import * as candidateController from '../controllers/candidate.controller.js';
import { authenticate, candidateOnly } from '../middleware/auth.middleware.js';
import { validateBody } from '../middleware/validation.middleware.js';
import { uploadAvatar } from '../middleware/upload.middleware.js';
import { candidateProfileSchema } from '../schemas/user.schema.js';

const router = express.Router();

router.use(authenticate, candidateOnly);

router
    .route('/profile')
    .get(candidateController.getProfile)
    .patch(
        validateBody(candidateProfileSchema),
        candidateController.updateProfile
    );

router
    .route('/avatar')
    .patch(
        uploadAvatar,
        candidateController.updateAvatar
    );

export default router;
