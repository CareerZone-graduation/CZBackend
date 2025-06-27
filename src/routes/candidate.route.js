import express from 'express';
import * as candidateController from '../controllers/candidate.controller.js';
import { authenticate, candidateOnly } from '../middleware/auth.middleware.js';
import { validateBody } from '../middleware/validation.middleware.js';
import { candidateProfileSchema } from '../schemas/user.schema.js';

const router = express.Router();

router.use(authenticate, candidateOnly);

router
    .route('/profile')
    .get(candidateController.getProfile)
    .put(
        validateBody(candidateProfileSchema),
        candidateController.updateProfile
    );

export default router;
