import express from 'express';
import passport from 'passport';
import * as candidateController from '../controllers/candidate.controller.js';
import * as candidateOnboardingController from '../controllers/candidateOnboardingController.js';
import * as recommendationController from '../controllers/recommendation.controller.js';
import * as authMiddleware from '../middleware/auth.middleware.js';
import * as validationMiddleware from '../middleware/validation.middleware.js';
import * as uploadMiddleware from '../middleware/upload.middleware.js';
import { z } from 'zod';
import * as userSchema from '../schemas/user.schema.js';
import * as commonSchema from '../schemas/common.schema.js';
import * as applicationSchema from '../schemas/application.schema.js';
import * as recommendationSchema from '../schemas/recommendation.schema.js';

const router = express.Router();

router.use(passport.authenticate('jwt', { session: false }), authMiddleware.candidateOnly);

router
    .route('/my-profile')
    .get(candidateController.getProfile)
    .put(
        validationMiddleware.validateBody(userSchema.candidateProfilePartialSchema),
        candidateController.updateProfile
    )
    .patch(
        validationMiddleware.validateBody(userSchema.candidateProfilePartialSchema),
        candidateController.updateProfile
    );

// Profile completeness endpoint
router.get(
    '/profile/completeness',
    validationMiddleware.validateQuery(userSchema.profileCompletenessQuerySchema),
    candidateController.getProfileCompleteness
);

// Profile preferences endpoint
router.put(
    '/profile/preferences',
    validationMiddleware.validateBody(userSchema.profilePreferencesSchema),
    candidateController.updateProfilePreferences
);

// Profile recommendations endpoint
router.get(
    '/profile/recommendations',
    candidateController.getProfileRecommendations
);

// Privacy settings endpoint
router.patch(
    '/settings/privacy',
    validationMiddleware.validateBody(userSchema.privacySettingsSchema),
    candidateController.updatePrivacySettings
);

// Get current allow search settings
router.get(
    '/settings/allow-search',
    candidateController.getAllowSearchSettings
);

// Toggle allow search setting with optional CV selection
router.patch(
    '/settings/allow-search',
    validationMiddleware.validateBody(z.object({
        allowSearch: z.boolean(),
        selectedCvId: z.string().optional()
    })),
    candidateController.toggleAllowSearch
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

// Route để lấy dữ liệu CV template của đơn ứng tuyển (cho candidate xem CV của chính mình)
// Hỗ trợ token từ query param (cho iframe) hoặc header Authorization
router.get(
    '/my-applications/:applicationId/render-cv',
    validationMiddleware.validateParams(applicationSchema.applicationIdParam),
    candidateController.getApplicationCVData
);

// Onboarding Routes - Simplified (no session needed)
router.get('/onboarding/status', candidateOnboardingController.getOnboardingStatus);
router.get('/onboarding/recommendations', candidateOnboardingController.getRecommendations);
router.put('/onboarding/update', candidateOnboardingController.updateProfileData);
router.post('/onboarding/upload-avatar', uploadMiddleware.uploadAvatar, candidateOnboardingController.uploadAvatar);
router.post('/onboarding/complete', candidateOnboardingController.completeOnboarding);
router.post('/onboarding/dismiss', candidateOnboardingController.dismissOnboarding);

// Job Recommendation Routes
router.post(
    '/recommendations/generate',
    validationMiddleware.validateBody(recommendationSchema.generateRecommendationsSchema),
    recommendationController.generateRecommendations
);

router.get(
    '/recommendations',
    validationMiddleware.validateQuery(recommendationSchema.getRecommendationsQuerySchema),
    recommendationController.getRecommendations
);

// Route để candidate phản hồi offer (Accept/Decline)
router.patch(
    '/my-applications/:applicationId/respond',
    validationMiddleware.validateParams(applicationSchema.applicationIdParam),
    validationMiddleware.validateBody(applicationSchema.respondToOfferBody),
    candidateController.respondToOffer
);

export default router;
