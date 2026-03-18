import { Router } from 'express';
import passport from 'passport';
import { authorize } from '../middleware/auth.middleware.js';
import { validateBody } from '../middleware/validation.middleware.js';
import * as interactionController from '../controllers/interaction.controller.js';
import { trackInteractionSchema, batchTrackInteractionSchema } from '../schemas/interaction.schema.js';

const router = Router();

// Yêu cầu user login (Candidate role)
router.use(passport.authenticate('jwt', { session: false }));
router.use(authorize('candidate'));

router.post(
    '/',
    validateBody(trackInteractionSchema),
    interactionController.trackInteraction
);

router.post(
    '/batch',
    validateBody(batchTrackInteractionSchema),
    interactionController.batchTrackInteractions
);

export default router;
