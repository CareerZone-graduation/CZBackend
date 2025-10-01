// src/routes/cv.route.js
import express from 'express';
import passport from 'passport';
import * as cvController from '../controllers/cv.controller.js';
import * as authMiddleware from '../middleware/auth.middleware.js';
import * as validationMiddleware from '../middleware/validation.middleware.js';
import * as cvSchema from '../schemas/cv.schema.js';

const router = express.Router();

// All CV routes require authentication
router.use(passport.authenticate('jwt', { session: false }));

router.route('/')
  .get(cvController.getAllCvsByUser)
  .post(validationMiddleware.validateBody(cvSchema.createCvSchema), cvController.createCv);

router.route('/:id')
  .get(cvController.getCvById)
  .put(validationMiddleware.validateBody(cvSchema.updateCvSchema), cvController.updateCv)
  .delete(cvController.deleteCv);

// Route duplicate CV
router.post('/:id/duplicate', validationMiddleware.validateBody(cvSchema.duplicateCvSchema), cvController.duplicateCv);

// Route tạo CV từ template
router.post('/from-template', validationMiddleware.validateBody(cvSchema.createCvFromTemplateSchema), cvController.createCvFromTemplate);

export default router;
