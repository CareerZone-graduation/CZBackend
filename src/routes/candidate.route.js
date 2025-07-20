import express from 'express';
import passport from 'passport';
import * as candidateController from '../controllers/candidate.controller.js';
import * as authMiddleware from '../middleware/auth.middleware.js';
import * as validationMiddleware from '../middleware/validation.middleware.js';
import * as uploadMiddleware from '../middleware/upload.middleware.js';
import { z } from 'zod';
import * as userSchema from '../schemas/user.schema.js';
import * as commonSchema from '../schemas/common.schema.js';

const router = express.Router();

router.use(passport.authenticate('jwt', { session: false }), authMiddleware.candidateOnly);

router
    .route('/profile')
    .get(candidateController.getProfile)
    .patch(
        validationMiddleware.validateBody(userSchema.candidateProfileSchema),
        candidateController.updateProfile
    );

router
    .route('/avatar')
    .patch(
        uploadMiddleware.uploadAvatar,
        candidateController.updateAvatar
    );

// CV Management Routes
router.route('/cvs')
    .post(uploadMiddleware.uploadCv, candidateController.uploadCv)
    .get(candidateController.getCvs);

router.route('/cvs/:cvId/set-default')
    .patch(validationMiddleware.validateParams(z.object({ cvId: commonSchema.idParamSchema.shape.id })), candidateController.setDefaultCv);

router.route('/cvs/:cvId')
    .delete(validationMiddleware.validateParams(z.object({ cvId: commonSchema.idParamSchema.shape.id })), candidateController.deleteCv);


export default router;
