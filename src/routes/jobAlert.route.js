import { Router } from 'express';
import * as jobAlertController from '../controllers/jobAlert.controller.js';
import { authenticate, candidateOnly } from '../middleware/auth.middleware.js';
import { validateBody, validateParams } from '../middleware/validation.middleware.js';
import { createJobAlertSchema, updateJobAlertSchema } from '../schemas/jobAlert.schema.js';
import { idParamSchema } from '../schemas/common.schema.js';

const router = Router();

router.use(authenticate, candidateOnly);

router.route('/')
    .post(validateBody(createJobAlertSchema), jobAlertController.createJobAlert)
    .get(jobAlertController.getMyJobAlerts);

router.route('/:id')
    .put(validateParams(idParamSchema), validateBody(updateJobAlertSchema), jobAlertController.updateJobAlert)
    .delete(validateParams(idParamSchema), jobAlertController.deleteJobAlert);

export default router;
