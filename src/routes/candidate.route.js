import express from 'express';
import passport from 'passport';
import * as candidateController from '../controllers/candidate.controller.js';
import * as candidateOnboardingController from '../controllers/candidateOnboardingController.js';
import * as authMiddleware from '../middleware/auth.middleware.js';
import * as validationMiddleware from '../middleware/validation.middleware.js';
import * as uploadMiddleware from '../middleware/upload.middleware.js';
import { z } from 'zod';
import * as userSchema from '../schemas/user.schema.js';
import * as commonSchema from '../schemas/common.schema.js';
import * as applicationSchema from '../schemas/application.schema.js';

const router = express.Router();

router.use(passport.authenticate('jwt', { session: false }), authMiddleware.candidateOnly);

router
    .route('/my-profile')
    .get(candidateController.getProfile)
    .put(
        validationMiddleware.validateBody(userSchema.candidateProfilePartialSchema),
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
    .patch(validationMiddleware.validateParams(z.object({ cvId: commonSchema.idParamSchema.shape.id })), candidateController.renameCvUpload)
    .delete(validationMiddleware.validateParams(z.object({ cvId: commonSchema.idParamSchema.shape.id })), candidateController.deleteCv);

// Route để lấy danh sách các đơn ứng tuyển của candidate
router.get(
    '/my-applications',
    validationMiddleware.validateQuery(applicationSchema.getCandidateApplicationsQuery),
    candidateController.getMyApplications
);

// Route để lấy chi tiết 1 đơn ứng tuyển của candidate
router.get(
    '/my-applications/:applicationId',
    validationMiddleware.validateParams(applicationSchema.applicationIdParam),
    candidateController.getApplicationById
);

// Onboarding Routes
router.get('/onboarding/status', candidateOnboardingController.getOnboardingStatus);
router.patch('/onboarding/step', candidateOnboardingController.updateOnboardingStep);
router.patch('/onboarding/skip', candidateOnboardingController.skipOnboarding);
router.post('/onboarding/complete', candidateOnboardingController.completeOnboarding);

export default router;
