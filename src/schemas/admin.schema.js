import { z } from 'zod';


// Schema cho việc thay đổi trạng thái người dùng
export const userStatusSchema = z.object({
  status: z.enum(['active', 'banned'])
});

// Schema cho việc xác thực công ty
export const companyVerificationSchema = z.object({
  verified: z.boolean()
});

// Schema cho company approval/rejection
export const companyApprovalSchema = z.object({
  action: z.enum(['approve', 'reject'])
});

// Schema cho query parameters jobs
export const adminJobsQuerySchema = z.object({
  page: z.coerce.number().min(1).optional().default(1),
  limit: z.coerce.number().min(1).max(100).optional().default(10),
  search: z.string().optional(),
  company: z.string().optional(),
  status: z.enum(['pending', 'approved']).optional(),
  sort: z.string().optional().default('-createdAt')
});

// Schema cho query parameters users
export const adminUsersQuerySchema = z.object({
  page: z.coerce.number().min(1).optional().default(1),
  limit: z.coerce.number().min(1).max(100).optional().default(10),
  search: z.string().optional(),
  status: z.enum(['active', 'banned']).optional(),
  role: z.enum(['candidate', 'recruiter']).optional(),
  sort: z.string().optional().default('-createdAt')
});

// Schema cho query parameters companies
export const adminCompaniesQuerySchema = z.object({
  page: z.coerce.number().min(1).optional().default(1),
  limit: z.coerce.number().min(1).max(100).optional().default(10),
  search: z.string().optional(),
  verified: z.enum(['true', 'false']).optional(),
  sort: z.string().optional().default('-createdAt')
});

// Schema cho params validation
export const idParamsSchema = z.object({
  id: z.string().regex(/^[0-9a-fA-F]{24}$/, 'ID không đúng định dạng MongoDB ObjectId')
});

// Schema cho thống kê
export const statsQuerySchema = z.object({
  startDate: z.string().datetime().optional(),
  endDate: z.string().datetime().optional(),
  period: z.enum(['day', 'week', 'month', 'year']).optional().default('month')
});
