import express from 'express';
import passport from 'passport';
import multer from 'multer';
import { authorize } from '../middleware/auth.middleware.js';
import { validateBody, validateQuery, validateParams } from '../middleware/validation.middleware.js';
import {
  createSupportRequestSchema,
  addFollowUpMessageSchema,
  getUserSupportRequestsQuerySchema,
  supportRequestIdSchema
} from '../schemas/supportRequest.schema.js';
import {
  createSupportRequest,
  getUserSupportRequests,
  getSupportRequestById,
  addFollowUpMessage,
  markAdminResponseAsRead
} from '../controllers/supportRequest.controller.js';
import { validateAttachments } from '../schemas/supportRequest.schema.js';
import { BadRequestError } from '../utils/AppError.js';

const router = express.Router();

// Configure multer for support request attachments
const storage = multer.memoryStorage();

const attachmentFileFilter = (req, file, cb) => {
  const allowedMimes = [
    'application/pdf',
    'image/jpeg',
    'image/jpg',
    'image/png',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'text/plain'
  ];
  
  if (allowedMimes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new BadRequestError('Loại tệp không được hỗ trợ. Chỉ chấp nhận: PDF, JPG, PNG, DOC, DOCX, TXT'), false);
  }
};

const uploadAttachments = multer({
  storage: storage,
  fileFilter: attachmentFileFilter,
  limits: {
    fileSize: 10 * 1024 * 1024, // 10 MB per file
    files: 5 // Max 5 files
  }
});

// Middleware to validate attachments after multer
const validateAttachmentsMiddleware = (req, res, next) => {
  if (req.files && req.files.length > 0) {
    const validation = validateAttachments(req.files);
    if (!validation.valid) {
      return res.status(400).json({
        success: false,
        message: 'Validation failed',
        errors: validation.errors
      });
    }
  }
  next();
};

// All routes require authentication
router.use(passport.authenticate('jwt', { session: false }));
router.use(authorize(['candidate', 'recruiter']));

/**
 * @route   POST /api/support-requests
 * @desc    Create a new support request
 * @access  Private (Candidate, Recruiter)
 */
router.post(
  '/',
  uploadAttachments.array('attachments', 5),
  validateAttachmentsMiddleware,
  validateBody(createSupportRequestSchema),
  createSupportRequest
);

/**
 * @route   GET /api/support-requests
 * @desc    Get user's support requests
 * @access  Private (Candidate, Recruiter)
 */
router.get(
  '/',
  validateQuery(getUserSupportRequestsQuerySchema),
  getUserSupportRequests
);

/**
 * @route   GET /api/support-requests/:id
 * @desc    Get support request by ID
 * @access  Private (Candidate, Recruiter)
 */
router.get(
  '/:id',
  validateParams(supportRequestIdSchema),
  getSupportRequestById
);

/**
 * @route   POST /api/support-requests/:id/messages
 * @desc    Add follow-up message to support request
 * @access  Private (Candidate, Recruiter)
 */
router.post(
  '/:id/messages',
  validateParams(supportRequestIdSchema),
  uploadAttachments.array('attachments', 5),
  validateAttachmentsMiddleware,
  validateBody(addFollowUpMessageSchema),
  addFollowUpMessage
);

/**
 * @route   PATCH /api/support-requests/:id/read
 * @desc    Mark admin response as read
 * @access  Private (Candidate, Recruiter)
 */
router.patch(
  '/:id/read',
  validateParams(supportRequestIdSchema),
  markAdminResponseAsRead
);

export default router;
