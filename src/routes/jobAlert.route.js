import { Router } from 'express';
import passport from 'passport';
import * as jobAlertController from '../controllers/jobAlert.controller.js';
import * as authMiddleware from '../middleware/auth.middleware.js';
import * as validationMiddleware from '../middleware/validation.middleware.js';
import * as jobAlertSchema from '../schemas/jobAlert.schema.js';
import * as commonSchema from '../schemas/common.schema.js';

const router = Router();

router.use(passport.authenticate('jwt', { session: false }), authMiddleware.candidateOnly);

router.route('/')
    .post(validationMiddleware.validateBody(jobAlertSchema.createJobAlertSchema), jobAlertController.createJobAlert)
    .get(jobAlertController.getMyJobAlerts);

router.route('/:id')
    .put(validationMiddleware.validateParams(commonSchema.idParamSchema), validationMiddleware.validateBody(jobAlertSchema.updateJobAlertSchema), jobAlertController.updateJobAlert)
    .delete(validationMiddleware.validateParams(commonSchema.idParamSchema), jobAlertController.deleteJobAlert);

// Notification history routes
router.route('/history')
    .get(
        validationMiddleware.validateQuery(jobAlertSchema.getNotificationHistorySchema), 
        jobAlertController.getAllNotificationHistory
    );

router.route('/:id/history')
    .get(
        validationMiddleware.validateParams(commonSchema.idParamSchema),
        validationMiddleware.validateQuery(jobAlertSchema.getNotificationHistorySchema), 
        jobAlertController.getNotificationHistory
    );


export default router;
