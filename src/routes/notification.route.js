import { Router } from 'express';
import passport from 'passport';
import * as notificationController from '../controllers/notification.controller.js';
import * as authMiddleware from '../middleware/auth.middleware.js';
import * as validationMiddleware from '../middleware/validation.middleware.js';
import * as commonSchema from '../schemas/common.schema.js';

const router = Router();

router.use(passport.authenticate('jwt', { session: false }));

router.get('/', notificationController.getNotifications);

router.patch(
  '/:id/read',
  validationMiddleware.validateParams(commonSchema.idParamSchema),
  notificationController.markNotificationAsRead
);

router.patch('/read-all', notificationController.markAllNotificationsAsRead);

export default router;
