import { Router } from 'express';
import * as notificationController from '../controllers/notification.controller.js';
import { authenticate } from '../middleware/auth.middleware.js';
import { validateParams } from '../middleware/validation.middleware.js';
import { idParamSchema } from '../schemas/common.schema.js';

const router = Router();

router.use(authenticate);

router.get('/', notificationController.getNotifications);

router.patch(
  '/:id/read',
  validateParams(idParamSchema),
  notificationController.markNotificationAsRead
);

router.patch('/read-all', notificationController.markAllNotificationsAsRead);

export default router;
