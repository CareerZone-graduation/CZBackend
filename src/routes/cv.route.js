// src/routes/cv.route.js
import express from 'express';
import * as cvController from '../controllers/cv.controller.js';
import { authenticate } from '../middleware/auth.middleware.js';
import { validateBody } from '../middleware/validation.middleware.js';
import { 
  createCvSchema, 
  updateCvSchema, 
  duplicateCvSchema 
} from '../schemas/cv.schema.js';

const router = express.Router();

// Tất cả các route này yêu cầu đăng nhập
router.use(authenticate);

// Routes cho CV
router.route('/')
  .post(validateBody(createCvSchema), cvController.createCv)
  .get(cvController.getAllCvsByUser);

router.route('/:id')
  .get(cvController.getCvById)
  .put(validateBody(updateCvSchema), cvController.updateCv)
  .delete(cvController.deleteCv);

// Route duplicate CV
router.post('/:id/duplicate', validateBody(duplicateCvSchema), cvController.duplicateCv);

export default router;
