import express from 'express';
import { validateBody } from '../middleware/validation.middleware.js';
import { uploadContactAttachments } from '../middleware/upload.middleware.js';
import { optionalAuth } from '../middleware/optionalAuth.middleware.js';
import { z } from 'zod';
import { createContactRequest } from '../controllers/contact.controller.js';

const router = express.Router();

// Contact form schema - make fields optional for authenticated users
const contactFormSchema = z.object({
  title: z.string().min(5).max(100).optional(), // Tiêu đề yêu cầu
  name: z.string().min(2).max(50).optional(),
  email: z.string().email().optional(),
  phone: z.string().min(10).max(15).optional(),
  company: z.string().optional(),
  category: z.string().min(1),
  message: z.string().min(10).max(500),
  userType: z.enum(['candidate', 'recruiter']).optional()
});

/**
 * @route   POST /api/contact
 * @desc    Submit contact form from landing page
 * @access  Public (with optional authentication)
 */
router.post(
  '/',
  optionalAuth, // Try to authenticate if token provided
  uploadContactAttachments.array('attachments'), // Handle file uploads
  validateBody(contactFormSchema),
  createContactRequest
);

export default router;
