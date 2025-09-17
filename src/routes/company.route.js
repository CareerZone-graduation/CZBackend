import { Router } from 'express';
import passport from 'passport';
import * as companyController from '../controllers/company.controller.js';
import * as authMiddleware from '../middleware/auth.middleware.js';
import * as validationMiddleware from '../middleware/validation.middleware.js';
import * as commonSchema from '../schemas/common.schema.js';
import * as companySchema from '../schemas/company.schema.js';
import * as uploadMiddleware from '../middleware/upload.middleware.js';

const router = Router();

// Recruiter creates a company
router.post(
  '/',
  passport.authenticate('jwt', { session: false }),
  authMiddleware.recruiterOnly,
  uploadMiddleware.upload.single('businessRegistrationFile'), // Field name for the file
  companyController.createCompany,
);



// === Recruiter Routes ===
// Đặt các route cụ thể như 'my-company' LÊN TRÊN các route có tham số động
router.get('/my-company', passport.authenticate('jwt', { session: false }), authMiddleware.recruiterOnly, companyController.getMyCompany);

router.get('/my-company/address', passport.authenticate('jwt', { session: false }), authMiddleware.recruiterOnly, companyController.getMyCompanyAddress);

router.patch(
  '/my-company',
  passport.authenticate('jwt', { session: false }),
  authMiddleware.recruiterOnly,
  uploadMiddleware.upload.single('businessRegistrationFile'), // Field name for the file
  companyController.updateMyCompany
);

router.post(
  '/my-company/logo',
  passport.authenticate('jwt', { session: false }),
  authMiddleware.recruiterOnly,
  uploadMiddleware.upload.single('logo'),
  companyController.updateMyCompanyLogo
);


// === Public Routes ===
router.get('/', companyController.getAllCompanies);

// Company jobs endpoint with comprehensive logging and validation
router.get('/:id/jobs', 
  validationMiddleware.validateParams(commonSchema.idParamSchema),
  validationMiddleware.validateQuery(companySchema.companyJobsQuerySchema),
  companyController.getJobsByCompany,
);

router.get('/:id', validationMiddleware.validateParams(commonSchema.idParamSchema), companyController.getCompanyById);
export default router;
