import express from 'express';
import * as candidateController from '../controllers/candidate.controller.js';
import { authenticate, candidateOnly } from '../middleware/auth.middleware.js';
import { validateBody, validateParams } from '../middleware/validation.middleware.js';
import { uploadAvatar, uploadCv } from '../middleware/upload.middleware.js';
import { z } from 'zod';
import { candidateProfileSchema, cvSchema } from '../schemas/user.schema.js';
import { idParamSchema } from '../schemas/common.schema.js';

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

// CV Management Routes
router.route('/cvs')
    .post(uploadCv, candidateController.uploadCv)
    .get(candidateController.getCvs);

router.route('/cvs/:cvId/set-default')
    .patch(validateParams(z.object({ cvId: idParamSchema.shape.id })), candidateController.setDefaultCv);

router.route('/cvs/:cvId')
    .delete(validateParams(z.object({ cvId: idParamSchema.shape.id })), candidateController.deleteCv);


export default router;
