// src/routes/cv.route.js
import express from 'express';
import * as cvController from '../controllers/cv.controller.js';
import * as authMiddleware from '../middleware/auth.middleware.js';
import * as validationMiddleware from '../middleware/validation.middleware.js';
import * as cvSchema from '../schemas/cv.schema.js';

const router = express.Router();

// Tất cả các route này yêu cầu đăng nhập
router.use(authMiddleware.authenticate);

// Routes cho CV
router.route('/')
  .post(validationMiddleware.validateBody(cvSchema.createCvSchema), cvController.createCv)
  .get(cvController.getAllCvsByUser);

router.route('/:id')
  .get(cvController.getCvById)
  .put(validationMiddleware.validateBody(cvSchema.updateCvSchema), cvController.updateCv)
  .delete(cvController.deleteCv);

// Route duplicate CV
router.post('/:id/duplicate', validationMiddleware.validateBody(cvSchema.duplicateCvSchema), cvController.duplicateCv);

export default router;
