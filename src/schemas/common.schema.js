import { z } from 'zod';

/**
 * Miscellaneous validation schemas
 */

/**
 * Job alert subscription request validation schema
 * @typedef {Object} JobAlertSubscriptionRequest
 * @property {string} keyword - Search keyword for job alerts
 * @property {string} notificationMethod - Notification method (EMAIL, WEBSOCKET, BOTH)
 */
export const jobAlertSubscriptionSchema = z.object({
  keyword: z.string()
    .min(1, 'Keyword is required')
    .max(100, 'Keyword cannot exceed 100 characters')
    .trim(),
  notificationMethod: z.enum(['EMAIL', 'WEBSOCKET', 'BOTH'], {
    errorMap: () => ({ message: 'Invalid notification method' })
  }).default('EMAIL')
});

/**
 * User CV request validation schema
 * @typedef {Object} UserCVRequest
 * @property {string} name - CV name
 * @property {string} templateId - Template ID
 * @property {string} content - CV content (JSON or HTML)
 */
export const userCVSchema = z.object({
  name: z.string()
    .min(1, 'CV name is required')
    .max(200, 'CV name cannot exceed 200 characters')
    .trim(),
  templateId: z.string()
    .min(1, 'Template ID is required')
    .trim(),
  content: z.string()
    .min(1, 'CV content is required')
});

/**
 * Pagination query validation schema
 * @typedef {Object} PaginationQuery
 * @property {number} page - Page number (default 1)
 * @property {number} limit - Items per page (default 10, max 100)
 */
export const paginationSchema = z.object({
  page: z.string()
    .transform((val) => parseInt(val, 10))
    .refine((val) => val > 0, 'Page must be greater than 0')
    .default('1'),
  limit: z.string()
    .transform((val) => parseInt(val, 10))
    .refine((val) => val > 0 && val <= 100, 'Limit must be between 1 and 100')
    .default('10')
});

/**
 * ID parameter validation schema
 * @typedef {Object} IdParam
 * @property {string} id - MongoDB ObjectId or UUID
 */
export const idParamSchema = z.object({
  id: z.string()
    .min(1, 'ID is required')
    .refine((val) => {
      // Check if it's a valid MongoDB ObjectId (24 hex chars) or UUID
      return /^[0-9a-fA-F]{24}$/.test(val) || 
             /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/.test(val);
    }, 'Invalid ID format')
});

/**
 * File upload validation schema
 * @typedef {Object} FileUpload
 * @property {string} originalname - Original filename
 * @property {string} mimetype - File MIME type
 * @property {number} size - File size in bytes
 */
export const fileUploadSchema = z.object({
  originalname: z.string().min(1, 'Filename is required'),
  mimetype: z.string()
    .refine((type) => ['image/jpeg', 'image/png', 'application/pdf'].includes(type), 
           'File type must be JPEG, PNG, or PDF'),
  size: z.number()
    .max(10 * 1024 * 1024, 'File size cannot exceed 10MB')
});
