import { Router } from 'express';
import * as companyController from '../controllers/company.controller.js';
import { authenticate, recruiterOnly } from '../middleware/auth.middleware.js';
import { validateBody, validateParams } from '../middleware/validation.middleware.js';
import { idParamSchema } from '../schemas/common.schema.js';
import { createCompanySchema, updateCompanySchema } from '../schemas/company.schema.js';
import { upload } from '../middleware/upload.middleware.js';

const router = Router();

// Recruiter creates a company
router.post(
  '/',
  authenticate,
  recruiterOnly,
  upload.single('businessRegistrationFile'), // Field name for the file
  companyController.createCompany,
);



// === Recruiter Routes ===
// Đặt các route cụ thể như 'my-company' LÊN TRÊN các route có tham số động
router.get('/my-company', authenticate, recruiterOnly, companyController.getMyCompany);

router.patch(
  '/my-company',
  authenticate,
  recruiterOnly,
  upload.single('businessRegistrationFile'), // Field name for the file
  companyController.updateMyCompany
);

router.post(
  '/my-company/logo',
  authenticate,
  recruiterOnly,
  upload.single('logo'),
  companyController.updateMyCompanyLogo
);


// === Public Routes ===
router.get('/', companyController.getAllCompanies);
router.get('/:id', validateParams(idParamSchema), companyController.getCompanyById);
export default router;
