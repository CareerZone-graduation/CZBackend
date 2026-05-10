import express from 'express';
import passport from 'passport';
import { recruiterOnly } from '../middleware/auth.middleware.js';
import * as emailTemplateController from '../controllers/emailTemplate.controller.js';

const router = express.Router();

router.use(passport.authenticate('jwt', { session: false }), recruiterOnly);

router.get('/', emailTemplateController.getTemplates);
router.post('/', emailTemplateController.createTemplate);
router.put('/:id', emailTemplateController.updateTemplate);
router.delete('/:id', emailTemplateController.deleteTemplate);

export default router;
