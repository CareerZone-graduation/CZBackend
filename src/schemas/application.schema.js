import { z } from 'zod';

/**
 * Application related validation schemas
 */

/**
 * Apply job request validation schema
 * @typedef {Object} ApplyJobRequest
 * @property {string} coverLetter - Cover letter content (optional, max 2000 chars)
 * @property {string} cvName - Name of the CV file
 * @property {string} cvPath - Path/URL of the CV file
 */
export const applyJobSchema = z.object({
  coverLetter: z.string()
    .max(2000, 'Cover letter không được dài quá 2000 ký tự')
    .trim()
    .optional(),
  cvName: z.string()
    .min(1, 'Tên CV không được để trống')
    .max(200, 'Tên CV không được dài quá 200 ký tự')
    .trim(),
  cvPath: z.string()
    .min(1, 'Đường dẫn CV không được để trống')
    .trim()
});

/**
 * Update application status schema (for recruiters/admins)
 * @typedef {Object} UpdateApplicationRequest
 * @property {string} status - New application status
 * @property {string} feedback - Optional feedback
 */
export const updateApplicationSchema = z.object({
  status: z.enum(['PENDING', 'REVIEWED', 'SHORTLISTED', 'REJECTED', 'HIRED', 'WITHDRAWN'], { // Added enum for status
    errorMap: () => ({ message: 'Trạng thái ứng tuyển không hợp lệ' })
  }),
  feedback: z.string()
    .max(1000, 'Feedback không được dài quá 1000 ký tự')
    .trim()
    .optional()
});
