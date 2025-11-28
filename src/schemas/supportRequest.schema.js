import { z } from 'zod';

// Enums for support request
const categoryEnum = [
  'technical-issue',
  'account-issue',
  'payment-issue',
  'job-posting-issue',
  'application-issue',
  'general-inquiry'
];

const statusEnum = ['pending', 'in-progress', 'resolved', 'closed'];

const priorityEnum = ['low', 'medium', 'high', 'urgent'];

const allowedFileTypes = ['pdf', 'jpg', 'jpeg', 'png', 'doc', 'docx', 'txt'];

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB in bytes
const MAX_FILES = 5;

// Helper function to validate file type from filename
const isValidFileType = (filename) => {
  if (!filename) return false;
  const extension = filename.split('.').pop()?.toLowerCase();
  return allowedFileTypes.includes(extension);
};

// Schema for creating a new support request
export const createSupportRequestSchema = z.object({
  subject: z.string({ required_error: 'Tiêu đề là bắt buộc' })
    .trim()
    .min(5, 'Tiêu đề phải có ít nhất 5 ký tự')
    .max(200, 'Tiêu đề không được vượt quá 200 ký tự'),
  
  description: z.string({ required_error: 'Mô tả là bắt buộc' })
    .trim()
    .min(20, 'Mô tả phải có ít nhất 20 ký tự')
    .max(5000, 'Mô tả không được vượt quá 5000 ký tự'),
  
  category: z.enum(categoryEnum, {
    required_error: 'Danh mục là bắt buộc',
    invalid_type_error: 'Danh mục không hợp lệ'
  })
});

// Schema for adding a follow-up message
export const addFollowUpMessageSchema = z.object({
  content: z.string({ required_error: 'Tin nhắn là bắt buộc' })
    .trim()
    .min(1, 'Tin nhắn không được để trống')
    .max(5000, 'Tin nhắn không được vượt quá 5000 ký tự')
});

// Schema for admin response
export const respondToRequestSchema = z.object({
  response: z.string({ required_error: 'Phản hồi là bắt buộc' })
    .trim()
    .min(1, 'Phản hồi không được để trống')
    .max(5000, 'Phản hồi không được vượt quá 5000 ký tự'),
  
  statusUpdate: z.enum(statusEnum).optional(),
  
  priorityUpdate: z.enum(priorityEnum).optional()
});

// Schema for updating status
export const updateStatusSchema = z.object({
  status: z.enum(statusEnum, {
    required_error: 'Trạng thái là bắt buộc',
    invalid_type_error: 'Trạng thái không hợp lệ'
  })
});

// Schema for updating priority
export const updatePrioritySchema = z.object({
  priority: z.enum(priorityEnum, {
    required_error: 'Độ ưu tiên là bắt buộc',
    invalid_type_error: 'Độ ưu tiên không hợp lệ'
  })
});

// Schema for filtering/searching support requests (user)
export const getSupportRequestsQuerySchema = z.object({
  page: z.coerce.number().int().min(1, 'Trang phải lớn hơn 0').default(1),
  limit: z.coerce.number().int().min(1, 'Limit phải lớn hơn 0').max(100, 'Limit không được vượt quá 100').default(10),
  status: z.enum(statusEnum).optional(),
  category: z.enum(categoryEnum).optional(),
  sortBy: z.string().optional()
});

// Schema for filtering/searching support requests (admin) - comprehensive version
export const getAdminSupportRequestsQuerySchema = z.object({
  page: z.coerce.number().int().min(1, 'Trang phải lớn hơn 0').default(1),
  limit: z.coerce.number().int().min(1, 'Limit phải lớn hơn 0').max(100, 'Limit không được vượt quá 100').default(10),
  status: z.string().optional(), // Allow comma-separated values like "pending,in-progress"
  category: z.enum(categoryEnum).optional(),
  priority: z.enum(priorityEnum).optional(),
  userType: z.enum(['candidate', 'recruiter']).optional(),
  keyword: z.string().trim().max(200, 'Từ khóa không được vượt quá 200 ký tự').optional(),
  fromDate: z.coerce.date().optional(),
  toDate: z.coerce.date().optional(),
  isGuest: z.enum(['true', 'false']).optional(),
  sortBy: z.string().default('-createdAt')
}).refine(data => {
  // If both dates are provided, fromDate must be before or equal to toDate
  if (data.fromDate && data.toDate) {
    return data.fromDate <= data.toDate;
  }
  return true;
}, {
  message: 'Ngày bắt đầu phải trước hoặc bằng ngày kết thúc',
  path: ['toDate']
});

// Alias for user-facing support requests query (same as admin but for consistency)
export const getUserSupportRequestsQuerySchema = getSupportRequestsQuerySchema;

// Schema for analytics query
export const getAnalyticsQuerySchema = z.object({
  fromDate: z.coerce.date().optional(),
  toDate: z.coerce.date().optional()
}).refine(data => {
  // If both dates are provided, fromDate must be before or equal to toDate
  if (data.fromDate && data.toDate) {
    return data.fromDate <= data.toDate;
  }
  return true;
}, {
  message: 'Ngày bắt đầu phải trước hoặc bằng ngày kết thúc',
  path: ['toDate']
});

// Schema for validating file attachments (used in middleware/controller)
export const validateAttachments = (files) => {
  const errors = [];

  if (!files || files.length === 0) {
    return { valid: true, errors };
  }

  // Check number of files
  if (files.length > MAX_FILES) {
    errors.push(`Số lượng file không được vượt quá ${MAX_FILES}`);
    return { valid: false, errors };
  }

  // Check each file
  for (const file of files) {
    // Check file size
    if (file.size > MAX_FILE_SIZE) {
      errors.push(`File "${file.originalname}" vượt quá kích thước cho phép (10MB)`);
    }

    // Check file type
    if (!isValidFileType(file.originalname)) {
      errors.push(`File "${file.originalname}" có định dạng không được hỗ trợ. Chỉ chấp nhận: ${allowedFileTypes.join(', ')}`);
    }
  }

  return {
    valid: errors.length === 0,
    errors
  };
};

// Schema for validating support request ID in params
export const supportRequestIdSchema = z.object({
  id: z.string().regex(/^[0-9a-fA-F]{24}$/, 'ID yêu cầu hỗ trợ không hợp lệ')
});

// Export enums directly for use in tests and other modules
export { categoryEnum, statusEnum, priorityEnum };

// Export constants for use in other modules
export const SUPPORT_REQUEST_CONSTANTS = {
  categoryEnum,
  statusEnum,
  priorityEnum,
  allowedFileTypes,
  MAX_FILE_SIZE,
  MAX_FILES
};
